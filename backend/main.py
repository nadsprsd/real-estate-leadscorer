import os
import uuid
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import RedirectResponse, JSONResponse

from pydantic import BaseModel
from sqlalchemy import text, func
from sqlalchemy.orm import Session

import stripe
import httpx

from backend.routes.auth    import router as auth_router, get_current_user
from backend.routes.leads   import router as leads_router
from backend.routes.billing import router as billing_router
from backend.routes.pixel_route import router as pixel_router

from backend.db import get_db
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message
from backend.services.alerts    import send_hot_alert

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# CORS — defined FIRST before anything else
# This must be the FIRST middleware added.
# ─────────────────────────────────────────────

# All origins that are allowed to call the API.
# Add any new WordPress client domains here.
ALLOWED_ORIGINS = [
    "https://app.leadrankerai.com",
    "https://leadrankerai.com",
    "https://www.leadrankerai.com",
    "https://www.bizgrowonline.com",
    "https://bizgrowonline.com",
    # local dev
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost",
    "http://127.0.0.1",
]

# ─────────────────────────────────────────────
# APP
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
            "description": "Paste your JWT token here."
        }
    }
    public = {
        "/api/v1/auth/login", "/api/v1/auth/register",
        "/api/v1/auth/verify", "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password", "/api/v1/auth/google/login",
        "/api/v1/auth/google/callback", "/health",
        "/auth/google/callback", "/auth/google/login",
        "/auth/register", "/auth/login", "/auth/verify",
        "/api/v1/ingest/pixel", "/api/v1/ingest/portal-data",
    }
    for path, methods in schema.get("paths", {}).items():
        if path not in public:
            for method in methods.values():
                method.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return schema


# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app = FastAPI(
    title="LeadRankerAI SaaS",
    description="AI-powered lead scoring for real estate brokerages",
    version="1.0.0",
)
# ── GLOBAL RATE LIMITER (OUTERMOST LAYER) ──
from collections import defaultdict
import time
from fastapi.responses import JSONResponse

request_counts = defaultdict(list)
RATE_LIMITS = {
    "/leads/score": (20, 60),
    "/api/v1/ranky/chat": (15, 60),
    "/inbound/": (30, 60)
}

@app.middleware("http")
async def ip_rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    path = request.url.path
    now = time.time()
    
    for route, (limit, window) in RATE_LIMITS.items():
        if path.startswith(route):
            key = f"{ip}:{path}"
            request_counts[key] = [t for t in request_counts[key] if now - t < window]
            if len(request_counts[key]) >= limit:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            request_counts[key].append(now)
            break
    return await call_next(request)


# Rate limiting middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.mount("/static", StaticFiles(directory="/home/ubuntu/leadrankerai/static"), name="static")
app.openapi = custom_openapi

# ── CORS middleware — MUST be added before routers ─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(billing_router)
app.include_router(pixel_router)


# ─────────────────────────────────────────────
# MIDDLEWARE — body size limit
# OPTIONS must always pass through untouched
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
# BILLING HELPER
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
# CORE LEAD SAVE
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
@limiter.limit("20/minute")
def score_lead(
    request: Request,
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
@limiter.limit("30/minute")
async def inbound_email(request: Request, db: Session = Depends(get_db)):
    try:
        payload    = await request.json()
        data       = payload.get("data", {})
        email_id   = data.get("email_id")
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
            "message": f"{subject}\n\n{text_msg}",
            "source": "email", "campaign": None
        }, ai)

        return {"status": "received"}
    except Exception:
        logger.exception("Email ingest failed")
        return {"ok": True}


# ─────────────────────────────────────────────
# POST /inbound/{brokerage_id}
# ─────────────────────────────────────────────
@app.post("/inbound/{brokerage_id}")
@limiter.limit("30/minute")
async def inbound_webhook(
    request: Request,
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
# GET /health
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "env": os.getenv("ENV", "development")}
# ─────────────────────────────────────────────
# ERROR REPORTING ENDPOINT
# ─────────────────────────────────────────────
class ErrorReport(BaseModel):
    error_type: str
    page: str
    action: str
    message: str
    user_email: str = None

@app.post("/api/v1/report-error")
@limiter.limit("10/minute")
async def report_error(request: Request):
    report = request
    body = await report.json()
    logger.info(f"report-error body: {body}")
    report = ErrorReport(**body)
    import httpx, datetime
    timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": "LeadRankerAI Alerts <notifications@leadrankerai.com>",
                    "to": ["nandprsd62@gmail.com"],
                    "subject": f"🚨 {report.error_type} — {report.page}",
                    "html": f"""<div style='font-family:sans-serif;padding:24px;max-width:600px'>
                        <h2 style='color:#dc2626'>🚨 User Error Report</h2>
                        <p><b>User:</b> {report.user_email or 'Not logged in'}</p>
                        <p><b>Error Type:</b> <span style='color:#dc2626'>{report.error_type}</span></p>
                        <p><b>Page:</b> {report.page}</p>
                        <p><b>Action:</b> {report.action}</p>
                        <p><b>Message:</b> {report.message}</p>
                        <p><b>Time:</b> {timestamp}</p>
                        <hr/>
                        <p style='color:#64748b;font-size:13px'>Reply to user: <a href='mailto:{report.user_email}'>{report.user_email or 'unknown'}</a></p>
                    </div>"""
                },
                timeout=10
            )
    except Exception as e:
        logger.error(f"Error report email failed: {e}")
    return {"ok": True}

