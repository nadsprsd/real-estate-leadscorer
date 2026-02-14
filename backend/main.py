# backend/main.py

import os
import uuid
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext

from sqlalchemy import text, func
from sqlalchemy.orm import Session

import stripe
import requests

from backend.db import get_db, set_tenant
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message
from backend.services.alerts import send_hot_alert
from backend.services.email_verify import send_verify_email


# --------------------------------------------------
# CONFIG
# --------------------------------------------------

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

stripe.api_key = STRIPE_SECRET_KEY

logging.basicConfig(level=logging.INFO)


# --------------------------------------------------
# PLANS
# --------------------------------------------------

PLANS = {
    "free": {"limit": 50, "price_id": None},
    "trial": {"limit": 50, "price_id": None},
    "starter": {"limit": 1000, "price_id": "price_1Sqs5ASGlXmZfnDz7DOrMOvc"},
    "team": {"limit": 5000, "price_id": "price_1Sqs5zSGlXmZfnDziHFpJ1dz"},
}


# --------------------------------------------------
# APP
# --------------------------------------------------

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


# --------------------------------------------------
# SCHEMAS
# --------------------------------------------------

class RegisterInput(BaseModel):
    email: str
    password: str
    brokerage_name: str
    industry:str


class LoginInput(BaseModel):
    email: str
    password: str


class LeadInput(BaseModel):
    message: str
    source: str = "manual"


class CheckoutInput(BaseModel):
    plan: str


# --------------------------------------------------
# AUTH HELPERS
# --------------------------------------------------

def hash_password(p):
    return pwd_context.hash(p)


def verify_password(p, h):
    return pwd_context.verify(p, h)


def create_jwt(bid: str, email: str):

    payload = {
        "sub": email,
        "brokerage_id": bid,
        "iat": int(time.time())
    }

    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):

    try:

        payload = jwt.decode(
            creds.credentials,
            JWT_SECRET,
            algorithms=["HS256"]
        )

        set_tenant(db, payload["brokerage_id"])

        return payload

    except JWTError:
        raise HTTPException(401, "Invalid token")


# --------------------------------------------------
# BILLING
# --------------------------------------------------

def get_billing_status(db: Session, bid: str) -> Dict:

    row = db.execute(text("""
        SELECT COUNT(*)
        FROM lead_scores
        WHERE brokerage_id=:id
          AND created_at >= date_trunc('month', NOW())
    """), {"id": bid}).fetchone()

    usage = row[0] if row else 0

    plan_row = db.execute(
        text("SELECT plan FROM brokerages WHERE id=:id"),
        {"id": bid}
    ).fetchone()

    plan = (plan_row.plan or "free").lower()

    if plan not in PLANS:
        plan = "free"

    limit = PLANS[plan]["limit"]

    percent = int((usage / limit) * 100) if limit else 0

    return {
        "plan": plan,
        "usage": usage,
        "limit": limit,
        "remaining": max(limit - usage, 0),
        "percent": percent,
        "blocked": usage >= limit
    }


# --------------------------------------------------
# CORE SAVE
# --------------------------------------------------

def save_lead(
    db: Session,
    brokerage_id: str,
    email: str,
    payload: dict,
    ai: dict
):
    # -----------------------------
    # Normalize lead intent
    # -----------------------------
    is_lead = ai.get("is_lead", False)
    score = int(ai.get("urgency_score", 0))

    if not is_lead:
        score = 0
        bucket = "IGNORE"
    else:
        if score >= 80:
            bucket = "HOT"
        elif score >= 50:
            bucket = "WARM"
        else:
            bucket = "COLD"

    # -----------------------------
    # Persist lead (even IGNORE)
    # -----------------------------
    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=email,

        input_payload={
            **payload,
            "is_lead": is_lead   # 👈 STORE HERE
        },

        urgency_score=score if is_lead else None,
        sentiment=ai.get("sentiment"),
        ai_recommendation=ai.get("recommendation"),

        score=score,
        bucket=bucket,

        created_at=datetime.now(timezone.utc)
    )

    db.add(lead)
    db.commit()

    # -----------------------------
    # Alerts (HOT leads only)
    # -----------------------------
    if bucket == "HOT":
        msg = payload.get("message") or payload.get("text", "")
        send_hot_alert(email, msg, score)

    return lead, bucket, score


