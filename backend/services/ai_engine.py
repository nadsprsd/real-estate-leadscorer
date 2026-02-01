from openai import OpenAI
import os
import json

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def build_prompt(message: str, industry: str):

    base = f"""
You are an AI lead analyzer for the {industry} industry.

Analyze this message:

"{message}"

Return ONLY valid JSON in this format:

{{
  "urgency_score": number (1-100),
  "sentiment": "positive" | "neutral" | "negative",
  "entities": {{}},
  "recommendation": "short advice"
}}
"""

    if industry == "real_estate":
        base += "\nExtract: budget, location, move-in timeline, property type."

    elif industry == "logistics":
        base += "\nExtract: shipment urgency, cargo, deadline, destination."

    return base


def analyze_lead_message(message: str, industry: str):

    prompt = build_prompt(message, industry)

    try:

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional analyst who outputs only JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        raw = response.choices[0].message.content.strip()

        data = json.loads(raw)

        # Safety layer
        return {
            "urgency_score": int(data.get("urgency_score", 50)),
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
