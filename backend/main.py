import os
import uuid
import time
import logging
import joblib
import numpy as np
from datetime import datetime
from typing import Optional, Dict

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

# Import your local database modules
from backend.db import get_db, set_tenant
from backend.models import LeadScore

# ---------------- CONFIG & CONSTANTS ----------------

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-change-this-in-prod")
JWT_ALGO = "HS256"

# Centralized Plan Management
PLANS = {
    "FREE": {"limit": 50, "label": "Free Trial"},
    "SOLO": {"limit": 500, "label": "Solo Agent"},
    "TEAM": {"limit": 5000, "label": "Brokerage Team"},
    "ENTERPRISE": {"limit": 999999, "label": "Enterprise"},
}

# ---------------- APP INITIALIZATION ----------------

app = FastAPI(title="Real Estate Lead Scorer SaaS", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with actual frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Rate Limiter setup to prevent API abuse
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Slow down!"})

# ---------------- LOGGING & ML MODEL ----------------

LOG_PATH = os.path.join(os.path.dirname(__file__), "audit.log")
logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "lead_scorer_v1.pkl")
try:
    model = joblib.load(MODEL_PATH)
except Exception as e:
    logging.error(f"Failed to load ML model: {e}")
    model = None

# ---------------- MIDDLEWARE ----------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
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

# ---------------- UTILITIES & AUTH ----------------

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)

def create_jwt(brokerage_id: str, email: str):
    payload = {
        "sub": email,
        "brokerage_id": brokerage_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + (60 * 60 * 24) # 24 hour expiry
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        # Force Multi-tenancy at the DB level
        set_tenant(db, payload["brokerage_id"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ---------------- BILLING LOGIC ----------------

def get_billing_status(db: Session, brokerage_id: str) -> Dict:
    row = db.execute(
        text("SELECT plan, monthly_usage FROM brokerages WHERE id = :id"),
        {"id": brokerage_id}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Brokerage record not found")

    plan_key = row.plan.upper()
    limit = PLANS.get(plan_key, PLANS["FREE"])["limit"]
    usage = row.monthly_usage
    
    percent_used = int((usage / limit) * 100) if limit > 0 else 0
    
    # Alert Logic
    warning = None
    if percent_used >= 100:
        warning = "CRITICAL: Quota exhausted. Please upgrade to continue scoring leads."
    elif percent_used >= 90:
        warning = "WARNING: 90% of credits used. Service will stop soon."
    elif percent_used >= 75:
        warning = "NOTICE: 75% of credits used."

    return {
        "plan": plan_key,
        "used": usage,
        "limit": limit,
        "remaining": max(limit - usage, 0),
        "percent_used": percent_used,
        "warning": warning,
        "is_blocked": usage >= limit
    }

# ---------------- ROUTES ----------------

@app.get("/health")
def health_check():
    return {"status": "active", "model_loaded": model is not None}

# --- Auth Routes ---

@app.post("/auth/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterInput, db: Session = Depends(get_db)):
    exists = db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": data.email}).fetchone()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    brokerage_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    db.execute(
        text("INSERT INTO brokerages (id, name, plan, monthly_usage) VALUES (:id, :name, 'FREE', 0)"),
        {"id": brokerage_id, "name": data.brokerage_name}
    )

    db.execute(
        text("INSERT INTO users (id, email, hashed_password, brokerage_id) VALUES (:id, :email, :hp, :bid)"),
        {"id": user_id, "email": data.email, "hp": hash_password(data.password), "bid": brokerage_id}
    )

    db.commit()
    return {"access_token": create_jwt(brokerage_id, data.email)}

@app.post("/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT hashed_password, brokerage_id FROM users WHERE email = :email"),
        {"email": data.email}
    ).fetchone()

    if not row or not verify_password(data.password, row.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": create_jwt(str(row.brokerage_id), data.email)}

# --- Scoring Route ---

@app.post("/leads/score")
@limiter.limit("50/minute")
async def score_lead(request: Request, lead: LeadInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    brokerage_id = user["brokerage_id"]

    # 1. Check Quota Before Processing
    billing = get_billing_status(db, brokerage_id)
    if billing["is_blocked"]:
        raise HTTPException(status_code=402, detail=billing["warning"])

    # 2. Feature Engineering
    # (Matches the training logic of the ML model)
    buyer_readiness = (
        (1 if lead.budget >= 500000 else 0) * 30 +
        (1 if lead.urgency <= 30 else 0) * 30 +
        (1 if lead.preapproved == 1 else 0) * 40
    )
    engagement = (
        (lead.views / 50.0) * 50 +
        (lead.saves / 20.0) * 30 +
        (1 if lead.open_house == 1 else 0) * 20
    )
    speed_penalty = min(max(lead.agent_response_hours, 0), 72) / 72.0 * 100

    X = np.array([[ 
        lead.budget, lead.urgency, lead.views, lead.saves, lead.bedrooms,
        lead.preapproved, lead.open_house, lead.agent_response_hours,
        buyer_readiness, engagement, speed_penalty
    ]])

    # 3. Model Prediction
    try:
        prob = model.predict_proba(X)[0][1]
        score = int(prob * 100)
    except Exception as e:
        logging.error(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail="ML Model Inference Failed")

    bucket = "HOT" if score >= 70 else "WARM" if score >= 40 else "COLD"

    # 4. Save Record & Increment Billing
    new_record = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=user["sub"],
        input_payload=lead.model_dump(), # Pydantic v2
        score=score,
        bucket=bucket,
        created_at=datetime.utcnow()
    )
    db.add(new_record)
    
    db.execute(
        text("UPDATE brokerages SET monthly_usage = monthly_usage + 1 WHERE id = :id"),
        {"id": brokerage_id}
    )
    
    db.commit()

    # 5. Return Result + Real-time Billing Metadata
    return {
        "score": score,
        "bucket": bucket,
        "probability": round(float(prob), 4),
        "billing_update": get_billing_status(db, brokerage_id)
    }

# --- Billing Dashboard Route ---

@app.get("/billing/usage")
def view_usage(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return get_billing_status(db, user["brokerage_id"])