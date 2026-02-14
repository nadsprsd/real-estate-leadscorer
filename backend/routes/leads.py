from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sqlalchemy.orm import Session

from backend.db import get_db
from backend.auth import get_current_user
from backend.services.scoring import (
    LeadScoringService,
    ScoringMode
)


router = APIRouter(prefix="/leads", tags=["Leads"])


# ---------------- SCHEMA ----------------

class LeadRequest(BaseModel):
    message: str
    mode: ScoringMode = ScoringMode.PRODUCTION


# ---------------- ROUTE ----------------

@router.post("/score")
async def score_lead(
    payload: LeadRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):

    if not payload.message.strip():
        raise HTTPException(400, "Empty message")

    service = LeadScoringService(db)

    result = await service.process_lead(

        user_id=user["user_id"],
        brokerage_id=user["brokerage_id"],

        message=payload.message,

        mode=payload.mode
    )

    return result
