import logging
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import joblib
import numpy as np
import os
import uuid
import time

from backend.models import LeadScore

from jose import jwt, JWTError
from passlib.context import CryptContext

from sqlalchemy import text, func
from sqlalchemy.orm import Session
from backend.db import get_db, set_tenant

from typing import Optional

from fastapi.middleware.cors import CORSMiddleware

# --------- RATE LIMITING ---------
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ---------------- CONFIG ----------------

JWT_SECRET = "super-secret-change-this"
JWT_ALGO = "HS256"

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------- BILLING CONFIG ----------------

PLAN_LIMITS = {
    "FREE": 50,
    "SOLO": 500,
    "TEAM": 5000,
    "ENTERPRISE": 9999999,
}

# ---------------- LOAD MODEL ----------------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "lead_scorer_v1.pkl")
model = joblib.load(MODEL_PATH)

# ---------------- APP ----------------

app = FastAPI(title="Real Estate Lead Scorer", version="1.0.0")

LOG_PATH = os.path.join(os.path.dirname(__file__), "audit.log")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # For dev. In prod we will lock this down.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- AUDIT LOGGER ----------------

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s | %(message)s",
)

# ---------------- RATE LIMITER SETUP ----------------

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

# ---------------- SECURITY HEADERS ----------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

    if request.url.path.startswith("/docs") or request.url.path.startswith("/openapi"):
        response.headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net"
    else:
        response.headers["Content-Security-Policy"] = "default-src 'self'"

    return response

# ---------------- SCHEMAS ----------------

class RegisterInput(BaseModel):
    email: str
    password: str
    brokerage_name: str

class LoginInput(BaseModel):
    email: str
    password: str

class LeadInput(BaseModel):
    budget: float
    urgency: int
    views: int
    saves: int
    bedrooms: int
    preapproved: int
    open_house: int
    agent_response_hours: int

# ---------------- UTILS ----------------

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)

def create_jwt(brokerage_id: str, email: str):
    payload = {
        "sub": email,
        "brokerage_id": brokerage_id,
        "iat": int(time.time())
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        brokerage_id = payload["brokerage_id"]

        set_tenant(db, brokerage_id)
        return payload

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------------- BILLING HELPERS ----------------

def get_brokerage_plan_and_usage(db: Session, brokerage_id: str):
    row = db.execute(
        text("SELECT plan, monthly_usage FROM brokerages WHERE id = :id"),
        {"id": brokerage_id}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid brokerage")

    return row.plan, row.monthly_usage

def increment_usage(db: Session, brokerage_id: str):
    db.execute(
        text("""
        UPDATE brokerages
        SET monthly_usage = monthly_usage + 1
        WHERE id = :id
        """),
        {"id": brokerage_id}
    )

# ---------------- ROUTES ----------------

@app.get("/")
def health():
    return {"status": "ok"}

# -------- AUTH --------

@app.post("/auth/register-brokerage")
@limiter.limit("10/minute")
def register(request: Request, data: RegisterInput, db: Session = Depends(get_db)):
    res = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": data.email}
    ).fetchone()

    if res:
        raise HTTPException(status_code=400, detail="User already exists")

    brokerage_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    db.execute(
        text("INSERT INTO brokerages (id, name, plan, monthly_usage) VALUES (:id, :name, 'FREE', 0)"),
        {"id": brokerage_id, "name": data.brokerage_name}
    )

    db.execute(
        text("""
        INSERT INTO users (id, email, hashed_password, brokerage_id)
        VALUES (:id, :email, :hp, :bid)
        """),
        {
            "id": user_id,
            "email": data.email,
            "hp": hash_password(data.password),
            "bid": brokerage_id
        }
    )

    db.commit()

    token = create_jwt(brokerage_id, data.email)

    return {"access_token": token}

@app.post("/auth/login")
@limiter.limit("20/minute")
def login(request: Request, data: LoginInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
        SELECT users.hashed_password, users.brokerage_id
        FROM users
        WHERE email = :email
        """),
        {"email": data.email}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    hashed_password, brokerage_id = row

    if not verify_password(data.password, hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt(str(brokerage_id), data.email)

    return {"access_token": token}

# -------- BILLING --------

@app.get("/billing/usage")
def billing_usage(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    brokerage_id = user["brokerage_id"]
    plan, usage = get_brokerage_plan_and_usage(db, brokerage_id)
    limit = PLAN_LIMITS.get(plan, 0)

    return {
        "plan": plan,
        "used": usage,
        "limit": limit,
        "remaining": max(limit - usage, 0)
    }

# -------- SCORING --------

@app.post("/leads/score")
@limiter.limit("100/minute")
def score_lead(
    request: Request,
    lead: LeadInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    brokerage_id = user["brokerage_id"]

    # ---- BILLING / QUOTA CHECK ----
    plan, usage = get_brokerage_plan_and_usage(db, brokerage_id)
    limit = PLAN_LIMITS.get(plan, 0)

    if usage >= limit:
        raise HTTPException(
            status_code=402,
            detail=f"Monthly quota exceeded for plan {plan}. Upgrade required."
        )

    # ---- FEATURE ENGINEERING ----

    buyer_readiness_score = (
        (1 if lead.budget >= 500000 else 0) * 30 +
        (1 if lead.urgency <= 30 else 0) * 30 +
        (1 if lead.preapproved == 1 else 0) * 40
    )

    engagement_score = (
        (lead.views / 50.0) * 50 +
        (lead.saves / 20.0) * 30 +
        (1 if lead.open_house == 1 else 0) * 20
    )

    speed_penalty = min(max(lead.agent_response_hours, 0), 72) / 72.0 * 100

    X = np.array([[ 
        lead.budget,
        lead.urgency,
        lead.views,
        lead.saves,
        lead.bedrooms,
        lead.preapproved,
        lead.open_house,
        lead.agent_response_hours,
        buyer_readiness_score,
        engagement_score,
        speed_penalty
    ]])

    prob = model.predict_proba(X)[0][1]
    score = int(prob * 100)

    if score >= 70:
        bucket = "HOT"
    elif score >= 40:
        bucket = "WARM"
    else:
        bucket = "COLD"

    logging.info(f"brokerage={brokerage_id} user={user['sub']} score={score} bucket={bucket}")

    row = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=user["sub"],
        input_payload=lead.dict(),
        score=score,
        bucket=bucket,
        created_at=datetime.utcnow()
    )

    db.add(row)
    increment_usage(db, brokerage_id)
    db.commit()

    return {
        "score": score,
        "bucket": bucket,
        "probability": float(prob)
    }

# -------- HISTORY --------

@app.get("/leads/history")
def get_lead_history(
    limit: int = 20,
    offset: int = 0,
    bucket: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(LeadScore)

    if bucket:
        q = q.filter(LeadScore.bucket == bucket)

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
                "input": r.input_payload,
                "user": r.user_email
            }
            for r in rows
        ]
    }

# -------- STATS --------

@app.get("/leads/stats")
def lead_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    total = db.query(func.count(LeadScore.id)).scalar()

    hot = db.query(func.count(LeadScore.id)).filter(LeadScore.bucket == "HOT").scalar()
    warm = db.query(func.count(LeadScore.id)).filter(LeadScore.bucket == "WARM").scalar()
    cold = db.query(func.count(LeadScore.id)).filter(LeadScore.bucket == "COLD").scalar()

    avg_score = db.query(func.avg(LeadScore.score)).scalar() or 0

    return {
        "total": total,
        "hot": hot,
        "warm": warm,
        "cold": cold,
        "avg_score": round(float(avg_score), 2)
    }
