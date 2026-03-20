# backend/routes/billing.py
# ─────────────────────────────────────────────────────────────────────
# UPDATED: Replaced Stripe with Lemon Squeezy
# ─────────────────────────────────────────────────────────────────────
import os
import hmac
import hashlib
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.db import get_db
from backend.routes.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
LEMONSQUEEZY_API_KEY      = os.getenv("LEMONSQUEEZY_API_KEY", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")
FRONTEND_URL              = os.getenv("FRONTEND_URL", "https://app.leadrankerai.com")
RESEND_API_KEY            = os.getenv("RESEND_API_KEY", "")

REFERRAL_CREDIT_USD   = 5
REFERRAL_QUALIFY_DAYS = 30

PLANS = {
    "starter": {
        "limit":       1000,
        "checkout_url": os.getenv("LS_STARTER_CHECKOUT", "https://leadrankerai-app.lemonsqueezy.com/checkout/buy/d67f5168-c695-4134-8474-378b57aedb6a"),
        "amount":      "$19/mo",
        "price_usd":   19,
        "variant_id":  os.getenv("LS_STARTER_VARIANT_ID", ""),
    },
    "team": {
        "limit":       5000,
        "checkout_url": os.getenv("LS_TEAM_CHECKOUT", "https://leadrankerai-app.lemonsqueezy.com/checkout/buy/3b10eb66-febd-4356-ada3-d2b5b2536dbc"),
        "amount":      "$49/mo",
        "price_usd":   49,
        "variant_id":  os.getenv("LS_TEAM_VARIANT_ID", ""),
    },
}

PLAN_LIMITS = {"trial": 50, "starter": 1000, "team": 5000, "free": 50}

# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────
class CheckoutRequest(BaseModel):
    plan: str

    @validator("plan")
    def validate_plan(cls, v):
        if v.lower() not in PLANS:
            raise ValueError(f"Invalid plan. Choose: {list(PLANS.keys())}")
        return v.lower()

class ReferralSubmit(BaseModel):
    referrer_email: str

# ─────────────────────────────────────────────
# DB Helpers
# ─────────────────────────────────────────────
def get_user_field(user, field: str):
    if isinstance(user, dict):
        return user.get(field)
    return getattr(user, field, None)

def db_update_plan(db, brokerage_id: str, plan: str, ls_customer_id: str = None, ls_subscription_id: str = None):
    try:
        if ls_customer_id:
            result = db.execute(text("""
                UPDATE brokerages
                SET plan = :plan,
                    subscription_status    = 'active',
                    stripe_customer_id     = :cid,
                    stripe_subscription_id = :sid,
                    updated_at             = NOW()
                WHERE id = :bid
            """), {"plan": plan, "cid": ls_customer_id, "sid": ls_subscription_id, "bid": brokerage_id})
        else:
            result = db.execute(text("""
                UPDATE brokerages
                SET plan = :plan,
                    subscription_status    = 'active',
                    updated_at             = NOW()
                WHERE id = :bid
            """), {"plan": plan, "bid": brokerage_id})
        db.commit()
        return result.rowcount
    except Exception as e:
        logger.error(f"db_update_plan error: {e}")
        db.rollback()
        return 0

def is_webhook_processed(db, event_id: str) -> bool:
    row = db.execute(
        text("SELECT id FROM webhook_events WHERE event_id = :eid"),
        {"eid": event_id}
    ).fetchone()
    return row is not None

def mark_webhook_processed(db, event_id: str, event_type: str):
    try:
        db.execute(text("""
            INSERT INTO webhook_events (event_id, event_type, processed_at)
            VALUES (:eid, :etype, NOW())
            ON CONFLICT (event_id) DO NOTHING
        """), {"eid": event_id, "etype": event_type})
        db.commit()
    except Exception as e:
        logger.error(f"mark_webhook_processed: {e}")

# ─────────────────────────────────────────────
# Email Helpers
# ─────────────────────────────────────────────
async def send_referee_joined_notification(referrer_email: str, referee_email: str):
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": "LeadRankerAI <notifications@leadrankerai.com>",
                    "to": [referrer_email],
                    "subject": "Your referral just upgraded! 🎉",
                    "html": f"""<div style='font-family:sans-serif;padding:24px'>
                        <h2>Great news!</h2>
                        <p>{referee_email} just upgraded to a paid plan.</p>
                        <p>Your $5 referral credit will be applied to your next invoice.</p>
                        <p>Keep sharing LeadRankerAI to earn more credits!</p>
                    </div>"""
                },
                timeout=10
            )
    except Exception as e:
        logger.error(f"send_referee_joined_notification: {e}")

