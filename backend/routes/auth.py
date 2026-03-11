import os
import uuid
import time
import secrets
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
import httpx
from urllib.parse import urlencode

from backend.db import get_db, set_tenant
from backend.models import User
from backend.services.email_verify import send_verify_email, send_password_reset_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

SECRET_KEY     = os.getenv("JWT_SECRET", os.getenv("JWT_SECRET_KEY", "change-me"))
ALGORITHM      = "HS256"
FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:5173")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────
class RegisterInput(BaseModel):
    email: str
    password: str
    brokerage_name: str
    industry: str = "real_estate"

class LoginInput(BaseModel):
    email: str
    password: str

class ForgotPasswordInput(BaseModel):
    email: str

class ResetPasswordInput(BaseModel):
    token: str
    password: str

class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

class UpdateProfileInput(BaseModel):
    brokerage_name: str | None = None
    industry: str | None = None
    role: str | None = None
    notification_threshold: int | None = None
    email_alerts: bool | None = None
    hot_lead_only: bool | None = None


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def generate_api_key() -> str:
    """Generate a unique API key like lraiABC123..."""
    return "lrai" + secrets.token_hex(16)

def create_jwt(brokerage_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": email, "brokerage_id": str(brokerage_id), "iat": int(time.time())},
        SECRET_KEY, algorithm=ALGORITHM
    )

def create_access_token(data: dict) -> str:
    return jwt.encode({**data, "iat": int(time.time())}, SECRET_KEY, algorithm=ALGORITHM)


# ─────────────────────────────────────────────
# DEPENDENCY: get_current_user
# ─────────────────────────────────────────────
def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ")[1]
    try:
        payload      = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email        = payload.get("sub")
        brokerage_id = payload.get("brokerage_id")

        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        if brokerage_id:
            try: set_tenant(db, brokerage_id)
            except Exception: pass

        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "authenticated": True,
            "user_id":       str(user.id),
            "brokerage_id":  str(user.brokerage_id),
            "email":         user.email,
            "sub":           user.email,
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid")


# ─────────────────────────────────────────────
# WELCOME EMAIL
# ─────────────────────────────────────────────
async def send_welcome_email(email: str, name: str):
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping welcome email")
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    "from": "LeadRankerAI <onboarding@leadrankerai.com>",
                    "to": [email],
                    "subject": "Welcome to LeadRankerAI 🎉",
                    "html": f"""
                    <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:auto;
                                padding:40px 24px;color:#334155">
                      <h1 style="color:#2563eb;margin:0 0 8px">Welcome to LeadRankerAI!</h1>
                      <p style="font-size:16px;color:#64748b">Hi {name},</p>
                      <p style="font-size:15px;line-height:1.7">
                        You're now set up with a <strong>Free Trial</strong> — 50 AI lead scores
                        to get you started.
                      </p>
                      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:24px 0">
                        <p style="margin:0 0 8px;font-weight:700;color:#1e293b">🚀 Quick Start:</p>
                        <ul style="color:#475569;line-height:2;margin:0;padding-left:20px">
                          <li>Go to <strong>Connections</strong> to get your API key</li>
                          <li>Paste a lead message to get an instant AI score</li>
                          <li>Set up email forwarding to auto-score inbound leads</li>
                        </ul>
                      </div>
                      <div style="background:#eff6ff;border-left:4px solid #2563eb;
                                  padding:16px;border-radius:8px;margin-bottom:24px">
                        <p style="margin:0;color:#1e40af;font-size:14px">
                          🎁 <strong>Free Trial:</strong> 50 leads/month.
                          Upgrade to Starter ($19/mo) for 1,000 leads.
                        </p>
                      </div>
                      <a href="{FRONTEND_URL}/dashboard"
                         style="display:inline-block;background:#2563eb;color:#fff;
                                padding:14px 32px;border-radius:10px;text-decoration:none;
                                font-weight:bold;font-size:15px">
                        Go to Dashboard →
                      </a>
                      <p style="color:#94a3b8;font-size:12px;margin-top:40px;
                                border-top:1px solid #f1f5f9;padding-top:20px">
                        LeadRankerAI ·
                        <a href="{FRONTEND_URL}/privacy" style="color:#94a3b8">Privacy</a> ·
                        <a href="{FRONTEND_URL}/terms" style="color:#94a3b8">Terms</a>
                      </p>
                    </div>
                    """
                },
                timeout=10
            )
        logger.info(f"Welcome email sent to {email}")
    except Exception as e:
        logger.warning(f"Welcome email failed (non-fatal): {e}")


