import os
import uuid
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from pydantic import BaseModel
from sqlalchemy import text, func
from sqlalchemy.orm import Session

import stripe
import httpx

from backend.routes.auth    import router as auth_router, get_current_user
from backend.routes.leads   import router as leads_router
from backend.routes.billing import router as billing_router
from backend.routes.pixel_route   import router as pixel_router

from backend.db import get_db
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message
from backend.services.alerts    import send_hot_alert

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# OPENAPI / SWAGGER
# ─────────────────────────────────────────────
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title="LeadRankerAI SaaS",
        version="1.0.0",
        description="## Authentication\n\n"
                    "1. Call **POST /api/v1/auth/login** with your email & password\n"
                    "2. Copy the `access_token` from the response\n"
                    "3. Click **Authorize** (top right) → paste `Bearer <your_token>`",
        routes=app.routes,
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Paste your JWT token here. Get it from POST /api/v1/auth/login"
        }
    }
    public = {"/api/v1/auth/login", "/api/v1/auth/register",
              "/api/v1/auth/verify", "/api/v1/auth/forgot-password",
              "/api/v1/auth/reset-password", "/api/v1/auth/google/login",
              "/api/v1/auth/google/callback", "/health",
              "/auth/google/callback", "/auth/google/login",
              "/auth/register", "/auth/login", "/auth/verify",
              "/api/v1/ingest/pixel", "/api/v1/ingest/portal-data"}
    for path, methods in schema.get("paths", {}).items():
        if path not in public:
            for method in methods.values():
                method.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return schema

app = FastAPI(
    title="LeadRankerAI SaaS",
    description="AI-powered lead scoring for real estate brokerages",
    version="1.0.0",
)
app.openapi = custom_openapi

# ─────────────────────────────────────────────
# ROUTERS
# ─────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(billing_router)
app.include_router(pixel_router)

# ─────────────────────────────────────────────
# CORS
# allow_credentials must be False when allow_origins=["*"]
# JWT travels in Authorization header so this is safe
# ─────────────────────────────────────────────
IS_DEV = os.getenv("ENV", "development") != "production"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if IS_DEV else [
        "https://app.leadrankerai.com",
        "https://leadrankerai.com",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ─────────────────────────────────────────────
# BACKWARD-COMPAT REDIRECTS (Google OAuth old paths)
# ─────────────────────────────────────────────
@app.get("/auth/google/callback")
async def _google_callback_compat(request: Request):
    qs  = request.url.query
    url = f"/api/v1/auth/google/callback?{qs}" if qs else "/api/v1/auth/google/callback"
    return RedirectResponse(url=url, status_code=307)

@app.get("/auth/google/login")
async def _google_login_compat():
    return RedirectResponse(url="/api/v1/auth/google/login", status_code=307)

@app.get("/auth/verify")
async def _verify_compat(request: Request):
    qs  = request.url.query
    url = f"/api/v1/auth/verify?{qs}" if qs else "/api/v1/auth/verify"
    return RedirectResponse(url=url, status_code=307)

@app.post("/auth/register")
async def _register_compat():
    return RedirectResponse(url="/api/v1/auth/register", status_code=307)

@app.post("/auth/login")
async def _login_compat():
    return RedirectResponse(url="/api/v1/auth/login", status_code=307)


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────
class LeadInput(BaseModel):
    name:     str | None = None
    email:    str | None = None
    phone:    str | None = None
    message:  str
    source:   str = "manual"
    campaign: str | None = None

class InviteInput(BaseModel):
    email: str


# ─────────────────────────────────────────────
# BILLING HELPER  (used by multiple routes)
# ─────────────────────────────────────────────
def get_billing_status(db: Session, brokerage_id: str) -> dict:
    PLAN_LIMITS = {"trial": 50, "starter": 1000, "team": 5000}

    usage = db.execute(text("""
        SELECT COUNT(*) FROM lead_scores
        WHERE brokerage_id = :id
          AND created_at >= date_trunc('month', NOW())
    """), {"id": brokerage_id}).scalar() or 0

    row   = db.execute(
        text("SELECT plan FROM brokerages WHERE id = :id"),
        {"id": brokerage_id}
    ).fetchone()

    plan  = (row[0] or "trial").lower() if row else "trial"
    limit = PLAN_LIMITS.get(plan, 50)

    return {
        "plan":      plan,
        "usage":     usage,
        "limit":     limit,
        "remaining": max(0, limit - usage),
        "percent":   int((usage / limit) * 100) if limit > 0 else 0,
        "blocked":   usage >= limit,
    }


# ─────────────────────────────────────────────
# CORE LEAD SAVE  (shared by score + inbound + pixel)
# ─────────────────────────────────────────────
def save_lead(db, brokerage_id, user_email, payload, ai):
    is_lead = ai.get("is_lead", False)
    score   = int(ai.get("urgency_score", 0))

    if not is_lead:
        bucket, score = "IGNORE", 0
    elif score >= 80:
        bucket = "HOT"
    elif score >= 50:
        bucket = "WARM"
    else:
        bucket = "COLD"

    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=user_email,
        input_payload={**payload, "is_lead": is_lead},
        urgency_score=score if is_lead else None,
        sentiment=ai.get("sentiment"),
        ai_recommendation=ai.get("recommendation"),
        score=score,
        bucket=bucket,
        created_at=datetime.now(timezone.utc)
    )
    db.add(lead)
    db.commit()

    if bucket == "HOT":
        owner = db.execute(text(
            "SELECT email FROM users WHERE brokerage_id = :bid LIMIT 1"
        ), {"bid": brokerage_id}).fetchone()
        if owner:
            send_hot_alert(to_email=owner.email, lead_data={**payload, "score": score})

    return lead, bucket, score


