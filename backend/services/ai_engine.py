from openai import OpenAI
import os
import json
import re

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def build_prompt(message: str, industry: str):

    base = f"""
You are an AI lead qualification engine for the {industry} industry.

Your job is to score how urgently a salesperson must respond.

Scoring rules:
- 90–100 = Immediate action (today, deadline risk, financial loss, missed deal)
- 70–89 = High intent but not critical
- 40–69 = Medium interest
- 0–39 = Low quality or vague

Message:
"{message}"

Return ONLY valid JSON in this format:

{{
  "urgency_score": number,
  "sentiment": "positive" | "neutral" | "negative",
  "entities": {{}},
  "recommendation": "short sales advice"
}}
"""

    if industry == "real_estate":
        base += "\nSignals: budget, urgency words, timeline, readiness, location."
    elif industry == "logistics":
        base += "\nSignals: cargo size, deadlines, urgency words, penalties, destinations."

    return base


def apply_business_rules(message: str, score: int) -> int:
    text = message.lower()

    urgent_words = ["urgent", "asap", "today", "immediately", "now", "right away"]
    deadline_words = ["tomorrow", "tonight", "miss", "delay", "late"]

    if any(w in text for w in urgent_words):
        score = max(score, 85)

    if any(w in text for w in deadline_words):
        score = max(score, 90)

    # Big numbers = higher urgency
    if re.search(r"\b\d{4,}\b", text):  # 1000+, budgets, weights
        score = max(score, 80)

    return min(score, 100)


def analyze_lead_message(message: str, industry: str):

    prompt = build_prompt(message, industry)

    try:

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a strict JSON generator."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
            timeout= 10 
        )

        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)

        score = int(data.get("urgency_score", 50))
        score = apply_business_rules(message, score)

        return {
            "urgency_score": score,
            "sentiment": data.get("sentiment", "neutral"),
            "entities": data.get("entities", {}),
            "recommendation": data.get("recommendation", "")
        }

    except Exception as e:
        print("AI ERROR:", e)
        return {
            "urgency_score": 50,
            "sentiment": "neutral",
            "entities": {},
            "recommendation": "Manual review required"
        }
