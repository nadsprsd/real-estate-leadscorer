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

import stripe

from backend.db import get_db, set_tenant
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message


# ---------------- ENV ----------------
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

stripe.api_key = STRIPE_SECRET_KEY

# ---------------- PLANS ----------------
PLANS = {
    "free": {"limit": 50},
    "trial": {"limit": 50},
    "starter": {"limit": 1000},
    "team": {"limit": 5000},
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
    message: str
    source: str = "manual"

class IndustryUpdate(BaseModel):
    industry: str


# ---------------- AUTH HELPERS ----------------
def hash_password(p): return pwd_context.hash(p)
def verify_password(p, h): return pwd_context.verify(p, h)

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
        raise HTTPException(401, "Invalid token")


# ---------------- BILLING ----------------
def get_billing_status(db, bid):
    row = db.execute(
        text("SELECT plan, monthly_usage FROM brokerages WHERE id=:id"),
        {"id": bid}
    ).fetchone()

    plan = (row.plan or "free").lower()
    if plan not in PLANS:
        plan = "free"

    usage = row.monthly_usage
    limit = PLANS[plan]["limit"]
    percent = int((usage / limit) * 100)

    return {
        "plan": plan,
        "usage": usage,
        "limit": limit,
        "remaining": max(limit - usage, 0),
        "percent": percent,
        "blocked": usage >= limit
    }


# ---------------- AUTH ROUTES ----------------
@app.post("/auth/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):
    existing = db.execute(
        text("SELECT id FROM users WHERE email=:e"),
        {"e": data.email}
    ).fetchone()

    if existing:
        raise HTTPException(400, "Email exists")

    bid = str(uuid.uuid4())
    uid = str(uuid.uuid4())

    db.execute(text("""
        INSERT INTO brokerages
        (id, name, plan, monthly_usage, subscription_status, industry)
        VALUES (:id, :n, 'trial', 0, 'trial', 'real_estate')
    """), {"id": bid, "n": data.brokerage_name})

    db.execute(text("""
        INSERT INTO users
        (id, email, hashed_password, brokerage_id)
        VALUES (:id, :e, :p, :b)
    """), {
        "id": uid,
        "e": data.email,
        "p": hash_password(data.password),
        "b": bid
    })

    db.commit()
    return {"access_token": create_jwt(bid, data.email)}

@app.post("/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT hashed_password, brokerage_id FROM users WHERE email=:e"),
        {"e": data.email}
    ).fetchone()

    if not row or not verify_password(data.password, row.hashed_password):
        raise HTTPException(401, "Invalid login")

    return {"access_token": create_jwt(str(row.brokerage_id), data.email)}


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
        text("SELECT industry FROM brokerages WHERE id=:id"),
        {"id": user["brokerage_id"]}
    ).fetchone()

    industry = row.industry if row else "real_estate"
    ai = analyze_lead_message(lead.message, industry)

    score = ai["urgency_score"]
    bucket = "HOT" if score >= 80 else "WARM" if score >= 50 else "COLD"

    record = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=user["brokerage_id"],
        user_email=user["sub"],
        input_payload={
            "message": lead.message,
            "source": lead.source,
            "entities": ai["entities"]
        },
        urgency_score=score,
        sentiment=ai["sentiment"],
        ai_recommendation=ai["recommendation"],
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
        "sentiment": ai["sentiment"],
        "entities": ai["entities"],
        "recommendation": ai["recommendation"],
        "billing": get_billing_status(db, user["brokerage_id"])
    }


# ================= EMAIL INBOUND (MUST BE ABOVE DYNAMIC ROUTE) =================
@app.post("/inbound/email")
async def inbound_email(payload: dict, db: Session = Depends(get_db)):

    data = payload.get("data", {})

    from_email = data.get("from")
    to_email = data.get("to")
    subject = data.get("subject")
    text = data.get("text")

    #print("RECEIVED:", text)

    if not text:
        raise HTTPException(400, "Message is required")

    brokerage_id = "demo"
    if to_email and "+" in to_email:
        brokerage_id = to_email.split("+")[1].split("@")[0]

    ai = analyze_lead_message(text, "real_estate")
    urgency = ai["urgency_score"]
    bucket = "HOT" if urgency >= 80 else "WARM" if urgency >= 50 else "COLD"

    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=from_email,
        input_payload={
            "subject": subject,
            "text": text,
            "source": "email",
            "entities": ai["entities"]
        },
        urgency_score=urgency,
        sentiment=ai["sentiment"],
        ai_recommendation=ai["recommendation"],
        score=urgency,
        bucket=bucket,
        created_at=datetime.utcnow()
    )

    db.add(lead)
    db.commit()

    return {"status": "ok", "bucket": bucket, "score": urgency}