# ─────────────────────────────────────────────
# POST /leads/score
# ─────────────────────────────────────────────
@app.post("/leads/score")
def score_lead(
    lead: LeadInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    billing = get_billing_status(db, user["brokerage_id"])
    if billing["blocked"]:
        raise HTTPException(402, "Monthly quota exceeded. Please upgrade your plan.")

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id = :i"),
        {"i": user["brokerage_id"]}
    ).fetchone()
    industry = row.industry if row else "real_estate"

    ai = analyze_lead_message(lead.message, industry)

    if not ai.get("is_lead", False):
        return {
            "score":          0,
            "bucket":         "IGNORE",
            "sentiment":      ai.get("sentiment", "neutral"),
            "recommendation": ai.get("recommendation", ""),
            "billing":        get_billing_status(db, user["brokerage_id"])
        }

    payload = {
        "name": lead.name, "email": lead.email, "phone": lead.phone,
        "message": lead.message, "source": lead.source,
        "campaign": lead.campaign, "entities": ai.get("entities", {})
    }

    lead_obj, bucket, score = save_lead(
        db, user["brokerage_id"], user["sub"], payload, ai
    )

    return {
        "score":          score,
        "bucket":         bucket,
        "sentiment":      ai["sentiment"],
        "recommendation": ai["recommendation"],
        "billing":        get_billing_status(db, user["brokerage_id"])
    }


# ─────────────────────────────────────────────
# POST /inbound/email
# ─────────────────────────────────────────────
async def fetch_full_email(email_id: str):
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://api.resend.com/emails/receiving/{email_id}",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            timeout=10
        )
        if res.status_code != 200:
            logger.error(f"Failed to fetch email: {res.text}")
            return None
        return res.json()


@app.post("/inbound/email")
async def inbound_email(request: Request, db: Session = Depends(get_db)):
    try:
        payload   = await request.json()
        data      = payload.get("data", {})
        email_id  = data.get("email_id")
        if not email_id:
            return {"ok": True}

        email_full = await fetch_full_email(email_id)
        if not email_full:
            return {"ok": True}

        to_list    = email_full.get("to", [])
        from_email = email_full.get("from", "")
        subject    = email_full.get("subject", "")
        text_msg   = email_full.get("text") or email_full.get("html") or ""

        if not text_msg:
            return {"ok": True}

        to_email = to_list[0] if isinstance(to_list, list) else to_list
        if "+" not in to_email:
            return {"ok": True}

        brokerage_id = to_email.split("+")[1].split("@")[0]

        row = db.execute(
            text("SELECT industry FROM brokerages WHERE id = :i"),
            {"i": brokerage_id}
        ).fetchone()
        if not row:
            return {"ok": True}

        ai = analyze_lead_message(f"{subject}\n\n{text_msg}", row.industry)
        save_lead(db, brokerage_id, from_email, {
            "name": None, "email": from_email, "phone": None,
            "message": f"{subject}\n\n{text_msg}", "source": "email", "campaign": None
        }, ai)

        return {"status": "received"}
    except Exception:
        logger.exception("Email ingest failed")
        return {"ok": True}


# ─────────────────────────────────────────────
# POST /inbound/{brokerage_id}
# ─────────────────────────────────────────────
@app.post("/inbound/{brokerage_id}")
async def inbound_webhook(
    brokerage_id: str,
    lead: LeadInput,
    db: Session = Depends(get_db)
):
    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id = :i"),
        {"i": brokerage_id}
    ).fetchone()
    if not row:
        raise HTTPException(404, "Brokerage not found")

    ai      = analyze_lead_message(lead.message, row.industry)
    payload = {
        "name": lead.name, "email": lead.email, "phone": lead.phone,
        "message": lead.message, "source": lead.source,
        "campaign": lead.campaign, "entities": ai.get("entities", {})
    }
    _, bucket, score = save_lead(
        db, brokerage_id, lead.email or "unknown", payload, ai
    )
    return {"status": "received", "bucket": bucket, "score": score}


