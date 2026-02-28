# backend/routes/leads.py
# ─────────────────────────────────────────────────────────────────────
# FIXED: Returns full lead data (name, email, phone, message, source,
#        campaign, bucket, sentiment, recommendation) not just id/score
# ─────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import LeadScore
from backend.routes.auth import get_current_user

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


@router.get("/history")
def get_leads_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    brokerage_id = user["brokerage_id"]

    leads = (
        db.query(LeadScore)
        .filter(LeadScore.brokerage_id == brokerage_id)
        .order_by(LeadScore.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return {
        "data": [
            {
                "id":             lead.id,
                # Contact info from JSON payload
                "name":           lead.input_payload.get("name"),
                "email":          lead.input_payload.get("email"),
                "phone":          lead.input_payload.get("phone"),
                "message":        lead.input_payload.get("message"),
                "source":         lead.input_payload.get("source", "manual"),
                "campaign":       lead.input_payload.get("campaign"),
                # AI scoring
                "score":          lead.score,
                "bucket":         lead.bucket,
                "sentiment":      lead.sentiment,
                "recommendation": lead.ai_recommendation,
                # Metadata
                "created_at":     lead.created_at.isoformat(),
            }
            for lead in leads
        ]
    }