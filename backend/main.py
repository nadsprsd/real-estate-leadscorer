
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
from fastapi.responses import RedirectResponse

from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext

from sqlalchemy import text, func
from sqlalchemy.orm import Session

import stripe
import httpx
from urllib.parse import urlencode

from backend.db import get_db, set_tenant
from backend.models import LeadScore
from backend.services.ai_engine import analyze_lead_message
from backend.services.alerts import send_hot_alert
from backend.services.email_verify import (
    send_verify_email,
    send_password_reset_email
)
# --------------------------------------------------
# CONFIG
# --------------------------------------------------


STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

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

app = FastAPI(title="LeadRankerAI SaaS")

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
    industry: str


class LoginInput(BaseModel):
    email: str
    password: str


class LeadInput(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    message: str
    source: str = "manual"
    campaign: str | None = None


class CheckoutInput(BaseModel):
    plan: str


class ForgotPasswordInput(BaseModel):
    email: str


class ResetPasswordInput(BaseModel):
    token: str
    password: str


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
# Google Auth/Login
# --------------------------------------------------

@app.get("/auth/google/login")
def google_login():

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account"
    }

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    return {"auth_url": url}



# --------------------------------------------------
# BILLING
# --------------------------------------------------

def get_billing_status(db: Session, bid: str) -> Dict:

    usage_row = db.execute(text("""
        SELECT COUNT(*)
        FROM lead_scores
        WHERE brokerage_id=:id
          AND created_at >= date_trunc('month', NOW())
    """), {"id": bid}).fetchone()

    usage = usage_row[0] if usage_row else 0

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
# CORE SAVE (NO ALERT LOGIC HERE)
# --------------------------------------------------

def save_lead(
    db: Session,
    brokerage_id: str,
    user_email: str,
    payload: dict,
    ai: dict
):

    is_lead = ai.get("is_lead", False)
    score = int(ai.get("urgency_score", 0))

    if not is_lead:
        bucket = "IGNORE"
        score = 0
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

    # 🔥 HOT ALERT CENTRALIZED
    if bucket == "HOT":

        owner = db.execute(text("""
            SELECT email
            FROM users
            WHERE brokerage_id=:bid
            LIMIT 1
        """), {"bid": brokerage_id}).fetchone()

        if owner:
            send_hot_alert(
                to_email=owner.email,
                lead_data={
                    **payload,
                    "score": score
                }
            )

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
    "name": lead.name,
    "email": lead.email,
    "phone": lead.phone,
    "message": lead.message,
    "source": lead.source,
    "campaign": lead.campaign,
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
# EMAIL INBOUND (Resend → LeadRankerAI) FIXED
# --------------------------------------------------

RESEND_API_KEY = os.getenv("RESEND_API_KEY")


async def fetch_full_email(email_id: str):

    async with httpx.AsyncClient() as client:

        res = await client.get(
            f"https://api.resend.com/emails/receiving/{email_id}",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}"
            },
            timeout=10
        )

        if res.status_code != 200:

            logging.error(f"❌ Failed to fetch email: {res.text}")
            return None

        return res.json()


@app.post("/inbound/email")
async def inbound_email(request: Request, db: Session = Depends(get_db)):

    try:

        payload = await request.json()

        logging.info("📧 Inbound webhook received")

        data = payload.get("data", {})

        email_id = data.get("email_id")

        if not email_id:
            logging.warning("❌ Missing email_id")
            return {"ok": True}

        # Fetch full email from Resend
        email_full = await fetch_full_email(email_id)

        if not email_full:
            return {"ok": True}

        to_list = email_full.get("to", [])
        from_email = email_full.get("from", "")
        subject = email_full.get("subject", "")

        text_msg = (
            email_full.get("text")
            or email_full.get("html")
            or ""
        )

        if not text_msg:
            logging.warning("❌ No email content found")
            return {"ok": True}

        to_email = to_list[0] if isinstance(to_list, list) else to_list

        if "+" not in to_email:
            logging.warning("❌ Invalid forwarding email")
            return {"ok": True}

        brokerage_id = to_email.split("+")[1].split("@")[0]

        logging.info(f"🏢 Brokerage detected: {brokerage_id}")

        # Get industry
        row = db.execute(
            text("SELECT industry FROM brokerages WHERE id=:i"),
            {"i": brokerage_id}
        ).fetchone()

        if not row:
            logging.warning("❌ Brokerage not found")
            return {"ok": True}

        industry = row.industry

        full_message = f"{subject}\n\n{text_msg}"

        # AI scoring
        ai = analyze_lead_message(full_message, industry)

        payload_db = {

            "name": None,
            "email": from_email,
            "phone": None,

            "message": full_message,

            "source": "email",
            "campaign": None
        }

        lead_obj, bucket, score = save_lead(

            db,
            brokerage_id,
            from_email,
            payload_db,
            ai
        )

        logging.info(f"✅ Lead saved: {lead_obj.id}")

        return {"status": "received"}

    except Exception as e:

        logging.exception("❌ Email ingest failed")

        return {"ok": True}



# --------------------------------------------------
# UNIVERSAL WEBHOOK INGEST (Website / CRM / Ads)
# --------------------------------------------------