# ---------------- GENERIC INBOUND (forms, ads, crm) ----------------
@app.post("/inbound/{brokerage_id}")
async def inbound_webhook(
    brokerage_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    payload = await request.json()
    message = payload.get("message")

    if not message:
        raise HTTPException(400, "Message is required")

    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:id"),
        {"id": brokerage_id}
    ).fetchone()

    industry = row.industry if row else "real_estate"
    ai = analyze_lead_message(message, industry)

    urgency = ai["urgency_score"]
    bucket = "HOT" if urgency >= 80 else "WARM" if urgency >= 50 else "COLD"

    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=payload.get("email", "external@lead.com"),
        input_payload={**payload, "entities": ai["entities"]},
        urgency_score=urgency,
        sentiment=ai["sentiment"],
        ai_recommendation=ai["recommendation"],
        score=urgency,
        bucket=bucket,
        created_at=datetime.utcnow()
    )

    db.add(lead)
    db.execute(
        text("UPDATE brokerages SET monthly_usage = monthly_usage + 1 WHERE id=:id"),
        {"id": brokerage_id}
    )
    db.commit()

    return {"status": "ok", "bucket": bucket, "score": urgency}



# ---------------- DASHBOARD ----------------

@app.get("/leads/history")
def leads_history(
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    bid = user["brokerage_id"]

    q = db.query(LeadScore).filter(LeadScore.brokerage_id == bid)

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
                "lead": r.input_payload.get("text")
                    or r.input_payload.get("message")
                    or r.input_payload.get("subject"),
                "score": r.score,
                "bucket": r.bucket,
                "sentiment": r.sentiment,
                "created_at": r.created_at.isoformat(),
                "message": r.input_payload.get("message", ""),
                "recommendation": r.ai_recommendation
            }
            for r in rows
        ],
    }



@app.get("/billing/usage")
def billing_usage(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return get_billing_status(db, user["brokerage_id"])


@app.get("/leads/stats")
def leads_stats(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = user["brokerage_id"]

    total = db.query(func.count(LeadScore.id)).filter(
        LeadScore.brokerage_id == bid
    ).scalar()

    hot = db.query(func.count(LeadScore.id)).filter(
        LeadScore.brokerage_id == bid, LeadScore.bucket == "HOT"
    ).scalar()

    warm = db.query(func.count(LeadScore.id)).filter(
        LeadScore.brokerage_id == bid, LeadScore.bucket == "WARM"
    ).scalar()

    cold = db.query(func.count(LeadScore.id)).filter(
        LeadScore.brokerage_id == bid, LeadScore.bucket == "COLD"
    ).scalar()

    avg = db.query(func.avg(LeadScore.score)).filter(
        LeadScore.brokerage_id == bid
    ).scalar() or 0

    return {
        "total": total,
        "hot": hot,
        "warm": warm,
        "cold": cold,
        "avg_score": round(float(avg), 2)
    }


@app.get("/analytics/usage")
def usage_analytics(days: int = 30, db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT DATE(created_at) as d, COUNT(*) as c
        FROM lead_scores
        WHERE brokerage_id = :bid
        GROUP BY d
        ORDER BY d
    """), {"bid": bid}).fetchall()

    return [{"date": str(r.d), "count": r.c} for r in rows]


@app.get("/analytics/buckets")
def bucket_analytics(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT bucket, COUNT(*) as c
        FROM lead_scores
        WHERE brokerage_id = :bid
        GROUP BY bucket
    """), {"bid": bid}).fetchall()

    return {r.bucket: r.c for r in rows}


@app.get("/analytics/scores")
def score_analytics(days: int = 30, db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = user["brokerage_id"]

    rows = db.execute(text("""
        SELECT DATE(created_at) as d, AVG(score) as avg
        FROM lead_scores
        WHERE brokerage_id = :bid
        GROUP BY d
        ORDER BY d
    """), {"bid": bid}).fetchall()

    return [{"date": str(r.d), "avg": round(float(r.avg), 2)} for r in rows]