# ─────────────────────────────────────────────
# POST /api/v1/auth/register
# FIXED: generates api_key for every new brokerage
# ─────────────────────────────────────────────
@router.post("/register")
async def register(data: RegisterInput, db: Session = Depends(get_db)):
    email = data.email.lower().strip()

    exists = db.execute(
        text("SELECT id FROM users WHERE LOWER(email) = :e"), {"e": email}
    ).fetchone()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    bid     = str(uuid.uuid4())
    uid     = str(uuid.uuid4())
    api_key = generate_api_key()  # FIXED: always generate api_key

    db.execute(text("""
        INSERT INTO brokerages (id, name, plan, industry, api_key)
        VALUES (:i, :n, 'trial', :ind, :ak)
    """), {"i": bid, "n": data.brokerage_name, "ind": data.industry, "ak": api_key})

    db.execute(text("""
        INSERT INTO users (id, email, hashed_password, brokerage_id)
        VALUES (:i, :e, :p, :b)
    """), {"i": uid, "e": email, "p": hash_password(data.password), "b": bid})

    try:
        token = send_verify_email(email)
        db.execute(text("""
            INSERT INTO email_verifications (id, email, token, expires_at, verified)
            VALUES (:i, :e, :t, :x, false)
            ON CONFLICT (email) DO UPDATE SET token=:t, expires_at=:x, verified=false
        """), {
            "i": str(uuid.uuid4()), "e": email, "t": token,
            "x": datetime.utcnow() + timedelta(hours=24)
        })
    except Exception as ex:
        logger.warning(f"Verification email failed: {ex}")

    db.commit()
    await send_welcome_email(email, data.brokerage_name)

    return {
        "status": "verification_sent",
        "message": "Account created! Check your email to verify your account."
    }


# ─────────────────────────────────────────────
# POST /api/v1/auth/login
# ─────────────────────────────────────────────
@router.post("/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT u.id, u.hashed_password, u.brokerage_id,
               COALESCE(ev.verified, false) AS verified
        FROM users u
        LEFT JOIN email_verifications ev ON LOWER(ev.email) = LOWER(u.email)
        WHERE LOWER(u.email) = LOWER(:e)
        LIMIT 1
    """), {"e": data.email}).fetchone()

    if not row or not verify_password(data.password, row.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not row.verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox and click the verification link."
        )

    return {
        "access_token": create_jwt(str(row.brokerage_id), data.email),
        "token_type": "bearer"
    }


# ─────────────────────────────────────────────
# GET /api/v1/auth/me
# FIXED: returns api_key + auto-generates if missing
# ─────────────────────────────────────────────
@router.get("/me")
def get_me(user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT b.name AS brokerage_name, b.industry, b.plan, b.api_key,
               COALESCE(u.role, 'Manager') AS role,
               COALESCE(u.notification_threshold, 80) AS notification_threshold,
               COALESCE(u.email_alerts, true) AS email_alerts,
               COALESCE(u.hot_lead_only, false) AS hot_lead_only,
               u.avatar_url
        FROM brokerages b
        JOIN users u ON u.brokerage_id = b.id
        WHERE LOWER(u.email) = LOWER(:e)
    """), {"e": user["email"]}).fetchone()

    # Auto-fix: generate api_key if missing
    api_key = row.api_key if row and row.api_key else None
    if not api_key:
        api_key = generate_api_key()
        db.execute(
            text("UPDATE brokerages SET api_key = :ak WHERE id = :bid"),
            {"ak": api_key, "bid": user["brokerage_id"]}
        )
        db.commit()
        logger.info(f"Auto-generated api_key for brokerage {user['brokerage_id']}")

    return {
        "email":                  user["email"],
        "brokerage_id":           user["brokerage_id"],
        "brokerage_name":         row.brokerage_name if row else "",
        "industry":               row.industry if row else "real_estate",
        "plan":                   row.plan if row else "trial",
        "role":                   row.role if row else "Manager",
        "notification_threshold": row.notification_threshold if row else 80,
        "email_alerts":           row.email_alerts if row else True,
        "hot_lead_only":          row.hot_lead_only if row else False,
        "avatar_url":             row.avatar_url if row else None,
        "api_key":                api_key,  # FIXED: now returned to frontend
    }


