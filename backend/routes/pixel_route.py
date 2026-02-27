# pixel_route.py
# Add this file as: backend/routes/pixel.py
# Then in main.py add: from backend.routes.pixel import router as pixel_router
#                       app.include_router(pixel_router)

import uuid
import time
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Header, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from jose import jwt
from pydantic import BaseModel

from backend.db import get_db
from backend.services.ai_engine import analyze_lead_message
from backend.models import LeadScore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ingest", tags=["pixel"])

import os
JWT_SECRET   = os.getenv("JWT_SECRET", os.getenv("JWT_SECRET_KEY", "change-me"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ALGORITHM    = "HS256"


# ─────────────────────────────────────────────
# SCHEMA
# ─────────────────────────────────────────────
class PixelPayload(BaseModel):
    email:    str
    name:     str  = ""
    phone:    str  = ""
    message:  str  = ""
    source:   str  = "wordpress_pixel"
    campaign: str  = ""
    page_url: str  = ""
    site:     str  = ""


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def create_portal_jwt(lead_id: str, brokerage_id: str, score: int,
                      bucket: str, recommendation: str, lead_data: dict) -> str:
    """Creates a short-lived JWT for the public portal page."""
    payload = {
        "lead_id":        lead_id,
        "brokerage_id":   brokerage_id,
        "score":          score,
        "bucket":         bucket,
        "recommendation": recommendation,
        "name":           lead_data.get("name", ""),
        "email":          lead_data.get("email", ""),
        "iat":            int(time.time()),
        "exp":            int(time.time()) + 3600,  # 1 hour TTL
        "portal":         True,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def get_brokerage_from_api_key(api_key: str, db: Session):
    """Looks up the brokerage by API key stored in brokerages table."""
    row = db.execute(text("""
        SELECT b.id, b.industry, b.plan,
               (SELECT COUNT(*) FROM lead_scores
                WHERE brokerage_id = b.id
                  AND created_at >= date_trunc('month', NOW())) AS usage_this_month,
               CASE b.plan
                 WHEN 'starter' THEN 1000
                 WHEN 'team'    THEN 5000
                 ELSE 50
               END AS plan_limit
        FROM brokerages b
        WHERE b.api_key = :k
        LIMIT 1
    """), {"k": api_key}).fetchone()
    return row


# ─────────────────────────────────────────────
# POST /api/v1/ingest/pixel
# Called by the WordPress Ghost Plugin
# ─────────────────────────────────────────────
@router.post("/pixel")
async def pixel_ingest(
    payload: PixelPayload,
    request: Request,
    x_api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
):
    # ── 1. Validate API key ────────────────────
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required. Add X-API-Key header.")

    brokerage = get_brokerage_from_api_key(x_api_key, db)

    if not brokerage:
        raise HTTPException(status_code=401, detail="Invalid API key.")

    # ── 2. Check quota ─────────────────────────
    if brokerage.usage_this_month >= brokerage.plan_limit:
        raise HTTPException(
            status_code=402,
            detail=f"Monthly quota exceeded ({brokerage.plan_limit} leads). Please upgrade your plan."
        )

    # ── 3. Validate email ──────────────────────
    email = payload.email.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address is required.")

    # ── 4. Build message for AI scoring ────────
    # Combine all available context for better scoring
    message_parts = []
    if payload.name:    message_parts.append(f"Name: {payload.name}")
    if payload.email:   message_parts.append(f"Email: {payload.email}")
    if payload.phone:   message_parts.append(f"Phone: {payload.phone}")
    if payload.message: message_parts.append(f"Message: {payload.message}")
    if payload.page_url: message_parts.append(f"Source page: {payload.page_url}")
    if payload.campaign: message_parts.append(f"Campaign: {payload.campaign}")

    message_for_ai = "\n".join(message_parts) or f"Lead enquiry from {payload.site}"

    # ── 5. AI scoring ──────────────────────────
    try:
        ai = analyze_lead_message(message_for_ai, brokerage.industry)
    except Exception as e:
        logger.error(f"AI scoring failed for pixel lead: {e}")
        # Don't fail the lead — give a default score
        ai = {
            "is_lead": True,
            "urgency_score": 50,
            "sentiment": "neutral",
            "recommendation": "Lead submitted via website form. Follow up within 24 hours.",
            "entities": {},
        }

    is_lead = ai.get("is_lead", True)  # Pixel leads are real people — assume lead
    score   = int(ai.get("urgency_score", 50))

    if score >= 80:   bucket = "HOT"
    elif score >= 50: bucket = "WARM"
    else:             bucket = "COLD"

    # ── 6. Save lead ───────────────────────────
    lead_id = str(uuid.uuid4())

    # Get brokerage owner email for HOT alerts
    owner = db.execute(text("""
        SELECT email FROM users WHERE brokerage_id = :bid LIMIT 1
    """), {"bid": str(brokerage.id)}).fetchone()

    lead_payload = {
        "name":     payload.name,
        "email":    payload.email,
        "phone":    payload.phone,
        "message":  payload.message,
        "source":   payload.source,
        "campaign": payload.campaign,
        "page_url": payload.page_url,
        "site":     payload.site,
        "entities": ai.get("entities", {}),
        "is_lead":  is_lead,
    }

    lead = LeadScore(
        id=lead_id,
        brokerage_id=str(brokerage.id),
        user_email=payload.email,
        input_payload=lead_payload,
        urgency_score=score,
        sentiment=ai.get("sentiment"),
        ai_recommendation=ai.get("recommendation"),
        score=score,
        bucket=bucket,
        created_at=datetime.now(timezone.utc)
    )
    db.add(lead)
    db.commit()

    logger.info(f"Pixel lead scored: {email} → {bucket} ({score}) for brokerage {brokerage.id}")

    # ── 7. HOT alert ───────────────────────────
    if bucket == "HOT" and owner:
        try:
            from backend.services.alerts import send_hot_alert
            send_hot_alert(to_email=owner.email, lead_data={**lead_payload, "score": score})
        except Exception as e:
            logger.warning(f"HOT alert failed (non-fatal): {e}")

    # ── 8. Create Magic Link portal JWT ────────
    portal_token = create_portal_jwt(
        lead_id=lead_id,
        brokerage_id=str(brokerage.id),
        score=score,
        bucket=bucket,
        recommendation=ai.get("recommendation", ""),
        lead_data={"name": payload.name, "email": payload.email}
    )

    magic_link = f"{FRONTEND_URL}/portal?token={portal_token}"

    return {
        "status":         "scored",
        "lead_id":        lead_id,
        "score":          score,
        "bucket":         bucket,
        "sentiment":      ai.get("sentiment", "neutral"),
        "recommendation": ai.get("recommendation", ""),
        "magic_link":     magic_link,
    }


# ─────────────────────────────────────────────
# GET /api/v1/ingest/portal-data
# Called by the React Portal page to decode the token
# ─────────────────────────────────────────────
@router.get("/portal-data")
def get_portal_data(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if not payload.get("portal"):
            raise HTTPException(status_code=400, detail="Invalid portal token")
        return {
            "score":          payload.get("score", 0),
            "bucket":         payload.get("bucket", "COLD"),
            "recommendation": payload.get("recommendation", ""),
            "name":           payload.get("name", ""),
            "email":          payload.get("email", ""),
            "lead_id":        payload.get("lead_id", ""),
        }
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired portal link")


# ─────────────────────────────────────────────
# GET /api/v1/ingest/api-key
# Returns the API key for the currently logged-in user
# Add to auth.py instead if you prefer
# ─────────────────────────────────────────────
@router.get("/api-key")
def get_api_key(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Returns the brokerage's API key for use in the WordPress plugin."""
    from backend.routes.auth import get_current_user
    # We call get_current_user manually since this is in a different file
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")

    from jose import jwt as _jwt, JWTError
    try:
        payload = _jwt.decode(authorization.split(" ")[1], JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        brokerage_id = payload.get("brokerage_id")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    row = db.execute(
        text("SELECT api_key FROM brokerages WHERE id = :id"),
        {"id": brokerage_id}
    ).fetchone()

    if not row:
        raise HTTPException(404, "Brokerage not found")

    return {"api_key": row.api_key or ""}