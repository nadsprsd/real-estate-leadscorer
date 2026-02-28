# backend/routes/auth.py
# ─────────────────────────────────────────────────────────────────────
# FIXED: Register now sends ONLY the verification email.
#        Welcome email fires later when user clicks verify link.
#        This prevents 2 emails in 3 seconds feeling spammy.
# FIXED: JWT uses JWT_SECRET env var (not SECRET_KEY)
# FIXED: JWT has 7-day expiry
# FIXED: create_jwt() has time import
# ─────────────────────────────────────────────────────────────────────

import os
import uuid
import time
import logging
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from jose import jwt, JWTError
from passlib.context import CryptContext

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

import httpx
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config

from backend.db import get_db, set_tenant
from backend.models import User, Brokerage

load_dotenv()

logger    = logging.getLogger(__name__)
router    = APIRouter(prefix="/api/v1/auth", tags=["auth"])
security  = HTTPBearer()
pwd_ctx   = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── JWT config ───────────────────────────────────────────────────────
# Uses JWT_SECRET (set this in your .env — generate with: python -c "import secrets; print(secrets.token_hex(32))")
SECRET_KEY = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM  = "HS256"

# ─── Google OAuth ─────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:5173")
RESEND_API_KEY       = os.getenv("RESEND_API_KEY", "")

oauth = OAuth(Config(environ={
    "GOOGLE_CLIENT_ID":     GOOGLE_CLIENT_ID,
    "GOOGLE_CLIENT_SECRET": GOOGLE_CLIENT_SECRET,
}))
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


# ─────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────
class RegisterInput(BaseModel):
    name:     str
    email:    str
    password: str
    industry: str = "real_estate"

class LoginInput(BaseModel):
    email:    str
    password: str

class ForgotPasswordInput(BaseModel):
    email: str

class ResetPasswordInput(BaseModel):
    token:        str
    new_password: str


# ─────────────────────────────────────────────
# JWT Helpers
# ─────────────────────────────────────────────
def create_jwt(brokerage_id: str, email: str) -> str:
    """Create a JWT with 7-day expiry."""
    expire = datetime.utcnow() + timedelta(days=7)
    return jwt.encode(
        {
            "sub":          email,
            "brokerage_id": str(brokerage_id),
            "iat":          int(time.time()),
            "exp":          expire,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """
    Decode JWT and return user payload dict.
    All routes that use Depends(get_current_user) get this dict.
    Access fields as user["brokerage_id"], user["sub"], user["email"].
    """
    payload = decode_jwt(credentials.credentials)

    brokerage_id = payload.get("brokerage_id")
    email        = payload.get("sub")

    if not brokerage_id or not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Set tenant context for row-level security (if your db uses it)
    set_tenant(db, brokerage_id)

    # Return flat dict — routes use user["brokerage_id"] etc.
    return {
        "brokerage_id": brokerage_id,
        "sub":          email,
        "email":        email,
    }


# ─────────────────────────────────────────────
# Email Helpers
# ─────────────────────────────────────────────
async def _send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — email skipped")
        return False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    "from":    "LeadRankerAI <onboarding@leadrankerai.com>",
                    "to":      [to],
                    "subject": subject,
                    "html":    html,
                },
                timeout=10,
            )
        ok = res.status_code in (200, 201)
        if not ok:
            logger.error(f"Email failed {res.status_code}: {res.text}")
        return ok
    except Exception as e:
        logger.error(f"Email error: {e}")
        return False


