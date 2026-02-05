# backend/main.py

import os
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Dict

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext

from sqlalchemy import text, func
from sqlalchemy.orm import Session

import stripe
from fastapi import Header

from backend.db import get_db, set_tenant
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message


# ---------------- CONFIG ----------------

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

stripe.api_key = STRIPE_SECRET_KEY


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

logging.basicConfig(level=logging.INFO)


# ---------------- SCHEMAS ----------------

class RegisterInput(BaseModel):
    email: str
    password: str
    brokerage_name: str


class LoginInput(BaseModel):
    email: str
    password: str


class LeadInput(BaseModel):
    message: str
    source: str = "manual"


class CheckoutInput(BaseModel):
    plan: str


# ---------------- AUTH ----------------

def hash_password(p): 
    return pwd_context.hash(p)


def verify_password(p, h): 
    return pwd_context.verify(p, h)


def create_jwt(brokerage_id: str, email: str):

    payload = {
        "sub": email,
        "brokerage_id": brokerage_id,
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


# ---------------- BILLING ----------------

def get_billing_status(db: Session, brokerage_id: str) -> Dict:

    row = db.execute(text("""
        SELECT COUNT(*) 
        FROM lead_scores
        WHERE brokerage_id=:id
          AND created_at >= date_trunc('month', NOW())
    """), {"id": brokerage_id}).fetchone()

    usage = row[0] if row else 0

    plan_row = db.execute(
        text("SELECT plan FROM brokerages WHERE id=:id"),
        {"id": brokerage_id}
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


# ---------------- CORE SAVE ----------------

def save_lead(
    db: Session,
    brokerage_id: str,
    email: str,
    payload: dict,
    ai: dict
):

    score = ai["urgency_score"]

    bucket = (
        "HOT" if score >= 80
        else "WARM" if score >= 50
        else "COLD"
    )

    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=email,

        input_payload=payload,

        urgency_score=score,
        sentiment=ai["sentiment"],
        ai_recommendation=ai["recommendation"],

        score=score,
        bucket=bucket,

        created_at=datetime.now(timezone.utc)
    )

    db.add(lead)
    db.commit()

    return lead, bucket, score


# ---------------- AUTH ROUTES ----------------

@app.post("/auth/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):

    exists = db.execute(
        text("SELECT id FROM users WHERE email=:e"),
        {"e": data.email}
    ).fetchone()

    if exists:
        raise HTTPException(400, "Email exists")

    bid = str(uuid.uuid4())
    uid = str(uuid.uuid4())

    db.execute(text("""
        INSERT INTO brokerages (id,name,plan,industry)
        VALUES (:i,:n,'trial','real_estate')
    """), {"i": bid, "n": data.brokerage_name})

    db.execute(text("""
        INSERT INTO users (id,email,hashed_password,brokerage_id)
        VALUES (:i,:e,:p,:b)
    """), {
        "i": uid,
        "e": data.email,
        "p": hash_password(data.password),
        "b": bid
    })

    db.commit()

    return {"access_token": create_jwt(bid, data.email)}


@app.post("/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):

    row = db.execute(text("""
        SELECT hashed_password, brokerage_id
        FROM users WHERE email=:e
    """), {"e": data.email}).fetchone()

    if not row or not verify_password(data.password, row.hashed_password):
        raise HTTPException(401, "Invalid login")

    return {"access_token": create_jwt(str(row.brokerage_id), data.email)}


# ---------------- STRIPE ----------------

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
        raise HTTPException(400, "Plan not payable")

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



#Stripe webhook

@app.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
    db: Session = Depends(get_db),
):
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        logging.error(f"Stripe webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook error")

    event_type = event["type"]
    data = event["data"]["object"]

    logging.info(f"Stripe event received: {event_type}")

    # ✅ PAYMENT SUCCESS → ACTIVATE PLAN
    if event_type in (
        "checkout.session.completed",
        "invoice.payment_succeeded",
    ):
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")

        # Metadata is only present on checkout.session
        metadata = data.get("metadata", {})
        brokerage_id = metadata.get("brokerage_id")
        plan = metadata.get("plan")

        if not brokerage_id:
            logging.warning("Missing brokerage_id in webhook")
            return {"status": "ignored"}

        db.execute(text("""
            UPDATE brokerages
            SET
                plan = :plan,
                subscription_status = 'active',
                stripe_customer_id = :cust,
                stripe_subscription_id = :sub
            WHERE id = :bid
        """), {
            "plan": plan,
            "cust": customer_id,
            "sub": subscription_id,
            "bid": brokerage_id
        })

        db.commit()

        logging.info(
            f"Brokerage {brokerage_id} upgraded to {plan}"
        )

    return {"status": "ok"}




# ---------------- SCORE ----------------

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

    payload = {
        "message": lead.message,
        "source": lead.source,
        "entities": ai["entities"]
    }

    record, bucket, score = save_lead(
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
        "entities": ai["entities"],
        "ai_recommendation": ai["recommendation"],
        "billing": get_billing_status(db, user["brokerage_id"])
    }


# ---------------- HISTORY ----------------

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
                "lead": r.input_payload.get("message")
                        or r.input_payload.get("text"),
                "score": r.score,
                "bucket": r.bucket,
                "sentiment": r.sentiment,
                "created_at": r.created_at.isoformat(),
                "recommendation": r.ai_recommendation
            }
            for r in rows
        ]
    }


# ---------------- DASHBOARD ----------------

@app.get("/billing/usage")
def billing_usage(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return get_billing_status(db, user["brokerage_id"])


@app.get("/leads/stats")
def leads_stats(db: Session = Depends(get_db), user=Depends(get_current_user)):

    bid = user["brokerage_id"]

    def c(q):
        return q.scalar() or 0

    return {
        "total": c(db.query(func.count(LeadScore.id))
                  .filter(LeadScore.brokerage_id == bid)),

        "hot": c(db.query(func.count(LeadScore.id))
                .filter(LeadScore.brokerage_id == bid,
                        LeadScore.bucket == "HOT")),

        "warm": c(db.query(func.count(LeadScore.id))
                 .filter(LeadScore.brokerage_id == bid,
                         LeadScore.bucket == "WARM")),

        "cold": c(db.query(func.count(LeadScore.id))
                 .filter(LeadScore.brokerage_id == bid,
                         LeadScore.bucket == "COLD")),
    }
