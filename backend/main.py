from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np
import os

# Load model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "lead_scorer_v1.pkl")
model = joblib.load(MODEL_PATH)

app = FastAPI(
    title="Real Estate Lead Scorer",
    version="1.0.0"
)

# --------- Request Schema ---------

class LeadInput(BaseModel):
    budget: float
    urgency: int
    views: int
    saves: int
    bedrooms: int
    preapproved: int
    open_house: int
    agent_response_hours: int

# --------- Health ---------

@app.get("/")
def health():
    return {"status": "ok"}

# --------- Scoring Endpoint ---------

@app.post("/leads/score")
def score_lead(lead: LeadInput):
    # Feature engineering (must match training)
    buyer_readiness_score = (
        (1 if lead.budget >= 500000 else 0) * 30 +
        (1 if lead.urgency <= 30 else 0) * 30 +
        (1 if lead.preapproved == 1 else 0) * 40
    )

    engagement_score = (
        (lead.views / 50.0) * 50 +
        (lead.saves / 20.0) * 30 +
        (1 if lead.open_house == 1 else 0) * 20
    )

    speed_penalty = min(max(lead.agent_response_hours, 0), 72) / 72.0 * 100

    # Final feature vector (ORDER MUST MATCH TRAINING)
    X = np.array([[
        lead.budget,
        lead.urgency,
        lead.views,
        lead.saves,
        lead.bedrooms,
        lead.preapproved,
        lead.open_house,
        lead.agent_response_hours,
        buyer_readiness_score,
        engagement_score,
        speed_penalty
    ]])

    # Predict probability
    prob = model.predict_proba(X)[0][1]

    # Convert to 0–100 score
    score = int(prob * 100)

    if score >= 70:
        bucket = "HOT"
    elif score >= 40:
        bucket = "WARM"
    else:
        bucket = "COLD"

    return {
        "score": score,
        "bucket": bucket,
        "probability": float(prob)
    }
