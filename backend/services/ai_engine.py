from openai import OpenAI
import os
import json

# Initialize the Client (2026 Industry Standard)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def build_prompt(message: str, industry: str):
    base = f"""
    You are an AI lead analyzer for the {industry} industry.
    Analyze this message: "{message}"
    
    Return ONLY valid JSON.
    {{
      "urgency_score": (1-100),
      "sentiment": "positive/neutral/negative",
      "entities": {{}},
      "recommendation": "short advice"
    }}
    """
    if industry == "real_estate":
        base += "\nExtract: budget, location, move-in timeline, housing needs."
    elif industry == "logistics":
        base += "\nExtract: shipment urgency, delivery deadline, cargo type, destination."
    
    return base

def analyze_lead_message(message: str, industry: str):
    prompt = build_prompt(message, industry)
    
    try:
        # New v1.0+ Syntax: client.chat.completions.create
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a professional business analyst who outputs only JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={ "type": "json_object" } # Strictly forces JSON mode
        )
        
        raw_content = response.choices[0].message.content.strip()
        return json.loads(raw_content)
        
    except Exception as e:
        print(f"AI Error: {e}")
        return {
            "urgency_score": 50,
            "sentiment": "neutral",
            "entities": {},
            "recommendation": "Manual review required due to processing error."
        }