async def send_upgrade_confirmation(email: str, plan: str):
    plan_info = PLANS.get(plan, {})
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": "LeadRankerAI <notifications@leadrankerai.com>",
                    "to": [email],
                    "subject": f"You're on the {plan.title()} plan! 🚀",
                    "html": f"""<div style='font-family:sans-serif;padding:24px;max-width:600px'>
                        <h2 style='color:#0ea5e9'>Welcome to {plan.title()}!</h2>
                        <p>Your plan is now active. Here's what you get:</p>
                        <ul>
                            <li>{plan_info.get('limit', 0):,} leads/month</li>
                            <li>AI lead scoring (HOT/WARM/COLD)</li>
                            <li>WordPress plugin</li>
                            <li>Magic email inbound</li>
                            <li>Full dashboard access</li>
                        </ul>
                        <p><a href='https://app.leadrankerai.com' style='background:#0ea5e9;color:white;padding:12px 24px;border-radius:8px;text-decoration:none'>Go to Dashboard →</a></p>
                        <p style='color:#64748b;font-size:12px'>Questions? Reply to this email or contact founder@leadrankerai.com</p>
                    </div>"""
                },
                timeout=10
            )
    except Exception as e:
        logger.error(f"send_upgrade_confirmation: {e}")

# ─────────────────────────────────────────────
# POST /checkout — Returns Lemon Squeezy URL
# ─────────────────────────────────────────────
@router.post("/checkout")
async def create_checkout(req: CheckoutRequest, user=Depends(get_current_user)):
    bid   = get_user_field(user, "brokerage_id")
    email = get_user_field(user, "email")

    if not bid:
        raise HTTPException(status_code=400, detail="No brokerage linked")

    plan_info = PLANS[req.plan]
    base_url  = plan_info["checkout_url"]

    # Append prefill params so Lemon Squeezy prefills email
    checkout_url = f"{base_url}?checkout[email]={email}&checkout[custom][brokerage_id]={bid}&checkout[custom][plan]={req.plan}"

    logger.info(f"Checkout | brokerage={bid} plan={req.plan}")
    return {"checkout_url": checkout_url}