# ─────────────────────────────────────────────
# GET /leads/history
# ─────────────────────────────────────────────
@app.get("/leads/history")
def leads_history(
    limit: int = 50, offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    rows = (
        db.query(LeadScore)
        .filter(LeadScore.brokerage_id == user["brokerage_id"])
        .order_by(LeadScore.created_at.desc())
        .limit(limit).offset(offset).all()
    )
    return {"data": [{
        "id":             r.id,
        "name":           r.input_payload.get("name"),
        "email":          r.input_payload.get("email"),
        "phone":          r.input_payload.get("phone"),
        "campaign":       r.input_payload.get("campaign"),
        "source":         r.input_payload.get("source"),
        "message":        r.input_payload.get("message"),
        "score":          r.score,
        "bucket":         r.bucket,
        "sentiment":      r.sentiment,
        "created_at":     r.created_at.isoformat(),
        "recommendation": r.ai_recommendation
    } for r in rows]}


# ─────────────────────────────────────────────
# GET /leads/stats
# ─────────────────────────────────────────────
@app.get("/leads/stats")
def leads_stats(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = user["brokerage_id"]
    def c(q): return q.scalar() or 0
    return {
        "total": c(db.query(func.count(LeadScore.id)).filter(
            LeadScore.brokerage_id == bid)),
        "hot":   c(db.query(func.count(LeadScore.id)).filter(
            LeadScore.brokerage_id == bid, LeadScore.bucket == "HOT")),
        "warm":  c(db.query(func.count(LeadScore.id)).filter(
            LeadScore.brokerage_id == bid, LeadScore.bucket == "WARM")),
        "cold":  c(db.query(func.count(LeadScore.id)).filter(
            LeadScore.brokerage_id == bid, LeadScore.bucket == "COLD")),
    }


# ─────────────────────────────────────────────
# GET /settings/connections
# ─────────────────────────────────────────────
@app.get("/settings/connections")
def get_connections(user=Depends(get_current_user), db: Session = Depends(get_db)):
    bid = user["brokerage_id"]

    # Also return the plugin API key so ConnectionsDetail can show it
    row = db.execute(
        text("SELECT api_key FROM brokerages WHERE id = :id"),
        {"id": bid}
    ).fetchone()

    return {
        "email_forwarding": f"leads+{bid}@leadrankerai.com",
        "webhook_url":      f"https://api.leadrankerai.com/inbound/{bid}",
        "plugin_api_key":   row.api_key if row else "",
        "status":           "connected"
    }


# ─────────────────────────────────────────────
# POST /api/v1/invite-partner
# ─────────────────────────────────────────────
@app.post("/api/v1/invite-partner")
async def invite_partner(data: InviteInput, user=Depends(get_current_user)):
    bid = user.get("brokerage_id")
    try:
        import resend
        resend.Emails.send({
            "from":    "LeadRanker <onboarding@leadrankerai.com>",
            "to":      [data.email],
            "subject": "Invitation to Connect: LeadRanker Tech Partnership",
            "html":    f"""
                <h3>Hello Developer,</h3>
                <p>Webhook URL: https://api.leadrankerai.com/inbound/{bid}</p>
                <p>Docs: <a href="https://api.leadrankerai.com/docs">API Docs</a></p>
            """
        })
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Resend error: {e}")
        raise HTTPException(500, "Failed to send invite email")


# ─────────────────────────────────────────────
# GET /api/v1/billing/status
# ─────────────────────────────────────────────
@app.get("/api/v1/billing/status")
def billing_status_route(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    status = get_billing_status(db, user["brokerage_id"])
    row    = db.execute(
        text("SELECT plan FROM brokerages WHERE id = :id"),
        {"id": user["brokerage_id"]}
    ).fetchone()
    plan = row[0] if row else "trial"
    PLAN_NAMES = {"trial": "Free Trial", "starter": "Starter", "team": "Team"}
    return {
        "plan":      plan,
        "plan_name": PLAN_NAMES.get(plan, plan.title()),
        "usage":     status["usage"],
        "limit":     status["limit"],
        "remaining": status["remaining"],
        "percent":   status["percent"],
        "blocked":   status["blocked"],
    }


# ─────────────────────────────────────────────
# MIDDLEWARE  — OPTIONS must pass through for CORS
# ─────────────────────────────────────────────
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if "/billing/webhook" in request.url.path:
        return await call_next(request)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 1_000_000:
        raise HTTPException(413, "Payload too large")
    return await call_next(request)


# ─────────────────────────────────────────────
# GET /health
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}