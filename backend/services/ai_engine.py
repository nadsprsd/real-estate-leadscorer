# backend/services/ai_engine.py

import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


SYSTEM_PROMPT = """
You are an expert real estate and logistics lead analyst.

Your job is to analyze customer inquiries and return structured intelligence.

Always respond in VALID JSON with this format:

{
  "urgency_score": number (1-100),
  "sentiment": "positive" | "neutral" | "negative",
  "entities": {
    "budget": number | null,
    "timeline": string | null,
    "location": string | null
  },
  "recommendation": string
}
"""


def analyze_lead_message(message: str) -> dict:
    """
    Send lead message to OpenAI and return structured analysis.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.2,
        max_tokens=300,
    )

    content = response.choices[0].message.content

    try:
        data = json.loads(content)
        return data
    except json.JSONDecodeError:
        raise ValueError("Invalid AI response: " + content)