async def send_verify_email(to_email: str, token: str):
    """Email 1 of 2: sent immediately on register."""
    verify_url = f"{FRONTEND_URL}/verify?token={token}"
    await _send_email(
        to_email,
        "Verify your LeadRankerAI account",
        f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#1e40af">Welcome to LeadRankerAI! 🚀</h2>
          <p>Click below to verify your email and activate your account.</p>
          <a href="{verify_url}"
             style="display:inline-block;background:#2563eb;color:#fff;
                    padding:14px 32px;border-radius:10px;text-decoration:none;
                    font-weight:bold;font-size:16px;margin:16px 0">
            Verify My Email →
          </a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px">
            Link expires in 24 hours. If you didn't create an account, ignore this email.
          </p>
        </div>
        """,
    )


async def send_welcome_email(to_email: str, name: str):
    """
    Email 2 of 2: sent ONLY after user clicks verify link.
    FIXED: Was sent simultaneously with verify email — now delayed until verified.
    """
    await _send_email(
        to_email,
        "Your LeadRankerAI account is ready!",
        f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#1e40af">You're verified, {name or 'there'}! 🎉</h2>
          <p style="color:#475569;font-size:16px;line-height:1.6">
            Your LeadRankerAI account is now active. Start scoring leads and 
            discover who's HOT, WARM, or COLD — instantly.
          </p>
          <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0;font-weight:600;color:#334155">Quick start:</p>
            <ul style="color:#64748b;margin:8px 0;padding-left:20px">
              <li>Install the WordPress plugin (40 seconds)</li>
              <li>Or add the email CC address to your inquiry forms</li>
              <li>Your first 50 leads are free</li>
            </ul>
          </div>
          <a href="{FRONTEND_URL}/dashboard"
             style="display:inline-block;background:#2563eb;color:#fff;
                    padding:14px 32px;border-radius:10px;text-decoration:none;
                    font-weight:bold;font-size:16px">
            Go to Dashboard →
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:32px">
            Questions? Reply to this email or chat with Rank, your AI assistant.
          </p>
        </div>
        """,
    )


async def send_password_reset_email(to_email: str, token: str):
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    await _send_email(
        to_email,
        "Reset your LeadRankerAI password",
        f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#1e293b">Password Reset Request</h2>
          <p style="color:#475569">Click below to reset your password. Link expires in 1 hour.</p>
          <a href="{reset_url}"
             style="display:inline-block;background:#dc2626;color:#fff;
                    padding:14px 32px;border-radius:10px;text-decoration:none;
                    font-weight:bold;font-size:16px;margin:16px 0">
            Reset My Password →
          </a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px">
            If you didn't request this, ignore this email. Your password won't change.
          </p>
        </div>
        """,
    )


# ─────────────────────────────────────────────
# POST /register
# FIXED: Sends ONLY verify email here.
#        Welcome email now fires in GET /verify after confirmed.
# ─────────────────────────────────────────────
@router.post("/register")
async def register(data: RegisterInput, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    # Check duplicate
    existing = db.execute(
        text("SELECT id FROM users WHERE LOWER(email) = :email"),
        {"email": email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create brokerage
    brokerage_id = str(uuid.uuid4())
    api_key      = "lrai" + uuid.uuid4().hex
    db.execute(
        text("""
            INSERT INTO brokerages
              (id, name, plan, subscription_status, industry, api_key, updated_at)
            VALUES (:id, :name, 'trial', 'trial', :industry, :api_key, NOW())
        """),
        {
            "id":       brokerage_id,
            "name":     data.name,
            "industry": data.industry,
            "api_key":  api_key,
        },
    )

    # Create user
    user_id         = str(uuid.uuid4())
    hashed_password = pwd_ctx.hash(data.password)
    verify_token    = uuid.uuid4().hex
    token_expiry    = datetime.now(timezone.utc) + timedelta(hours=24)

    db.execute(
        text("""
            INSERT INTO users
              (id, email, hashed_password, brokerage_id,
               role, email_alerts, hot_lead_only, notification_threshold,
               verify_token, verify_token_expiry, is_verified)
            VALUES
              (:id, :email, :pw, :bid,
               'Manager', true, false, 80,
               :token, :expiry, false)
        """),
        {
            "id":     user_id,
            "email":  email,
            "pw":     hashed_password,
            "bid":    brokerage_id,
            "token":  verify_token,
            "expiry": token_expiry,
        },
    )
    db.commit()

    # FIXED: Send ONLY verification email here.
    # Welcome email fires after they click the verify link (see GET /verify).
    await send_verify_email(email, verify_token)

    logger.info(f"Registered | {email} | brokerage={brokerage_id}")
    return {
        "status":  "registered",
        "message": "Check your email to verify your account.",
    }


# ─────────────────────────────────────────────
# GET /verify
# FIXED: Welcome email now fires HERE after verification confirmed
# ─────────────────────────────────────────────
@router.get("/verify")
async def verify_email(token: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            SELECT id, email, verify_token_expiry, brokerage_id
            FROM users
            WHERE verify_token = :token
        """),
        {"token": token},
    ).fetchone()

    if not row:
        return HTMLResponse("""
            <html><body style="font-family:sans-serif;text-align:center;padding:60px">
              <h2 style="color:#dc2626">Invalid or already used link</h2>
              <p>This verification link is not valid or has already been used.</p>
            </body></html>
        """, status_code=400)

    user_id, email, expiry, brokerage_id = row

    # Check expiry
    now = datetime.now(timezone.utc)
    if expiry and expiry.replace(tzinfo=timezone.utc) < now:
        return HTMLResponse("""
            <html><body style="font-family:sans-serif;text-align:center;padding:60px">
              <h2 style="color:#dc2626">Link Expired</h2>
              <p>This verification link expired after 24 hours. Please register again.</p>
            </body></html>
        """, status_code=400)

    # Mark verified
    db.execute(
        text("""
            UPDATE users
            SET is_verified = true, verify_token = NULL, verify_token_expiry = NULL
            WHERE id = :id
        """),
        {"id": user_id},
    )
    db.commit()

    # NOW send welcome email (not on register — avoids 2 emails at once)
    name_row = db.execute(
        text("SELECT name FROM brokerages WHERE id = :bid"),
        {"bid": brokerage_id},
    ).fetchone()
    name = name_row[0] if name_row else ""
    await send_welcome_email(email, name)

    logger.info(f"Verified | {email}")

    # Redirect to login with success flag
    return HTMLResponse(f"""
        <html>
          <head>
            <meta http-equiv="refresh" content="3;url={FRONTEND_URL}/login?verified=true">
          </head>
          <body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc">
            <div style="max-width:400px;margin:auto;background:#fff;border-radius:16px;
                        padding:40px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
              <div style="font-size:48px;margin-bottom:16px">✅</div>
              <h2 style="color:#1e40af">Email Verified!</h2>
              <p style="color:#475569">Your account is now active. Redirecting to login...</p>
              <a href="{FRONTEND_URL}/login?verified=true"
                 style="color:#2563eb;font-weight:600">Click here if not redirected →</a>
            </div>
          </body>
        </html>
    """)