# ─────────────────────────────────────────────
# PATCH /api/v1/auth/me
# ─────────────────────────────────────────────
@router.patch("/me")
def update_me(
    data: UpdateProfileInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updates = {}
    if data.brokerage_name is not None:
        updates["brokerage_name"] = data.brokerage_name
    if data.industry is not None:
        updates["industry"] = data.industry
    if data.role is not None:
        updates["role"] = data.role
    if data.notification_threshold is not None:
        updates["notification_threshold"] = data.notification_threshold
    if data.email_alerts is not None:
        updates["email_alerts"] = data.email_alerts
    if data.hot_lead_only is not None:
        updates["hot_lead_only"] = data.hot_lead_only

    if "brokerage_name" in updates or "industry" in updates:
        set_parts = []
        params = {"bid": user["brokerage_id"]}
        if "brokerage_name" in updates:
            set_parts.append("name = :name")
            params["name"] = updates["brokerage_name"]
        if "industry" in updates:
            set_parts.append("industry = :industry")
            params["industry"] = updates["industry"]
        if set_parts:
            db.execute(
                text(f"UPDATE brokerages SET {', '.join(set_parts)} WHERE id = :bid"),
                params
            )

    user_set_parts = []
    user_params = {"email": user["email"]}
    for field in ["role", "notification_threshold", "email_alerts", "hot_lead_only"]:
        if field in updates:
            user_set_parts.append(f"{field} = :{field}")
            user_params[field] = updates[field]

    if user_set_parts:
        db.execute(
            text(f"UPDATE users SET {', '.join(user_set_parts)} WHERE LOWER(email) = LOWER(:email)"),
            user_params
        )

    db.commit()
    return {"status": "updated"}


# ─────────────────────────────────────────────
# POST /api/v1/auth/avatar
# ─────────────────────────────────────────────
@router.post("/avatar")
async def upload_avatar(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    raise HTTPException(
        status_code=501,
        detail="Avatar upload requires cloud storage (S3/Cloudflare R2). Coming soon."
    )


# ─────────────────────────────────────────────
# POST /api/v1/auth/change-password
# ─────────────────────────────────────────────
@router.post("/change-password")
def change_password(
    data: ChangePasswordInput,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    row = db.execute(
        text("SELECT hashed_password FROM users WHERE LOWER(email) = LOWER(:e)"),
        {"e": user["email"]}
    ).fetchone()

    if not row or not verify_password(data.current_password, row.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db.execute(
        text("UPDATE users SET hashed_password = :p WHERE LOWER(email) = LOWER(:e)"),
        {"p": hash_password(data.new_password), "e": user["email"]}
    )
    db.commit()
    return {"message": "Password updated successfully"}


# ─────────────────────────────────────────────
# GET /api/v1/auth/verify
# ─────────────────────────────────────────────
@router.get("/verify")
def verify_email(token: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT email FROM email_verifications
        WHERE token = :t AND expires_at > NOW() AND verified = false
    """), {"t": token}).fetchone()

    if not row:
        return HTMLResponse(content=f"""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#fef2f2">
          <div style="max-width:400px;margin:auto;background:white;padding:40px;border-radius:16px">
            <div style="font-size:48px">⚠️</div>
            <h2 style="color:#dc2626">Invalid or Expired Link</h2>
            <p style="color:#64748b">This link has already been used or expired.</p>
            <a href="{FRONTEND_URL}/register"
               style="display:inline-block;background:#2563eb;color:white;padding:12px 28px;
                      border-radius:10px;text-decoration:none;font-weight:bold;margin-top:16px">
              Register Again →
            </a>
          </div>
        </body></html>""", status_code=400)

    db.execute(
        text("UPDATE email_verifications SET verified = true WHERE email = :e"),
        {"e": row.email}
    )
    db.commit()

    return HTMLResponse(content=f"""
    <html><head>
      <meta http-equiv="refresh" content="3;url={FRONTEND_URL}/login?verified=true"/>
    </head><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4">
      <div style="max-width:400px;margin:auto;background:white;padding:40px;border-radius:16px;
                  box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="font-size:56px;margin-bottom:16px">✅</div>
        <h2 style="color:#16a34a;margin:0 0 8px">Email Verified!</h2>
        <p style="color:#64748b">Your LeadRankerAI account is now active.</p>
        <p style="color:#94a3b8;font-size:13px">Redirecting to login in 3 seconds...</p>
        <a href="{FRONTEND_URL}/login?verified=true"
           style="display:inline-block;margin-top:20px;background:#2563eb;color:white;
                  padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:bold">
          Go to Login →
        </a>
      </div>
    </body></html>""")


# ─────────────────────────────────────────────
# POST /api/v1/auth/forgot-password
# ─────────────────────────────────────────────
@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id FROM users WHERE LOWER(email) = LOWER(:e)"), {"e": data.email}
    ).fetchone()

    if not row:
        return {"message": "If that account exists, a reset link has been sent"}

    db.execute(text("DELETE FROM password_resets WHERE LOWER(email) = LOWER(:e)"), {"e": data.email})
    token = str(uuid.uuid4())
    db.execute(text("""
        INSERT INTO password_resets (id, email, token, expires_at)
        VALUES (:i, :e, :t, :x)
    """), {"i": str(uuid.uuid4()), "e": data.email, "t": token,
           "x": datetime.utcnow() + timedelta(hours=1)})
    db.commit()

    try:
        send_password_reset_email(data.email, token)
    except Exception as ex:
        logger.warning(f"Reset email failed: {ex}")

    return {"message": "If that account exists, a reset link has been sent"}


# ─────────────────────────────────────────────
# POST /api/v1/auth/reset-password
# ─────────────────────────────────────────────
@router.post("/reset-password")
def reset_password(data: ResetPasswordInput, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT email FROM password_resets WHERE token = :t AND expires_at > NOW()
    """), {"t": data.token}).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    db.execute(
        text("UPDATE users SET hashed_password = :p WHERE LOWER(email) = LOWER(:e)"),
        {"p": hash_password(data.password), "e": row.email}
    )
    db.execute(text("DELETE FROM password_resets WHERE token = :t"), {"t": data.token})
    db.commit()
    return {"message": "Password updated successfully"}


# ─────────────────────────────────────────────
# DELETE /api/v1/auth/account
# ─────────────────────────────────────────────
@router.delete("/account")
def delete_account(user=Depends(get_current_user), db: Session = Depends(get_db)):
    bid   = user["brokerage_id"]
    email = user["email"]
    db.execute(text("DELETE FROM lead_scores         WHERE brokerage_id = :b"), {"b": bid})
    db.execute(text("DELETE FROM referrals           WHERE referrer_brokerage_id = :b OR referee_brokerage_id = :b"), {"b": bid})
    db.execute(text("DELETE FROM email_verifications WHERE LOWER(email) = LOWER(:e)"), {"e": email})
    db.execute(text("DELETE FROM password_resets     WHERE LOWER(email) = LOWER(:e)"), {"e": email})
    db.execute(text("DELETE FROM users               WHERE brokerage_id = :b"), {"b": bid})
    db.execute(text("DELETE FROM brokerages          WHERE id = :b"), {"b": bid})
    db.commit()
    return {"status": "deleted"}


# ─────────────────────────────────────────────
# GET /api/v1/auth/google/login
# ─────────────────────────────────────────────
@router.get("/google/login")
def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account"
    }
    return {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}


# ─────────────────────────────────────────────
# GET /api/v1/auth/google/callback
# FIXED: generates api_key for Google OAuth new users too
# ─────────────────────────────────────────────
@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    token_data   = token_res.json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.error(f"Google token exchange failed: {token_data}")
        raise HTTPException(status_code=400, detail="Google authentication failed")

    async with httpx.AsyncClient() as client:
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )

    user_data = user_res.json()
    email     = user_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return email")

    row = db.execute(
        text("SELECT brokerage_id FROM users WHERE LOWER(email) = LOWER(:e)"), {"e": email}
    ).fetchone()

    if row:
        brokerage_id = str(row.brokerage_id)
        # Auto-fix missing api_key for existing Google users
        existing_key = db.execute(
            text("SELECT api_key FROM brokerages WHERE id = :bid"),
            {"bid": brokerage_id}
        ).fetchone()
        if not existing_key or not existing_key[0]:
            db.execute(
                text("UPDATE brokerages SET api_key = :ak WHERE id = :bid"),
                {"ak": generate_api_key(), "bid": brokerage_id}
            )
            db.commit()
    else:
        brokerage_id = str(uuid.uuid4())
        user_id      = str(uuid.uuid4())
        display_name = user_data.get("name", "Google User")
        api_key      = generate_api_key()  # FIXED: api_key for Google users

        db.execute(text("""
            INSERT INTO brokerages (id, name, plan, industry, api_key)
            VALUES (:i, :n, 'trial', 'real_estate', :ak)
        """), {"i": brokerage_id, "n": display_name, "ak": api_key})

        db.execute(text("""
            INSERT INTO users (id, email, hashed_password, brokerage_id)
            VALUES (:i, :e, :p, :b)
        """), {"i": user_id, "e": email,
               "p": hash_password(str(uuid.uuid4())), "b": brokerage_id})

        db.execute(text("""
            INSERT INTO email_verifications (id, email, token, expires_at, verified)
            VALUES (:i, :e, :t, :x, true)
            ON CONFLICT (email) DO UPDATE SET verified = true
        """), {"i": str(uuid.uuid4()), "e": email,
               "t": str(uuid.uuid4()), "x": datetime.utcnow() + timedelta(days=3650)})

        db.commit()
        await send_welcome_email(email, display_name)

    jwt_token = create_jwt(brokerage_id, email)
    return RedirectResponse(url=f"{FRONTEND_URL}/oauth-success?token={jwt_token}")