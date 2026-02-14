import uuid
import logging
from enum import Enum

from backend.models.lead import LeadHistory
from backend.services.ai_engine import (
    analyze_lead_message,
    apply_business_rules,
    build_prompt
)


class ScoringMode(str, Enum):
    PRODUCTION = "production"
    SIMULATION = "simulation"


class LeadScoringService:

    MODEL_VERSION = "gpt-4o-mini-v1"

    def __init__(self, db):
        self.db = db

    # -----------------------------
    # MAIN ENTRY
    # -----------------------------

    async def process_lead(
        self,
        *,
        user_id: str,
        brokerage_id: str,
        message: str,
        mode: ScoringMode
    ):

        ai_result = None

        # ---------- AI TRY ----------
        try:

            prompt = build_prompt(message)

            ai_result = await analyze_lead_message(
                prompt,
                async_mode=True
            )

            logging.info("AI scoring success")

        except Exception as e:

            logging.error("AI failed: %s", e)

            # ---------- FALLBACK ----------
            ai_result = apply_business_rules(message)

            ai_result["sentiment"] = "neutral"
            ai_result["recommendation"] = "Manual review required"

            logging.warning("Used fallback scoring")

        # ---------- NORMALIZE ----------

        score = int(ai_result["urgency_score"])

        bucket = (
            "HOT" if score >= 80
            else "WARM" if score >= 50
            else "COLD"
        )

        # ---------- SAVE ----------

        lead = LeadHistory(

            id=str(uuid.uuid4()),

            user_id=user_id,
            brokerage_id=brokerage_id,

            raw_message=message,
            parsed_entities=ai_result.get("entities"),

            score=score,
            bucket=bucket,

            sentiment=ai_result.get("sentiment"),
            ai_recommendation=ai_result.get("recommendation"),

            is_simulation=(mode == ScoringMode.SIMULATION),

            model_version=self.MODEL_VERSION,
        )

        self.db.add(lead)
        self.db.commit()

        return {
            "id": lead.id,
            "score": score,
            "bucket": bucket,
            "sentiment": lead.sentiment,
            "recommendation": lead.ai_recommendation,
            "simulation": lead.is_simulation
        }