# --------------------------------------------------
# AUTH (Register)
# --------------------------------------------------

@app.post("/auth/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):

    exists = db.execute(
        text("SELECT id FROM users WHERE email=:e"),
        {"e": data.email}
    ).fetchone()

    if exists:
        raise HTTPException(400, "Email already exists")

    bid = str(uuid.uuid4())
    uid = str(uuid.uuid4())

    db.execute(text("""
        INSERT INTO brokerages (id, name, plan, industry)
        VALUES (:i, :n, 'trial', :ind)
    """), {
        "i": bid,
        "n": data.brokerage_name,
        "ind": data.industry
    })

    db.execute(text("""
        INSERT INTO users (id, email, hashed_password, brokerage_id)
        VALUES (:i, :e, :p, :b)
    """), {
        "i": uid,
        "e": data.email,
        "p": hash_password(data.password),
        "b": bid
    })

    # ✅ Send email + get token
    token = send_verify_email(data.email)

    db.execute(text("""
        INSERT INTO email_verifications
        (id, email, token, expires_at, verified)
        VALUES (:i, :e, :t, :x, false)
    """), {
        "i": str(uuid.uuid4()),
        "e": data.email,
        "t": token,
        "x": datetime.utcnow() + timedelta(hours=24)
    })

    db.commit()

    return {
        "status": "verification_sent",
        "message": "Check your email to verify your account"
    }



# --------------------------------------------------
# Login
# --------------------------------------------------


@app.post("/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):

    user = db.execute(text("""
        SELECT u.hashed_password, u.brokerage_id, ev.verified
        FROM users u
        LEFT JOIN email_verifications ev ON ev.email = u.email
        WHERE u.email=:e
    """), {"e": data.email}).fetchone()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    if not user.verified:
        raise HTTPException(403, "Please verify your email first")

    return {
        "access_token": create_jwt(
            str(user.brokerage_id),
            data.email
        )
    }



# --------------------------------------------------
# STRIPE
# --------------------------------------------------

@app.post("/billing/checkout")
def checkout(
    data: CheckoutInput,
    user=Depends(get_current_user)
):

    plan = data.plan

    if plan not in PLANS:
        raise HTTPException(400, "Invalid plan")

    price_id = PLANS[plan]["price_id"]

    if not price_id:
        raise HTTPException(400, "Not payable")

    session = stripe.checkout.Session.create(
        mode="subscription",

        line_items=[{
            "price": price_id,
            "quantity": 1
        }],

        success_url="http://localhost:5173/dashboard?paid=1",
        cancel_url="http://localhost:5173/billing?cancel=1",

        customer_email=user["sub"],

        metadata={
            "brokerage_id": user["brokerage_id"],
            "plan": plan
        }
    )

    return {"checkout_url": session.url}



# --------------------------------------------------
# Billing /Webhook
# --------------------------------------------------


@app.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
    db: Session = Depends(get_db)
):

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            STRIPE_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(400, "Webhook error")

    data = event["data"]["object"]

    if event["type"] == "checkout.session.completed":

        meta = data.get("metadata", {})

        bid = meta.get("brokerage_id")
        plan = meta.get("plan")

        if bid:
            db.execute(text("""
                UPDATE brokerages
                SET plan=:p, subscription_status='active'
                WHERE id=:i
            """), {
                "p": plan,
                "i": bid
            })

            db.commit()

    return {"status": "ok"}


# --------------------------------------------------
# SCORE
# --------------------------------------------------

@app.post("/leads/score")
def score_lead(
    lead: LeadInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    billing = get_billing_status(db, user["brokerage_id"])
    if billing["blocked"]:
        raise HTTPException(402, "Quota exceeded")

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:i"),
        {"i": user["brokerage_id"]}
    ).fetchone()

    industry = row.industry if row else "real_estate"

    ai = analyze_lead_message(lead.message, industry)

    #  ANTI-MISLEADING LOGIC 

    if not ai.get("is_lead", False):
        return {
            "score": 0,
            "bucket": "IGNORE",
            "sentiment": ai.get("sentiment", "neutral"),
            "recommendation": ai.get("recommendation", ""),
            "billing": get_billing_status(db, user["brokerage_id"])
        }

    #Only REAL leads

    payload = {
        "message": lead.message,
        "source": lead.source,
        "entities": ai.get("entities", {})
    }

    lead_obj, bucket, score = save_lead(
        db,
        user["brokerage_id"],
        user["sub"],
        payload,
        ai
    )

    return {
        "score": score,
        "bucket": bucket,
        "sentiment": ai["sentiment"],
        "recommendation": ai["recommendation"],
        "billing": get_billing_status(db, user["brokerage_id"])
    }



# --------------------------------------------------
# EMAIL INBOUND (SYNC SAFE)
# --------------------------------------------------

@app.post("/inbound/email")
async def inbound_email(
    payload: dict,
    db: Session = Depends(get_db)
):

    logging.info("📧 Inbound email received")

    data = payload.get("data", {})

    to_list = data.get("to", [])
    from_email = data.get("from", "")
    subject = data.get("subject", "")
    text_msg = data.get("text", "")

    if not text_msg:
        logging.warning("No email body")
        return {"ok": True}

    if not to_list:
        return {"ok": True}

    to_email = to_list[0]

    if "+" not in to_email:
        return {"ok": True}

    brokerage_id = to_email.split("+")[1].split("@")[0]

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:i"),
        {"i": brokerage_id}
    ).fetchone()

    industry = row.industry if row else "real_estate"

    full_msg = f"{subject}\n\n{text_msg}"

    ai = analyze_lead_message(full_msg, industry)

    payload_db = {
        "message": full_msg,
        "source": "email"
    }

    save_lead(
        db,
        brokerage_id,
        from_email,
        payload_db,
        ai
    )

    return {"ok": True}


