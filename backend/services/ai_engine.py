import os
import json
from openai import OpenAI

# Create OpenAI client (NEW SDK)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


SYSTEM_PROMPT = """
You are a Lead Qualification AI for a business SaaS.

Your job:

1. Decide if the message is a REAL business inquiry.
2. If not a lead, mark is_lead=false.
3. If yes, detect intent.
4. Score urgency from 0 to 100.
5. Give short business recommendation.

Valid intents examples:
- property_buy
- property_rent
- logistics_shipping
- service_inquiry
- price_request
- personal
- spam
- greeting

Return ONLY valid JSON.

Format:

{
  "is_lead": true/false,
  "intent": "...",
  "urgency_score": 0-100,
  "confidence": 0-1,
  "reason": "...",
  "sentiment": "...",
  "recommendation": "..."
}
"""


def analyze_lead_message(message: str, industry: str) -> dict:
    prompt = f"""
Industry: {industry}

Message:
{message}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )

        text = response.choices[0].message.content.strip()

        # Safety: ensure valid JSON
        data = json.loads(text)

        # HARD GUARANTEES (important)
        return {
            "is_lead": bool(data.get("is_lead", False)),
            "intent": data.get("intent", "unknown"),
            "urgency_score": int(data.get("urgency_score", 0)),
            "confidence": float(data.get("confidence", 0.0)),
            "reason": data.get("reason", ""),
            "sentiment": data.get("sentiment", "neutral"),
            "recommendation": data.get("recommendation", ""),
            "entities": data.get("entities", {})
        }

    except Exception as e:
        print("AI Error:", e)

        # ✅ SAFE FALLBACK (NO CRASH, NO HOT FALSE POSITIVE)
        return {
            "is_lead": False,
            "intent": "unknown",
            "urgency_score": 0,
            "confidence": 0.0,
            "reason": "AI failed",
            "sentiment": "neutral",
            "recommendation": "Manual review",
            "entities": {}
        }