# ─────────────────────────────────────────────
# POST /login
# ─────────────────────────────────────────────
@router.post("/login")
async def login(data: LoginInput, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    row = db.execute(
        text("""
            SELECT id, email, hashed_password, brokerage_id, is_verified
            FROM users WHERE LOWER(email) = :email
        """),
        {"email": email},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id, db_email, hashed_pw, brokerage_id, is_verified = row

    if not pwd_ctx.verify(data.password, hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not is_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email first. Check your inbox.",
        )

    token = create_jwt(brokerage_id, db_email)
    logger.info(f"Login | {email}")

    return {
        "access_token": token,
        "token_type":   "bearer",
        "brokerage_id": brokerage_id,
        "email":        db_email,
    }


# ─────────────────────────────────────────────
# POST /forgot-password
# ─────────────────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordInput, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    row = db.execute(
        text("SELECT id FROM users WHERE LOWER(email) = :email"),
        {"email": email},
    ).fetchone()

    # Always return success — don't reveal whether email exists
    if not row:
        return {"status": "sent", "message": "If that email exists, a reset link was sent."}

    reset_token  = uuid.uuid4().hex
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)

    db.execute(
        text("""
            UPDATE users
            SET reset_token = :token, reset_token_expiry = :expiry
            WHERE LOWER(email) = :email
        """),
        {"token": reset_token, "expiry": reset_expiry, "email": email},
    )
    db.commit()

    await send_password_reset_email(email, reset_token)
    return {"status": "sent", "message": "If that email exists, a reset link was sent."}