# --------------------------------------------------
# HISTORY / DASHBOARD
# --------------------------------------------------

@app.get("/leads/history")
def leads_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    bid = user["brokerage_id"]

    rows = (
        db.query(LeadScore)
        .filter(LeadScore.brokerage_id == bid)
        .order_by(LeadScore.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return {
        "data": [
            {
                "id": r.id,
                "lead": r.input_payload.get("message"),
                "score": r.score,
                "bucket": r.bucket,
                "created_at": r.created_at.isoformat(),
                "recommendation": r.ai_recommendation
            }
            for r in rows
        ]
    }


# --------------------------------------------------
# Billing / usage
# --------------------------------------------------

@app.get("/billing/usage")
def billing_usage(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_billing_status(db, user["brokerage_id"])


# --------------------------------------------------
# Stats-Leads / DASHBOARD
# --------------------------------------------------

@app.get("/leads/stats")
def leads_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    bid = user["brokerage_id"]

    def c(q):
        return q.scalar() or 0

    return {

        "total": c(
            db.query(func.count(LeadScore.id))
            .filter(LeadScore.brokerage_id == bid)
        ),

        "hot": c(
            db.query(func.count(LeadScore.id))
            .filter(
                LeadScore.brokerage_id == bid,
                LeadScore.bucket == "HOT"
            )
        ),

        "warm": c(
            db.query(func.count(LeadScore.id))
            .filter(
                LeadScore.brokerage_id == bid,
                LeadScore.bucket == "WARM"
            )
        ),

        "cold": c(
            db.query(func.count(LeadScore.id))
            .filter(
                LeadScore.brokerage_id == bid,
                LeadScore.bucket == "COLD"
            )
        ),
    }

# --------------------------------------------------
# Email Verify 
# --------------------------------------------------


@app.get("/auth/verify")
def verify_email(token: str, db: Session = Depends(get_db)):

    row = db.execute(text("""
        SELECT email
        FROM email_verifications
        WHERE token=:t AND expires_at > NOW() AND verified=false
    """), {"t": token}).fetchone()

    if not row:
        raise HTTPException(400, "Invalid or expired token")

    db.execute(text("""
        UPDATE email_verifications
        SET verified=true
        WHERE email=:e
    """), {"e": row.email})

    db.commit()

    return {"status": "verified"}