# ─────────────────────────────────────────────
# RANKY AI ASSISTANT ENDPOINT
# ─────────────────────────────────────────────
class RankyMessage(BaseModel):
    message: str
    language: str = "english"
    history: list = []

@app.post("/api/v1/ranky/chat")
@limiter.limit("15/minute")
async def ranky_chat(request: Request, payload: RankyMessage, user=Depends(get_current_user)):
    import httpx
    RANKY_BASE = """You are Ranky, the friendly AI assistant built into LeadRankerAI.
LeadRankerAI is a lead scoring tool that scores inbound leads as HOT, WARM, or COLD in under 3 seconds.
You help users with: lead scoring, connecting integrations (WordPress, Meta Ads, Google Ads), billing, dashboard features, API keys, and troubleshooting.
Always be concise, friendly, and helpful. Never make up features that do not exist.
If asked about pricing: Starter is 19 USD/month for 1000 leads. Team is 49 USD/month for 5000 leads. Free trial is 50 leads.
"""

    system_prompts = {
        "english":   RANKY_BASE + "Always respond in English.",
        "hindi":     RANKY_BASE + "हमेशा हिंदी में जवाब दें। पूरी जानकारी हिंदी में दें।",
        "malayalam": RANKY_BASE + "എല്ലായ്പ്പോഴും മലയാളത്തിൽ മറുപടി നൽകുക. എല്ലാ വിവരങ്ങളും മലയാളത്തിൽ നൽകുക.",
        "arabic":    RANKY_BASE + "أجب دائماً باللغة العربية. قدم جميع المعلومات باللغة العربية.",
        "spanish":   RANKY_BASE + "Responde siempre en español. Da toda la información en español.",
        "tamil":     RANKY_BASE + "எப்போதும் தமிழில் பதில் அளிக்கவும். அனைத்து தகவல்களையும் தமிழில் வழங்கவும்.",
    }
    lang = payload.language.lower()
    system = system_prompts.get(lang, system_prompts["english"])
    messages = [{"role": "system", "content": system}]
    for h in payload.history[-6:]:
        messages.append(h)
    messages.append({"role": "user", "content": payload.message})
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                json={"model": "gpt-4o-mini", "messages": messages, "max_tokens": 300, "temperature": 0.7},
                timeout=30
            )
            data = res.json()
            reply = data["choices"][0]["message"]["content"]
            return {"reply": reply}
    except Exception as e:
        logger.error(f"Ranky error: {e}")
        raise HTTPException(status_code=500, detail="Ranky is unavailable right now")

# ─────────────────────────────────────────────
# CHANGELOG ENDPOINT
# ─────────────────────────────────────────────
CHANGELOG = [
    {
        "version": "1.3.1",
        "date": "2026-03-31",
        "title": "Ranky speaks your language",
        "badge": "improvement",
        "items": [
            "Ranky AI assistant now responds fully in Hindi, Malayalam, Tamil, Arabic and Spanish",
            "Smarter onboarding guidance in your preferred language",
            "LeadRankerAI context added — Ranky now knows your plan, pricing and features",
        ]
    },
    {
        "version": "1.3.0",
        "date": "2026-03-21",
        "title": "Smarter Lead Scoring",
        "badge": "improvement",
        "items": [
            "AI scoring now uses industry-specific examples for better accuracy",
            "Rule-based signals: phone number, budget, timeline detection",
            "Spam and low-quality messages automatically scored 0",
            "Prompt injection protection added",
        ]
    },
    {
        "version": "1.2.0",
        "date": "2026-03-20",
        "title": "Billing & Payments",
        "badge": "new",
        "items": [
            "Lemon Squeezy payment integration launched",
            "Automatic plan upgrade after payment",
            "Welcome email sent after subscription",
            "Usage tracking per billing cycle",
        ]
    },
    {
        "version": "1.1.0",
        "date": "2026-03-15",
        "title": "Security Hardening",
        "badge": "security",
        "items": [
            "Rate limiting on all API endpoints",
            "Error monitoring with founder alerts",
        ]
    },
    {
        "version": "1.0.0",
        "date": "2026-03-01",
        "title": "Alpha Launch",
        "badge": "launch",
        "items": [
            "AI lead scoring (HOT/WARM/COLD) across 7 industries",
            "WordPress plugin for form interception",
            "Magic email inbound scoring",
            "Ranky AI assistant in 6 languages",
            "Google OAuth + email auth",
            "Referral program",
        ]
    },
]

@app.get("/api/v1/changelog")
async def get_changelog():
    return {"changelog": CHANGELOG, "latest_version": CHANGELOG[0]["version"]}
