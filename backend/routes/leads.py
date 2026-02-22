from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import LeadScore
from backend.routes.auth import get_current_user

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


@router.get("/history")
def get_leads_history(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    brokerage_id = user["brokerage_id"]

    leads = (
        db.query(LeadScore)
        .filter(LeadScore.brokerage_id == brokerage_id)
        .order_by(LeadScore.created_at.desc())
        .limit(50)
        .all()
    )

    return [
        {
            "id": lead.id,
            "score": lead.score,
            "status": lead.bucket,
            "created_at": lead.created_at
        }
        for lead in leads
    ]
