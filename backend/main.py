import os
import uuid
import time
import logging
from datetime import datetime
from typing import Dict

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend.db import get_db, set_tenant
from backend.models import LeadScore

import stripe
from backend.services.ai_engine import analyze_lead_message

# ---------------- ENV ----------------
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

stripe.api_key = STRIPE_SECRET_KEY

# ---------------- PLANS ----------------

PLANS = {
    "free": {"limit": 50, "price_id": None},
    "trial": {"limit": 50, "price_id": None},
    "starter": {"limit": 1000, "price_id": "price_1Sqs5ASGlXmZfnDz7DOrMOvc"},
    "team": {"limit": 5000, "price_id": "price_1Sqs5zSGlXmZfnDziHFpJ1dz"},
}

# ---------------- APP ----------------

app = FastAPI(title="LeadScorer SaaS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

logging.basicConfig(filename="audit.log", level=logging.INFO)

# ---------------- SCHEMAS ----------------

class RegisterInput(BaseModel):
    email: str
    password: str
    brokerage_name: str

class LoginInput(BaseModel):
    email: str
    password: str

class LeadInput(BaseModel):
    message: str   # Raw Inquiry text
    source: str = "manual"

# ---------------- AUTH ----------------

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)

def create_jwt(brokerage_id: str, email: str):
    payload = {"sub": email, "brokerage_id": brokerage_id, "iat": int(time.time())}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        set_tenant(db, payload["brokerage_id"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------------- BILLING ----------------

def get_billing_status(db: Session, brokerage_id: str) -> Dict:
    row = db.execute(
        text("SELECT plan, monthly_usage FROM brokerages WHERE id=:id"),
        {"id": brokerage_id}
    ).fetchone()

    plan = (row.plan or "free").lower()
    if plan not in PLANS:
        plan = "free"

    usage = row.monthly_usage
    limit = PLANS[plan]["limit"]

    percent = int((usage / limit) * 100) if limit > 0 else 0

    warning = None
    if percent >= 100:
        warning = "Quota exhausted"
    elif percent >= 90:
        warning = "90% used"
    elif percent >= 75:
        warning = "75% used"

    return {
        "plan": plan,
        "usage": usage,
        "limit": limit,
        "remaining": max(limit - usage, 0),
        "percent": percent,
        "warning": warning,
        "blocked": usage >= limit
    }

# ---------------- ROUTES ----------------

@app.post("/auth/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):

     # Check if email exists
    existing = db.execute(
        text("SELECT id FROM users WHERE email = :e"),
        {"e": data.email}
    ).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    brokerage_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    db.execute(
        text("""
        INSERT INTO brokerages (id, name, plan, monthly_usage, subscription_status)
        VALUES (:id, :name, 'trial', 0, 'trial')
        """),
        {"id": brokerage_id, "name": data.brokerage_name}
    )

    db.execute(
        text("""
        INSERT INTO users (id, email, hashed_password, brokerage_id)
        VALUES (:id, :email, :hp, :bid)
        """),
        {"id": user_id, "email": data.email, "hp": hash_password(data.password), "bid": brokerage_id}
    )

    db.commit()
    return {"access_token": create_jwt(brokerage_id, data.email)}

@app.post("/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT hashed_password, brokerage_id FROM users WHERE email=:e"),
        {"e": data.email}
    ).fetchone()

    if not row or not verify_password(data.password, row.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid login")

    return {"access_token": create_jwt(str(row.brokerage_id), data.email)}

# ---------------- STRIPE ----------------

@app.post("/billing/checkout")
def checkout(plan: str, user=Depends(get_current_user)):
    if plan not in PLANS or PLANS[plan]["price_id"] is None:
        raise HTTPException(status_code=400, detail="Invalid plan")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": PLANS[plan]["price_id"], "quantity": 1}],
        success_url="http://localhost:5173/dashboard?success=1",
        cancel_url="http://localhost:5173/dashboard?cancel=1",
        metadata={
            "brokerage_id": user["brokerage_id"],
            "plan": plan
        }
    )

    return {"checkout_url": session.url}

@app.post("/billing/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        brokerage_id = session["metadata"]["brokerage_id"]
        plan = session["metadata"]["plan"]

        db.execute(
            text("""
            UPDATE brokerages
            SET plan = :plan, subscription_status = 'active'
            WHERE id = :id
            """),
            {"plan": plan, "id": brokerage_id}
        )
        db.commit()

    return {"status": "ok"}

# ---------------- SCORING ----------------

@app.post("/leads/score")
def score_lead(
    lead: LeadInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    billing = get_billing_status(db, user["brokerage_id"])
    if billing["blocked"]:
        raise HTTPException(status_code=402, detail="Quota exceeded")

    #  Send to AI
    ai_result = analyze_lead_message(lead.message)

    urgency = ai_result["urgency_score"]
    sentiment = ai_result["sentiment"]
    entities = ai_result["entities"]
    recommendation = ai_result["recommendation"]

    # Determine Bucket
    if urgency >= 80:
        bucket = "HOT"
    elif urgency >= 50:
        bucket = "WARM"
    else:
        bucket = "COLD"

    score = urgency

    # Save to DB
    record = LeadScore(
    id=str(uuid.uuid4()),
    brokerage_id=user["brokerage_id"],
    user_email=user["sub"],

    input_payload={
        "message": lead.message,
        "entities": entities,
        "source": lead.source
    },

    urgency_score=urgency,
    sentiment=sentiment,
    ai_recommendation=recommendation,

    score=score,
    bucket=bucket,

    created_at=datetime.utcnow()
)

    db.add(record)

    db.execute(
        text("UPDATE brokerages SET monthly_usage = monthly_usage + 1 WHERE id=:id"),
        {"id": user["brokerage_id"]}
    )

    db.commit()

    return {
        "score": score,
        "bucket": bucket,
        "sentiment": sentiment,
        "entities": entities,
        "ai_recommendation": recommendation,
        "billing": get_billing_status(db, user["brokerage_id"])
    }

# ---------------- DASHBOARD ----------------

@app.get("/billing/usage")
def billing_usage(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return get_billing_status(db, user["brokerage_id"])

@app.get("/leads/stats")
def leads_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    total = (
        db.query(func.count(LeadScore.id))
        .filter(LeadScore.brokerage_id == bid)
        .scalar()
    )

    hot = (
        db.query(func.count(LeadScore.id))
        .filter(
            LeadScore.brokerage_id == bid,
            LeadScore.bucket == "HOT"
        )
        .scalar()
    )

    warm = (
        db.query(func.count(LeadScore.id))
        .filter(
            LeadScore.brokerage_id == bid,
            LeadScore.bucket == "WARM"
        )
        .scalar()
    )

    cold = (
        db.query(func.count(LeadScore.id))
        .filter(
            LeadScore.brokerage_id == bid,
            LeadScore.bucket == "COLD"
        )
        .scalar()
    )

    avg = (
        db.query(func.avg(LeadScore.score))
        .filter(LeadScore.brokerage_id == bid)
        .scalar()
        or 0
    )

    return {
        "total": total,
        "hot": hot,
        "warm": warm,
        "cold": cold,
        "avg_score": round(float(avg), 2),
    }


@app.get("/leads/history")
def leads_history(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    q = (
        db.query(LeadScore)
        .filter(LeadScore.brokerage_id == bid)
    )

    total = q.count()

    rows = (
        q.order_by(LeadScore.created_at.desc())
         .limit(limit)
         .offset(offset)
         .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": [
            {
                "id": r.id,
                "score": r.score,
                "bucket": r.bucket,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


# ---------------- ANALYTICS ----------------

@app.get("/analytics/usage")
def usage_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT
            DATE(created_at) as d,
            COUNT(*) as c
        FROM lead_scores
        WHERE brokerage_id = :bid
          AND created_at >= NOW() - INTERVAL ':days days'
        GROUP BY d
        ORDER BY d
    """), {"bid": bid, "days": days}).fetchall()

    return [
        {"date": str(r.d), "count": r.c}
        for r in rows
    ]


@app.get("/analytics/buckets")
def bucket_analytics(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT bucket, COUNT(*) as c
        FROM lead_scores
        WHERE brokerage_id = :bid
        GROUP BY bucket
    """), {"bid": bid}).fetchall()

    return {
        r.bucket: r.c for r in rows
    }


@app.get("/analytics/scores")
def score_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT
            DATE(created_at) as d,
            AVG(score) as avg
        FROM lead_scores
        WHERE brokerage_id = :bid
          AND created_at >= NOW() - INTERVAL ':days days'
        GROUP BY d
        ORDER BY d
    """), {"bid": bid, "days": days}).fetchall()

    return [
        {"date": str(r.d), "avg": round(float(r.avg), 2)}
        for r in rows
    ]