# ─────────────────────────────────────────────
# POST /webhook — Lemon Squeezy webhook handler
# ─────────────────────────────────────────────
@router.post("/webhook")
async def lemonsqueezy_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
):
    body = await request.body()

    # ── Verify webhook signature ──────────────
    if LEMONSQUEEZY_WEBHOOK_SECRET:
        expected = hmac.new(
            LEMONSQUEEZY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, x_signature or ""):
            logger.warning("Webhook signature mismatch")
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_name = payload.get("meta", {}).get("event_name", "")
    event_id   = payload.get("meta", {}).get("event_id", "")
    custom     = payload.get("meta", {}).get("custom_data", {})
    data       = payload.get("data", {})
    attrs      = data.get("attributes", {})

    logger.info(f"LS Webhook | event={event_name} id={event_id}")

    # ── Deduplicate ───────────────────────────
    if event_id and is_webhook_processed(db, event_id):
        return {"status": "already_processed"}

    brokerage_id    = custom.get("brokerage_id")
    plan            = custom.get("plan")
    customer_email  = attrs.get("user_email") or attrs.get("customer_email")
    ls_customer_id  = str(attrs.get("customer_id", ""))
    ls_sub_id       = str(data.get("id", ""))

    # ── Handle events ─────────────────────────
    if event_name in ("order_created", "subscription_created"):
        if brokerage_id and plan:
            rows = db_update_plan(db, brokerage_id, plan, ls_customer_id, ls_sub_id)
            logger.info(f"Plan activated | brokerage={brokerage_id} plan={plan} rows={rows}")

            # Send confirmation email
            if customer_email:
                await send_upgrade_confirmation(customer_email, plan)

            # Check referral
            if customer_email:
                referral = db.execute(text("""
                    SELECT id, referrer_email FROM referrals
                    WHERE LOWER(referee_email) = LOWER(:email) AND status = 'pending'
                    LIMIT 1
                """), {"email": customer_email}).fetchone()

                if referral:
                    db.execute(text("""
                        UPDATE referrals
                        SET referee_brokerage_id = :rbid,
                            qualified_at = NOW(),
                            status = 'qualified'
                        WHERE id = :id
                    """), {"rbid": brokerage_id, "id": referral[0]})
                    db.commit()
                    if referral[1]:
                        await send_referee_joined_notification(referral[1], customer_email)

    elif event_name == "subscription_cancelled":
        if brokerage_id:
            db.execute(text("""
                UPDATE brokerages
                SET subscription_status = 'cancelled',
                    updated_at = NOW()
                WHERE id = :bid
            """), {"bid": brokerage_id})
            db.commit()
            logger.info(f"Subscription cancelled | brokerage={brokerage_id}")

    elif event_name == "subscription_expired":
        if brokerage_id:
            db.execute(text("""
                UPDATE brokerages
                SET plan = 'trial',
                    subscription_status = 'expired',
                    updated_at = NOW()
                WHERE id = :bid
            """), {"bid": brokerage_id})
            db.commit()
            logger.info(f"Subscription expired | brokerage={brokerage_id}")

    elif event_name == "subscription_payment_failed":
        if brokerage_id:
            db.execute(text("""
                UPDATE brokerages
                SET subscription_status = 'past_due',
                    updated_at = NOW()
                WHERE id = :bid
            """), {"bid": brokerage_id})
            db.commit()
            logger.info(f"Payment failed | brokerage={brokerage_id}")

    if event_id:
        mark_webhook_processed(db, event_id, event_name)

    return {"status": "ok"}