# ─────────────────────────────────────────────
# POST /reset-password
# ─────────────────────────────────────────────
@router.post("/reset-password")
async def reset_password(data: ResetPasswordInput, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            SELECT id, reset_token_expiry FROM users
            WHERE reset_token = :token
        """),
        {"token": data.token},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user_id, expiry = row
    now = datetime.now(timezone.utc)

    if expiry and expiry.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    new_hash = pwd_ctx.hash(data.new_password)
    db.execute(
        text("""
            UPDATE users
            SET hashed_password = :pw, reset_token = NULL, reset_token_expiry = NULL
            WHERE id = :id
        """),
        {"pw": new_hash, "id": user_id},
    )
    db.commit()

    logger.info(f"Password reset | user={user_id}")
    return {"status": "success", "message": "Password updated. You can now log in."}


# ─────────────────────────────────────────────
# Google OAuth
# ─────────────────────────────────────────────
@router.get("/google/login")
async def google_login(request: Request):
    return await oauth.google.authorize_redirect(request, GOOGLE_REDIRECT_URI)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    try:
        token    = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)
    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return HTMLResponse(f"""
            <html><head>
              <meta http-equiv="refresh" content="3;url={FRONTEND_URL}/login?error=oauth_failed">
            </head><body style="font-family:sans-serif;text-align:center;padding:60px">
              <h2 style="color:#dc2626">Google login failed</h2>
              <p>Redirecting back to login...</p>
            </body></html>
        """)

    email    = userinfo.get("email", "").lower()
    name     = userinfo.get("name", "")
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Google")

    # Find or create user
    row = db.execute(
        text("SELECT id, brokerage_id, is_verified FROM users WHERE LOWER(email) = :email"),
        {"email": email},
    ).fetchone()

    if row:
        user_id, brokerage_id, _ = row
        # Mark verified if not already (Google = verified by definition)
        db.execute(
            text("UPDATE users SET is_verified = true WHERE id = :id"),
            {"id": user_id},
        )
        db.commit()
    else:
        # Auto-register
        brokerage_id = str(uuid.uuid4())
        api_key      = "lrai" + uuid.uuid4().hex

        db.execute(
            text("""
                INSERT INTO brokerages (id, name, plan, subscription_status, industry, api_key, updated_at)
                VALUES (:id, :name, 'trial', 'trial', 'real_estate', :api_key, NOW())
            """),
            {"id": brokerage_id, "name": name, "api_key": api_key},
        )

        user_id = str(uuid.uuid4())
        db.execute(
            text("""
                INSERT INTO users
                  (id, email, hashed_password, brokerage_id,
                   role, email_alerts, hot_lead_only, notification_threshold,
                   is_verified)
                VALUES
                  (:id, :email, :pw, :bid,
                   'Manager', true, false, 80,
                   true)
            """),
            {
                "id":    user_id,
                "email": email,
                "pw":    pwd_ctx.hash(uuid.uuid4().hex),  # random pw — Google users don't use it
                "bid":   brokerage_id,
            },
        )
        db.commit()
        await send_welcome_email(email, name)

    jwt_token = create_jwt(brokerage_id, email)
    redirect_url = f"{FRONTEND_URL}/auth/callback?token={jwt_token}&brokerage_id={brokerage_id}"

    return HTMLResponse(f"""
        <html><head>
          <meta http-equiv="refresh" content="0;url={redirect_url}">
        </head><body>
          <p>Redirecting...</p>
          <script>window.location.href = "{redirect_url}";</script>
        </body></html>
    """)


# ─────────────────────────────────────────────
# GET /me  — return current user profile
# ─────────────────────────────────────────────
@router.get("/me")
def get_me(user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            SELECT u.id, u.email, u.role, u.avatar_url,
                   u.notification_threshold, u.email_alerts, u.hot_lead_only,
                   b.name, b.industry, b.plan, b.api_key
            FROM users u
            JOIN brokerages b ON b.id = u.brokerage_id
            WHERE u.brokerage_id = :bid
            LIMIT 1
        """),
        {"bid": user["brokerage_id"]},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id":                     row[0],
        "email":                  row[1],
        "role":                   row[2],
        "avatar_url":             row[3],
        "notification_threshold": row[4],
        "email_alerts":           row[5],
        "hot_lead_only":          row[6],
        "brokerage_name":         row[7],
        "industry":               row[8],
        "plan":                   row[9],
        "api_key":                row[10],
        "brokerage_id":           user["brokerage_id"],
    }