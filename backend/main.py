from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import joblib
import numpy as np
import os
import uuid
import time

from jose import jwt, JWTError
from passlib.context import CryptContext

# --------- RATE LIMITING ---------
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ---------------- CONFIG ----------------

JWT_SECRET = "super-secret-change-this"
JWT_ALGO = "HS256"

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# In-memory user store (TEMP, will move to DB later)
USERS = {}  # email -> {hashed_password, brokerage_id, brokerage_name}

# ---------------- LOAD MODEL ----------------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "lead_scorer_v1.pkl")
model = joblib.load(MODEL_PATH)

# ---------------- APP ----------------

app = FastAPI(title="Real Estate Lead Scorer", version="1.0.0")

# ---------------- RATE LIMITER SETUP ----------------

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"}
    )

# ---------------- SECURITY HEADERS MIDDLEWARE ----------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

    # Allow Swagger UI to load its JS/CSS
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

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------------- ROUTES ----------------

@app.get("/")
def health():
    return {"status": "ok"}

# -------- AUTH --------

@app.post("/auth/register-brokerage")
@limiter.limit("10/minute")
def register(request: Request, data: RegisterInput):
    if data.email in USERS:
        raise HTTPException(status_code=400, detail="User already exists")

    brokerage_id = str(uuid.uuid4())

    USERS[data.email] = {
        "hashed_password": hash_password(data.password),
        "brokerage_id": brokerage_id,
        "brokerage_name": data.brokerage_name
    }

    token = create_jwt(brokerage_id, data.email)

    return {
        "message": "Brokerage registered",
        "brokerage_id": brokerage_id,
        "access_token": token
    }

@app.post("/auth/login")
@limiter.limit("20/minute")
def login(request: Request, data: LoginInput):
    user = USERS.get(data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt(user["brokerage_id"], data.email)

    return {
        "access_token": token
    }

# -------- PROTECTED SCORING --------

@app.post("/leads/score")
@limiter.limit("100/minute")
def score_lead(request: Request, lead: LeadInput, user=Depends(get_current_user)):
    brokerage_id = user["brokerage_id"]

    # Feature engineering (MUST match training)
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

    return {
        "brokerage_id": brokerage_id,
        "score": score,
        "bucket": bucket,
        "probability": float(prob)
    }