@app.post("/inbound/{brokerage_id}")
async def inbound_webhook(
    brokerage_id: str,
    lead: LeadInput,
    db: Session = Depends(get_db)
):

    logging.info("🌐 Webhook lead received")

    # 🔎 Get industry
    row = db.execute(
        text("SELECT industry FROM brokerages WHERE id=:i"),
        {"i": brokerage_id}
    ).fetchone()

    if not row:
        raise HTTPException(404, "Brokerage not found")

    industry = row.industry

    # AI scoring
    ai = analyze_lead_message(lead.message, industry)

    payload = {
        "name": lead.name,
        "email": lead.email,
        "phone": lead.phone,
        "message": lead.message,
        "source": lead.source,
        "campaign": lead.campaign,
        "entities": ai.get("entities", {})
    }

    lead_obj, bucket, score = save_lead(
        db,
        brokerage_id,
        lead.email or "unknown",
        payload,
        ai
    )

    # 🔥 Send HOT alert to brokerage owner
    if bucket == "HOT":

        owner = db.execute(text("""
            SELECT email
            FROM users
            WHERE brokerage_id=:bid
            LIMIT 1
        """), {"bid": brokerage_id}).fetchone()

        if owner:
            send_hot_alert(
                to_email=owner.email,
                lead_data={
                    **payload,
                    "score": score
                }
            )

    return {
        "status": "received",
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
            "name": r.input_payload.get("name"),
            "email": r.input_payload.get("email"),
            "phone": r.input_payload.get("phone"),
            "campaign": r.input_payload.get("campaign"),
            "source": r.input_payload.get("source"),

            "message": r.input_payload.get("message"),

            "score": r.score,
            "bucket": r.bucket,
            "sentiment": r.sentiment,
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



# --------------------------------------------------
# Magic link
# --------------------------------------------------



@app.get("/settings/connections")
def get_connections(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    bid = user["brokerage_id"]

    email_forward = f"leads+{bid}@leadrankerai.com"
    webhook_url = f"https://api.leadrankerai.com/inbound/{bid}"

    return {
        "email_forwarding": email_forward,
        "webhook_url": webhook_url,
        "status": "connected"
    }

#Google auth config

@app.get("/auth/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    token_data = token_res.json()

    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(400, "Google auth failed")

    # Get user info
    async with httpx.AsyncClient() as client:
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )

    user_data = user_res.json()

    email = user_data.get("email")

    if not email:
        raise HTTPException(400, "Email not provided")

    # Check if user exists
    row = db.execute(text("""
        SELECT brokerage_id FROM users WHERE email=:e
    """), {"e": email}).fetchone()

    if row:
        brokerage_id = row.brokerage_id
    else:
        # Auto-create new brokerage + user
        brokerage_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        db.execute(text("""
            INSERT INTO brokerages (id,name,plan,industry)
            VALUES (:i,:n,'trial','real_estate')
        """), {"i": brokerage_id, "n": "Google User"})

        db.execute(text("""
            INSERT INTO users (id,email,hashed_password,brokerage_id)
            VALUES (:i,:e,:p,:b)
        """), {
            "i": user_id,
            "e": email,
            "p": hash_password(str(uuid.uuid4())),
            "b": brokerage_id
        })

        db.commit()

    # Create JWT
        jwt_token = create_jwt(brokerage_id, email)

# Redirect to frontend with token
        frontend_url = f"http://localhost:5173/oauth-success?token={jwt_token}"

        return RedirectResponse(url=frontend_url)

    # Redirect to frontend
        return JSONResponse({
        "access_token": jwt_token,
        "email": email
})


#Forgot password


@app.post("/auth/forgot-password")
def forgot_password(
    data: ForgotPasswordInput,
    db: Session = Depends(get_db)
):
    email = data.email

    row = db.execute(
        text("SELECT id FROM users WHERE email=:e"),
        {"e": email}
    ).fetchone()

    if not row:
        return {"message": "If account exists, reset link sent"}

    # 🔥 Delete old tokens first
    db.execute(text("""
        DELETE FROM password_resets
        WHERE email=:e
    """), {"e": email})

    token = str(uuid.uuid4())

    db.execute(text("""
        INSERT INTO password_resets (id,email,token,expires_at)
        VALUES (:i,:e,:t,:x)
    """), {
        "i": str(uuid.uuid4()),
        "e": email,
        "t": token,
        "x": datetime.utcnow() + timedelta(hours=1)
    })

    db.commit()

    send_password_reset_email(email, token)

    return {"message": "If account exists, reset link sent"}



#Password Reset

@app.post("/auth/reset-password")
def reset_password(
    data: ResetPasswordInput,
    db: Session = Depends(get_db)
):

    # 🔎 Find valid token
    row = db.execute(text("""
        SELECT email
        FROM password_resets
        WHERE token=:t AND expires_at > NOW()
    """), {"t": data.token}).fetchone()

    if not row:
        raise HTTPException(400, "Invalid or expired token")

    # 🔐 Hash new password
    new_hash = hash_password(data.password)

    # 🔄 Update user password
    db.execute(text("""
        UPDATE users
        SET hashed_password=:p
        WHERE email=:e
    """), {
        "p": new_hash,
        "e": row.email
    })

    # ❌ Delete reset token after use
    db.execute(text("""
        DELETE FROM password_resets
        WHERE token=:t
    """), {"t": data.token})

    db.commit()

    return {"message": "Password updated successfully"}