# ─────────────────────────────────────────────
# GET /status — Current billing status
# ─────────────────────────────────────────────
@router.get("/status")
async def billing_status(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    bid = get_user_field(user, "brokerage_id")
    if not bid:
        return {"plan": "trial", "subscription_status": "trial", "limit": 50}

    row = db.execute(text("""
        SELECT plan, subscription_status, stripe_customer_id, stripe_subscription_id
        FROM brokerages WHERE id = :bid
    """), {"bid": str(bid)}).fetchone()

    plan                = row[0] if row else "trial"
    subscription_status = row[1] if row else "trial"
    ls_customer_id      = row[2] if row else None
    ls_subscription_id  = row[3] if row else None

    if not plan or plan not in PLAN_LIMITS:
        plan = "trial"

    used = db.execute(text("""
        SELECT COUNT(*) FROM lead_scores
        WHERE brokerage_id = :bid
        AND created_at >= date_trunc('month', NOW())
    """), {"bid": str(bid)}).scalar() or 0

    limit           = PLAN_LIMITS.get(plan, 50)
    percent_used    = round((used / limit) * 100) if limit else 0
    upgrade_options = []

    if plan in ("trial", "free"):
        upgrade_options = [
            {"plan": "starter", "label": "Starter", "amount": "$19/mo", "limit": 1000, "checkout_url": PLANS["starter"]["checkout_url"]},
            {"plan": "team",    "label": "Team",    "amount": "$49/mo", "limit": 5000, "checkout_url": PLANS["team"]["checkout_url"]},
        ]
    elif plan == "starter":
        upgrade_options = [
            {"plan": "team", "label": "Team", "amount": "$49/mo", "limit": 5000, "checkout_url": PLANS["team"]["checkout_url"]},
        ]

    if subscription_status == "past_due":
        upgrade_options.insert(0, {
            "plan": plan, "label": "Renew", "amount": PLANS.get(plan, {}).get("amount", ""),
            "checkout_url": PLANS.get(plan, {}).get("checkout_url", "")
        })

    return {
        "plan":                plan,
        "subscription_status": subscription_status,
        "ls_customer_id":      ls_customer_id,
        "ls_subscription_id":  ls_subscription_id,
        "leads_used":          used,
        "leads_limit":         limit,
        "percent_used":        percent_used,
        "upgrade_options":     upgrade_options,
    }

# ─────────────────────────────────────────────
# GET /referrals
# ─────────────────────────────────────────────
@router.get("/referrals")
async def get_referrals(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    email = get_user_field(user, "email")
    if not email:
        return {"referrals": [], "total_credits": 0}

    rows = db.execute(text("""
        SELECT referee_email, status, qualified_at, created_at
        FROM referrals
        WHERE LOWER(referrer_email) = LOWER(:email)
        ORDER BY created_at DESC
        LIMIT 50
    """), {"email": email}).fetchall()

    qualified = sum(1 for r in rows if r[1] == "qualified")
    credits   = qualified * REFERRAL_CREDIT_USD

    return {
        "referrals": [
            {
                "referee_email": r[0],
                "status":        r[1],
                "qualified_at":  r[2].isoformat() if r[2] else None,
                "created_at":    r[3].isoformat() if r[3] else None,
            }
            for r in rows
        ],
        "total_credits":     credits,
        "qualified_count":   qualified,
        "pending_count":     sum(1 for r in rows if r[1] == "pending"),
        "credit_per_referral": REFERRAL_CREDIT_USD,
        "qualify_days":      REFERRAL_QUALIFY_DAYS,
    }

# ─────────────────────────────────────────────
# POST /referrals — Submit a referral
# ─────────────────────────────────────────────
@router.post("/referrals")
async def submit_referral(
    body: ReferralSubmit,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    referrer_email = get_user_field(user, "email")
    referee_email  = body.referrer_email.strip().lower()

    if not referrer_email:
        raise HTTPException(status_code=400, detail="Not authenticated")
    if referee_email == referrer_email.lower():
        raise HTTPException(status_code=400, detail="Cannot refer yourself")

    existing = db.execute(text("""
        SELECT id FROM referrals
        WHERE LOWER(referrer_email) = LOWER(:ref)
        AND LOWER(referee_email)   = LOWER(:ree)
    """), {"ref": referrer_email, "ree": referee_email}).fetchone()

    if existing:
        raise HTTPException(status_code=409, detail="Referral already exists")

    db.execute(text("""
        INSERT INTO referrals (referrer_email, referee_email, status, created_at)
        VALUES (:ref, :ree, 'pending', NOW())
    """), {"ref": referrer_email, "ree": referee_email})
    db.commit()

    # Send invite email
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": "LeadRankerAI <notifications@leadrankerai.com>",
                    "to": [referee_email],
                    "subject": f"{referrer_email} invited you to LeadRankerAI",
                    "html": f"""<div style='font-family:sans-serif;padding:24px;max-width:600px'>
                        <h2>You've been invited to LeadRankerAI</h2>
                        <p>{referrer_email} thinks you'd benefit from AI lead scoring.</p>
                        <p>Get 50 free leads/month — no credit card needed.</p>
                        <a href='https://app.leadrankerai.com/register' 
                           style='background:#0ea5e9;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px'>
                           Start Free →
                        </a>
                    </div>"""
                },
                timeout=10
            )
    except Exception as e:
        logger.error(f"Referral email failed: {e}")

    return {"status": "sent", "referee_email": referee_email}
