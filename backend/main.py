# backend/main.py

import os
import uuid
import time
import logging
from datetime import datetime, timezone
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

from backend.db import get_db, set_tenant
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message
from backend.services.alerts import send_hot_alert


# --------------------------------------------------
# CONFIG
# --------------------------------------------------

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

stripe.api_key = STRIPE_SECRET_KEY

logging.basicConfig(level=logging.INFO)


PLANS = {
    "free": {"limit": 50, "price_id": None},
    "trial": {"limit": 50, "price_id": None},
    "starter": {
        "limit": 1000,
        "price_id": "price_1Sqs5ASGlXmZfnDz7DOrMOvc"
    },
    "team": {
        "limit": 5000,
        "price_id": "price_1Sqs5zSGlXmZfnDziHFpJ1dz"
    },
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

    # HOT alert
    if bucket == "HOT":

        msg = payload.get("message") or payload.get("text", "")

        send_hot_alert(
            email,
            msg,
            score
        )

    return lead, bucket, score


# --------------------------------------------------
# AUTH
# --------------------------------------------------

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

    return {
        "access_token": create_jwt(
            str(row.brokerage_id),
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
    except Exception as e:
        logging.error(e)
        raise HTTPException(400, "Webhook error")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":

        meta = data.get("metadata", {})

        bid = meta.get("brokerage_id")
        plan = meta.get("plan")

        if not bid:
            return {"status": "ignored"}

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

    billing = get_billing_status(
        db,
        user["brokerage_id"]
    )

    if billing["blocked"]:
        raise HTTPException(402, "Quota exceeded")

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:i"),
        {"i": user["brokerage_id"]}
    ).fetchone()

    industry = row.industry if row else "real_estate"

    ai = analyze_lead_message(
        lead.message,
        industry
    )

    payload = {
        "message": lead.message,
        "source": lead.source,
        "entities": ai["entities"]
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
        "entities": ai["entities"],
        "ai_recommendation": ai["recommendation"],
        "billing": get_billing_status(
            db,
            user["brokerage_id"]
        )
    }


# --------------------------------------------------
# EMAIL INBOUND (RESEND / FORWARD)
# --------------------------------------------------

@app.post("/inbound/email")
async def inbound_email(
    payload: dict,
    db: Session = Depends(get_db)
):

    try:

        data = payload.get("data", {})

        to_email = data.get("to", "")
        from_email = data.get("from", "")
        subject = data.get("subject", "")
        text_msg = data.get("text", "")

        if not text_msg:
            raise HTTPException(400, "No text")

        if "+" not in to_email:
            raise HTTPException(400, "Invalid address")

        brokerage_id = to_email.split("+")[1].split("@")[0]

        row = db.execute(
            text("SELECT industry FROM brokerages WHERE id=:i"),
            {"i": brokerage_id}
        ).fetchone()

        industry = row.industry if row else "real_estate"

        full_msg = f"{subject}\n{text_msg}"

        ai = analyze_lead_message(
            full_msg,
            industry
        )

        payload_db = {
            "message": full_msg,
            "source": "email",
            "entities": ai["entities"]
        }

        lead, bucket, score = save_lead(
            db,
            brokerage_id,
            from_email,
            payload_db,
            ai
        )

        return {
            "status": "ok",
            "bucket": bucket,
            "score": score
        }

    except Exception as e:

        logging.exception("Inbound email failed")

        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


# --------------------------------------------------
# WEBHOOK (FORMS / CRM / ADS)
# --------------------------------------------------

@app.post("/inbound/{brokerage_id}")
async def inbound_webhook(
    brokerage_id: str,
    request: Request,
    db: Session = Depends(get_db)
):

    payload = await request.json()

    message = payload.get("message")

    if not message:
        raise HTTPException(400, "Message required")

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:i"),
        {"i": brokerage_id}
    ).fetchone()

    industry = row.industry if row else "real_estate"

    ai = analyze_lead_message(
        message,
        industry
    )

    lead, bucket, score = save_lead(
        db,
        brokerage_id,
        payload.get("email", "external@lead.com"),
        payload,
        ai
    )

    return {
        "status": "ok",
        "bucket": bucket,
        "score": score
    }


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
                "sentiment": r.sentiment,
                "created_at": r.created_at.isoformat(),
                "recommendation": r.ai_recommendation
            }
            for r in rows
        ]
    }


@app.get("/billing/usage")
def billing_usage(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_billing_status(
        db,
        user["brokerage_id"]
    )


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
