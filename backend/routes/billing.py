import os
import stripe
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.db import get_db
from backend.routes.auth import get_current_user

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# CRITICAL RULE: prefix="/api/v1/billing"
# All @router decorators must be SHORT paths like "/usage", "/checkout"
# NEVER repeat /api/v1/billing inside decorators — it doubles the path!
# ─────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

REFERRAL_CREDIT_USD = 5
REFERRAL_QUALIFY_DAYS = 30

PLANS = {
    "starter": {
        "limit": 1000,
        "price_id": os.getenv("STRIPE_STARTER_PRICE"),
        "amount": "$19/mo",
        "price_usd": 19,
    },
    "team": {
        "limit": 5000,
        "price_id": os.getenv("STRIPE_TEAM_PRICE"),
        "amount": "$49/mo",
        "price_usd": 49,
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
    referee_email: str

    @validator("referee_email")
    def validate_email(cls, v):
        v = v.strip().lower()
        if "@" not in v or "." not in v:
            raise ValueError("Invalid email address")
        return v


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
def get_user_field(user, field: str):
    if isinstance(user, dict):
        return user.get(field)
    return getattr(user, field, None)


def price_id_to_plan(price_id: str) -> str:
    for name, data in PLANS.items():
        if data.get("price_id") == price_id:
            return name
    return "starter"


def db_update_plan(db, bid, plan, customer_id, sub_id) -> int:
    result = db.execute(
        text("""
            UPDATE brokerages
            SET plan                   = :plan,
                subscription_status    = 'active',
                stripe_customer_id     = :cid,
                stripe_subscription_id = :sid,
                updated_at             = NOW()
            WHERE id::text = :bid
        """),
        {"plan": plan, "cid": customer_id, "sid": sub_id, "bid": str(bid)},
    )
    db.commit()
    return result.rowcount


def db_update_plan_by_customer(db, customer_id, plan, sub_id) -> int:
    result = db.execute(
        text("""
            UPDATE brokerages
            SET plan                   = :plan,
                subscription_status    = 'active',
                stripe_subscription_id = :sid,
                updated_at             = NOW()
            WHERE stripe_customer_id = :cid
        """),
        {"plan": plan, "cid": customer_id, "sid": sub_id},
    )
    db.commit()
    return result.rowcount


# ─────────────────────────────────────────────
# Idempotency  (requires webhook_events table)
# Run once in psql:
#   CREATE TABLE IF NOT EXISTS webhook_events (
#     id SERIAL PRIMARY KEY,
#     event_id TEXT UNIQUE NOT NULL,
#     event_type TEXT,
#     processed_at TIMESTAMPTZ DEFAULT NOW()
#   );
# ─────────────────────────────────────────────
def is_webhook_processed(db, event_id: str) -> bool:
    try:
        return db.execute(
            text("SELECT id FROM webhook_events WHERE event_id = :eid"),
            {"eid": event_id},
        ).fetchone() is not None
    except Exception:
        return False


def mark_webhook_processed(db, event_id: str, event_type: str):
    try:
        db.execute(
            text("""
                INSERT INTO webhook_events (event_id, event_type, processed_at)
                VALUES (:eid, :etype, NOW())
                ON CONFLICT (event_id) DO NOTHING
            """),
            {"eid": event_id, "etype": event_type},
        )
        db.commit()
    except Exception as e:
        logger.error(f"mark_webhook_processed: {e}")


# ─────────────────────────────────────────────
# Emails
# ─────────────────────────────────────────────
async def send_email(to: str, subject: str, html: str) -> bool:
    import httpx
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set")
        return False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    
                    "from": "LeadRankerAI <onboarding@leadrankerai.com>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=10,
            )
        ok = res.status_code in (200, 201)
        if ok:
            logger.info(f"Email sent → {to}")
        else:
            logger.error(f"Email failed {res.status_code}: {res.text}")
        return ok
    except Exception as e:
        logger.error(f"Email error: {e}")
        return False


async def send_referral_email(to_email: str, referrer_name: str, referrer_email: str):
    """
    Sends the fully detailed referral invite using the send_email helper.
    Restores the 'Reclaim Your Day' point and full styling.
    """
    signup_url = f"{FRONTEND_URL}/register"
    subject = f"{referrer_name or 'A friend'} invited you to LeadRankerAI"
    
    html = f"""
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px 20px; color: #334155; border: 1px solid #f1f5f9; border-radius: 16px;">
        <h2 style="color: #1e40af; font-size: 22px; margin-bottom: 20px;">You've been invited to LeadRankerAI 🚀</h2>
        
        <p style="font-size: 16px; line-height: 1.6;">
            <strong>{referrer_name or referrer_email}</strong> thought you'd find this useful. 
            <strong>LeadRankerAI</strong> is the intelligent assistant for Sales Agents, Business Development Executives, and Marketing Teams.
        </p>

        <div style="background: #f8fafc; padding: 24px; border-radius: 16px; margin: 24px 0;">
            <p style="margin-top: 0; font-weight: 700; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px;">
                The Competitive Edge:
            </p>
            
            <div style="margin-bottom: 16px;">
                <span style="color: #2563eb; font-size: 18px; line-height: 1;">✦</span>
                <span style="font-size: 15px; margin-left: 8px;"><strong>Score by Urgency:</strong> Our AI identifies high-intent patterns, so you know exactly who to call first.</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <span style="color: #2563eb; font-size: 18px; line-height: 1;">✦</span>
                <span style="font-size: 15px; margin-left: 8px;"><strong>Instant HOT Alerts:</strong> Stop letting high-value leads cool off—spot them the second they arrive.</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <span style="color: #2563eb; font-size: 18px; line-height: 1;">✦</span>
                <span style="font-size: 15px; margin-left: 8px;"><strong>Reclaim Your Day:</strong> Focus on closing deals while the AI handles the manual lead filtering.</span>
            </div>

            <p style="margin-bottom: 0; margin-top: 8px; font-weight: 600; color: #2563eb; font-size: 14px;">
                Professional tools for high-performing agents, starting at $19/mo.
            </p>
        </div>

        <a href="{signup_url}" 
           style="display: inline-block; background: #2563eb; color: #ffffff; padding: 16px 36px; 
                  border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Start Your Free Trial →
        </a>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
            Referred by {referrer_email} · LeadRankerAI
        </p>
    </div>
    """
    # This calls your centralized send_email logic which uses RESEND_API_KEY
    return await send_email(to_email, subject, html)


async def send_referee_joined_notification(referrer_email: str, referee_email: str):
    await send_email(
        referrer_email,
        f"🎉 {referee_email} just joined LeadRankerAI!",
        f"""<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#1e293b">🎉 Your referral signed up!</h2>
          <p style="color:#475569"><strong>{referee_email}</strong> subscribed to LeadRankerAI!</p>
          <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:8px">
            <ul style="color:#16a34a;margin:0;padding-left:20px">
              <li>30-day qualification period has started</li>
              <li>Stay subscribed and you get a <strong>$5 credit</strong> automatically on Day 31</li>
            </ul>
          </div>
          <p style="margin-top:16px">
            <a href="{FRONTEND_URL}/billing" style="color:#2563eb">Track in your dashboard →</a>
          </p>
        </div>""",
    )


async def send_reward_notification(referrer_email: str, referee_email: str):
    await send_email(
        referrer_email,
        "💰 You earned a $5 referral credit!",
        f"""<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
          <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:28px;border-radius:12px;text-align:center">
            <h1 style="color:#fff;margin:0">💰 $5 Credit Earned!</h1>
          </div>
          <h2 style="color:#1e293b;margin-top:24px">Congratulations!</h2>
          <p style="color:#475569"><strong>{referee_email}</strong> completed 30 days — you're rewarded!</p>
          <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:16px;border-radius:8px;margin:20px 0">
            <ul style="color:#059669;margin:0;padding-left:20px">
              <li><strong>$5.00 credit</strong> applied to your account</li>
              <li>Automatically deducted from your next invoice</li>
            </ul>
          </div>
          <p style="text-align:center">
            <a href="{FRONTEND_URL}/billing" style="color:#2563eb">View your credits →</a>
          </p>
        </div>""",
    )


# ─────────────────────────────────────────────
# GET /usage
# ─────────────────────────────────────────────
@router.get("/usage")
async def get_usage(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = get_user_field(user, "brokerage_id")
    if not bid:
        raise HTTPException(status_code=400, detail="No brokerage linked to this account")

    usage_count = db.execute(
        text("""
            SELECT COUNT(*) FROM lead_scores
            WHERE brokerage_id::text = :id
              AND created_at >= date_trunc('month', NOW())
        """),
        {"id": str(bid)},
    ).scalar() or 0

    row = db.execute(
        text("""
            SELECT plan, subscription_status, stripe_customer_id, stripe_subscription_id
            FROM brokerages WHERE id::text = :id
        """),
        {"id": str(bid)},
    ).fetchone()

    plan = (row[0] or "trial").lower() if row else "trial"
    subscription_status = row[1] if row else "trial"
    stripe_customer_id = row[2] if row else None
    stripe_subscription_id = row[3] if row else None

    limit = PLAN_LIMITS.get(plan, 50)
    remaining = max(0, limit - usage_count)
    percent = round((usage_count / limit) * 100, 1) if limit > 0 else 0
    blocked = usage_count >= limit

    alerts = []
    if subscription_status == "past_due":
        alerts.append({"type": "error", "message": "⚠️ Payment overdue. Update your payment method immediately."})
    if blocked:
        alerts.append({"type": "error", "message": "🚫 Monthly limit reached. Upgrade to continue scoring leads."})
    elif percent >= 90:
        alerts.append({"type": "warning", "message": f"⚠️ {int(percent)}% of monthly limit used. Upgrade soon."})
    elif percent >= 75:
        alerts.append({"type": "info", "message": f"📊 You've used {int(percent)}% of your {plan} plan limit."})
    if plan == "trial" and usage_count >= 25:
        alerts.append({"type": "info", "message": "🚀 Enjoying LeadRankerAI? Upgrade to Starter for 1,000 leads/mo at just $19."})

    logger.info(f"Usage | brokerage={bid} plan={plan} {usage_count}/{limit}")

    return {
        "plan": plan,
        "subscription_status": subscription_status,
        "stripe_customer_id": stripe_customer_id,
        "stripe_subscription_id": stripe_subscription_id,
        "usage": usage_count,
        "limit": limit,
        "remaining": remaining,
        "percent": percent,
        "blocked": blocked,
        "alerts": alerts,
    }


# ─────────────────────────────────────────────
# GET /plans
# ─────────────────────────────────────────────
@router.get("/plans")
def get_plans():
    return {k: {"limit": v["limit"], "amount": v["amount"]} for k, v in PLANS.items()}


# ─────────────────────────────────────────────
# POST /checkout
# ─────────────────────────────────────────────
@router.post("/checkout")
async def create_checkout(req: CheckoutRequest, user=Depends(get_current_user)):
    bid = get_user_field(user, "brokerage_id")
    email = get_user_field(user, "email")
    if not bid:
        raise HTTPException(status_code=400, detail="No brokerage linked")

    price_id = PLANS[req.plan]["price_id"]
    if not price_id:
        raise HTTPException(status_code=500, detail=f"Price ID not configured for '{req.plan}'")

    logger.info(f"Checkout | brokerage={bid} plan={req.plan}")
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{FRONTEND_URL}/billing?success=true&plan={req.plan}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/billing?canceled=true",
            customer_email=email,
            client_reference_id=str(bid),
            metadata={"brokerage_id": str(bid), "plan": req.plan, "email": email or ""},
            subscription_data={"metadata": {"brokerage_id": str(bid), "plan": req.plan}},
            billing_address_collection="required",
            phone_number_collection={"enabled": True},
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.error.InvalidRequestError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {e}")
    except Exception as e:
        logger.error(f"Checkout failed: {e}")
        raise HTTPException(status_code=500, detail="Checkout creation failed")


# ─────────────────────────────────────────────
# GET /verify-session
# ─────────────────────────────────────────────
@router.get("/verify-session")
async def verify_session(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    bid = get_user_field(user, "brokerage_id")
    email = get_user_field(user, "email")

    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid session: {e}")

    if session.payment_status != "paid":
        raise HTTPException(status_code=402, detail=f"Payment not completed: {session.payment_status}")

    plan = session.metadata.get("plan")
    stripe_customer_id = session.customer
    sub = session.subscription
    stripe_subscription_id = sub.id if sub else None

    if not plan:
        raise HTTPException(status_code=400, detail="Plan missing from session metadata")

    rows = db_update_plan(db, str(bid), plan, stripe_customer_id, stripe_subscription_id)
    logger.info(f"Session verified | brokerage={bid} plan={plan} rows={rows}")

    # Mark referral as qualified if this user was referred
    if email:
        referral = db.execute(
            text("""
                SELECT id, referrer_email FROM referrals
                WHERE LOWER(referee_email) = LOWER(:email) AND status = 'pending'
                LIMIT 1
            """),
            {"email": email},
        ).fetchone()
        if referral:
            db.execute(
                text("""
                    UPDATE referrals
                    SET referee_brokerage_id = :rbid, qualified_at = NOW(), status = 'qualified'
                    WHERE id = :id
                """),
                {"rbid": str(bid), "id": referral[0]},
            )
            db.commit()
            logger.info(f"Referral qualified | id={referral[0]}")
            if referral[1]:
                await send_referee_joined_notification(referral[1], email)

    return {"status": "activated", "plan": plan, "rows_updated": rows}


# ─────────────────────────────────────────────
# GET /referrals
# ─────────────────────────────────────────────
@router.get("/referrals")
async def get_referrals(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bid = get_user_field(user, "brokerage_id")

    rows = db.execute(
        text("""
            SELECT
                id, referee_email, status, submitted_at, qualified_at, rewarded_at,
                EXTRACT(DAY FROM NOW() - qualified_at) AS days_since_qualified
            FROM referrals
            WHERE referrer_brokerage_id = :bid
            ORDER BY submitted_at DESC
        """),
        {"bid": str(bid)},
    ).fetchall()

    referrals = []
    for r in rows:
        days = int(r[6] or 0) if r[6] is not None else None
        days_remaining = max(0, REFERRAL_QUALIFY_DAYS - days) if days is not None else None
        referrals.append({
            "id": r[0],
            "referee_email": r[1],
            "status": r[2],
            "submitted_at": r[3].isoformat() if r[3] else None,
            "qualified_at": r[4].isoformat() if r[4] else None,
            "rewarded_at": r[5].isoformat() if r[5] else None,
            "credit_amount": REFERRAL_CREDIT_USD,
            "days_since_qualified": days,
            "days_remaining": days_remaining,
        })

    rewarded = sum(1 for r in referrals if r["status"] == "rewarded")
    pending = sum(1 for r in referrals if r["status"] == "pending")
    qualified = sum(1 for r in referrals if r["status"] == "qualified")

    return {
        "referrals": referrals,
        "stats": {
            "total": len(referrals),
            "pending": pending,
            "qualified": qualified,
            "rewarded": rewarded,
            "total_earned_usd": rewarded * REFERRAL_CREDIT_USD,
            "credit_per_referral": REFERRAL_CREDIT_USD,
            "qualify_days": REFERRAL_QUALIFY_DAYS,
        },
    }


# ─────────────────────────────────────────────
# POST /referrals/submit
# ─────────────────────────────────────────────
@router.post("/referrals/submit")
async def submit_referral(
    data: ReferralSubmit,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    bid = get_user_field(user, "brokerage_id")
    referrer_email = get_user_field(user, "email") or ""

    if not bid:
        raise HTTPException(status_code=400, detail="No brokerage linked")
    if data.referee_email.lower() == referrer_email.lower():
        raise HTTPException(status_code=400, detail="You can't refer yourself")

    existing = db.execute(
        text("SELECT id FROM referrals WHERE referrer_brokerage_id=:bid AND LOWER(referee_email)=LOWER(:email)"),
        {"bid": str(bid), "email": data.referee_email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="You've already referred this email")

    count = db.execute(
        text("SELECT COUNT(*) FROM referrals WHERE referrer_brokerage_id=:bid"),
        {"bid": str(bid)},
    ).scalar() or 0
    if count >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 referrals allowed")

    db.execute(
        text("""
            INSERT INTO referrals (referrer_brokerage_id, referrer_email, referee_email, status, submitted_at, created_at)
            VALUES (:bid, :remail, :femail, 'pending', NOW(), NOW())
        """),
        {"bid": str(bid), "remail": referrer_email, "femail": data.referee_email},
    )
    db.commit()

    name_row = db.execute(
        text("SELECT name FROM brokerages WHERE id::text=:bid"),
        {"bid": str(bid)},
    ).fetchone()
    referrer_name = name_row[0] if name_row else referrer_email

    await send_referral_email(data.referee_email, referrer_name, referrer_email)
    
    logger.info(f"Referral submitted | {referrer_email} → {data.referee_email}")
    return {"status": "submitted", "message": f"Invite sent to {data.referee_email}"}


# ─────────────────────────────────────────────
# POST /webhook
# Stripe CLI must forward to: localhost:8000/api/v1/billing/webhook
# Command: stripe listen --forward-to localhost:8000/api/v1/billing/webhook
# ─────────────────────────────────────────────
@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str = Header(None, alias="stripe-signature"),
):
    print("WEBHOOK RECEIVED")
    payload = await request.body()

    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Webhook signature failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook parse error")

    event_id = event["id"]
    event_type = event["type"]
    data = event["data"]["object"]

    logger.info(f"Stripe event: {event_type} [{event_id}]")

    # Idempotency: skip duplicate events
    if is_webhook_processed(db, event_id):
        logger.info(f"Already processed {event_id}, skipping")
        return {"status": "skipped"}

    if event_type == "checkout.session.completed":
        bid = data.get("client_reference_id")
        plan = data.get("metadata", {}).get("plan")
        stripe_customer_id = data.get("customer")
        stripe_subscription_id = data.get("subscription")
        referee_email = data.get("customer_email")

        if bid and plan:
            try:
                rows = db_update_plan(db, bid, plan, stripe_customer_id, stripe_subscription_id)
                logger.info(f"checkout.session.completed rows={rows}")

                if referee_email:
                    referral = db.execute(
                        text("SELECT id, referrer_email FROM referrals WHERE LOWER(referee_email)=LOWER(:email) AND status='pending' LIMIT 1"),
                        {"email": referee_email},
                    ).fetchone()
                    if referral:
                        db.execute(
                            text("UPDATE referrals SET referee_brokerage_id=:rbid, qualified_at=NOW(), status='qualified' WHERE id=:id"),
                            {"rbid": str(bid), "id": referral[0]},
                        )
                        db.commit()
                        if referral[1]:
                            await send_referee_joined_notification(referral[1], referee_email)
            except Exception as e:
                db.rollback()
                logger.error(f"checkout.session.completed error: {e}")

    elif event_type == "invoice.payment_succeeded":
        stripe_customer_id = data.get("customer")
        stripe_subscription_id = data.get("subscription")
        billing_reason = data.get("billing_reason", "")

        try:
            plan = None
            bid = None
            if stripe_subscription_id:
                sub = stripe.Subscription.retrieve(stripe_subscription_id)
                bid = sub.metadata.get("brokerage_id")
                plan_meta = sub.metadata.get("plan")
                price_id = sub["items"]["data"][0]["price"]["id"]
                plan = plan_meta or price_id_to_plan(price_id)

            if plan:
                rows = db_update_plan(db, bid, plan, stripe_customer_id, stripe_subscription_id) if bid else 0
                if rows == 0:
                    rows = db_update_plan_by_customer(db, stripe_customer_id, plan, stripe_subscription_id)
                logger.info(f"Plan updated rows={rows}")

            # Referral reward: fires on Day 31 renewal payment
            if billing_reason == "subscription_cycle":
                qualified = db.execute(
                    text("""
                        SELECT r.id, r.referrer_brokerage_id, r.referrer_email, r.referee_email
                        FROM referrals r
                        JOIN brokerages b ON b.id::text = r.referee_brokerage_id
                        WHERE b.stripe_customer_id = :cid
                          AND r.status = 'qualified'
                          AND r.qualified_at <= NOW() - INTERVAL '30 days'
                    """),
                    {"cid": stripe_customer_id},
                ).fetchall()

                for ref in qualified:
                    ref_id, referrer_bid, referrer_email, referee_email = ref
                    try:
                        referrer_row = db.execute(
                            text("SELECT stripe_customer_id FROM brokerages WHERE id::text=:bid"),
                            {"bid": str(referrer_bid)},
                        ).fetchone()
                        if referrer_row and referrer_row[0]:
                            credit = stripe.InvoiceItem.create(
                                customer=referrer_row[0],
                                amount=-(REFERRAL_CREDIT_USD * 100),
                                currency="usd",
                                description=f"Referral credit — {referee_email} active 30+ days",
                            )
                            db.execute(
                                text("UPDATE referrals SET status='rewarded', rewarded_at=NOW(), stripe_credit_id=:cid WHERE id=:id"),
                                {"cid": credit.id, "id": ref_id},
                            )
                            db.commit()
                            logger.info(f"Referral rewarded | {ref_id} credit={credit.id}")
                            await send_reward_notification(referrer_email, referee_email)
                    except Exception as e:
                        logger.error(f"Reward failed for {ref_id}: {e}")

        except Exception as e:
            db.rollback()
            logger.error(f"invoice.payment_succeeded error: {e}")

    elif event_type == "invoice.payment_failed":
        try:
            db.execute(
                text("UPDATE brokerages SET subscription_status='past_due', updated_at=NOW() WHERE stripe_customer_id=:cid"),
                {"cid": data.get("customer")},
            )
            db.commit()
        except Exception as e:
            db.rollback()

    elif event_type == "customer.subscription.deleted":
        try:
            db.execute(
                text("UPDATE brokerages SET plan='trial', subscription_status='canceled', updated_at=NOW() WHERE stripe_customer_id=:cid"),
                {"cid": data.get("customer")},
            )
            db.commit()
        except Exception as e:
            db.rollback()

    mark_webhook_processed(db, event_id, event_type)
    return {"status": "success", "event": event_type}


# ─────────────────────────────────────────────
# POST /admin/fix-plan  ← REMOVE IN PRODUCTION
# ─────────────────────────────────────────────
@router.post("/admin/fix-plan")
async def admin_fix_plan(
    plan: str = "starter",
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    bid = get_user_field(user, "brokerage_id")
    if not bid:
        raise HTTPException(status_code=400, detail="No brokerage found")
    if plan not in PLANS and plan != "trial":
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan}")
    db.execute(
        text("UPDATE brokerages SET plan=:plan, subscription_status='active', updated_at=NOW() WHERE id::text=:bid"),
        {"plan": plan, "bid": str(bid)},
    )
    db.commit()
    return {"status": "fixed", "plan": plan}