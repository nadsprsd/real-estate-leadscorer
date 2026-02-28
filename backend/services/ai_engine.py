# backend/services/ai_engine.py
# ─────────────────────────────────────────────────────────────────────
# UPDATED: Full multi-industry support
# Industries: real_estate, logistics, healthcare, banking, ecommerce, general
# The industry the user selected at signup is passed in automatically
# from main.py — no changes needed in main.py or billing.py
# ─────────────────────────────────────────────────────────────────────

import os
import json
import logging

from openai import OpenAI

logger = logging.getLogger(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ─────────────────────────────────────────────
# INDUSTRY CONTEXT MAP
# Add more industries here anytime — no other file needs to change
# ─────────────────────────────────────────────
INDUSTRY_CONTEXT = {
    "real_estate": {
        "label": "Real Estate",
        "intents": [
            "property_buy", "property_rent", "property_sell",
            "plot_inquiry", "villa_inquiry", "apartment_inquiry",
            "commercial_space", "site_visit_request", "price_negotiation",
            "home_loan_inquiry", "builder_contact",
        ],
        "hot_signals": [
            "ready to buy", "immediate", "urgent", "this week", "budget ready",
            "need possession soon", "already have loan approved", "moving soon",
            "finalizing", "last few days",
        ],
        "context": (
            "Real estate industry in Kerala and India. Common inquiries: "
            "buying flats, villas, plots, commercial spaces; "
            "renting apartments or offices; site visits; home loans; "
            "builder/developer contact for new projects."
        ),
    },
    "logistics": {
        "label": "Logistics & Shipping",
        "intents": [
            "freight_inquiry", "shipping_quote", "cargo_booking",
            "delivery_tracking", "import_export", "warehouse_inquiry",
            "courier_service", "bulk_shipping", "cold_chain",
            "customs_clearance",
        ],
        "hot_signals": [
            "urgent shipment", "same day", "immediate pickup", "time sensitive",
            "already have goods ready", "need quote today", "contract pending",
            "regular shipment needed", "bulk requirement",
        ],
        "context": (
            "Logistics, freight, and supply chain industry. Common inquiries: "
            "shipping rates, freight forwarding, cargo booking, warehouse space, "
            "last-mile delivery, import/export documentation, customs clearance, "
            "cold chain logistics, bulk transport."
        ),
    },
    "healthcare": {
        "label": "Healthcare",
        "intents": [
            "appointment_booking", "consultation_request", "treatment_inquiry",
            "test_booking", "emergency_inquiry", "doctor_availability",
            "health_package", "second_opinion", "pharmacy_inquiry",
            "homecare_service",
        ],
        "hot_signals": [
            "urgent", "emergency", "immediate appointment", "severe pain",
            "already diagnosed", "need today", "doctor unavailable elsewhere",
            "referred by doctor", "critical condition",
        ],
        "context": (
            "Healthcare, hospitals, clinics, and medical services. Common inquiries: "
            "appointment booking, doctor consultations, diagnostic tests, "
            "treatment plans, health checkup packages, pharmacy, home care, "
            "second opinion requests, emergency services."
        ),
    },
    "banking": {
        "label": "Banking & Finance",
        "intents": [
            "loan_inquiry", "home_loan", "personal_loan", "business_loan",
            "credit_card", "account_opening", "investment_inquiry",
            "insurance_inquiry", "emi_calculation", "fd_inquiry",
            "mutual_fund", "nri_services",
        ],
        "hot_signals": [
            "need loan urgently", "already have property", "salary credited",
            "ready to apply", "documents ready", "pre-approved",
            "comparing banks", "need disbursement soon", "business expansion",
        ],
        "context": (
            "Banking, finance, and insurance industry in India. Common inquiries: "
            "home loans, personal loans, business loans, credit cards, "
            "savings/current accounts, fixed deposits, mutual funds, "
            "insurance policies, NRI services, EMI calculations."
        ),
    },
    "ecommerce": {
        "label": "E-Commerce & Retail",
        "intents": [
            "product_inquiry", "bulk_order", "wholesale_inquiry",
            "return_request", "refund_request", "delivery_inquiry",
            "price_negotiation", "partnership_inquiry", "reseller_inquiry",
            "custom_order",
        ],
        "hot_signals": [
            "bulk order", "wholesale price", "urgent delivery",
            "ready to pay", "want to place order", "already ordered",
            "same day delivery needed", "large quantity",
        ],
        "context": (
            "E-commerce, online retail, and product sales. Common inquiries: "
            "product availability, bulk/wholesale orders, delivery status, "
            "returns and refunds, custom orders, reseller partnerships, "
            "pricing and discounts."
        ),
    },
    "education": {
        "label": "Education",
        "intents": [
            "admission_inquiry", "course_inquiry", "fee_structure",
            "scholarship_inquiry", "hostel_inquiry", "placement_inquiry",
            "demo_class_request", "online_course", "certification",
        ],
        "hot_signals": [
            "admission open", "deadline soon", "seat available",
            "fee paid", "parents ready", "need immediate admission",
            "entrance qualified", "scholarship applied",
        ],
        "context": (
            "Education, coaching, and training industry. Common inquiries: "
            "school/college admissions, course details, fee structure, "
            "scholarships, online courses, certifications, demo classes, "
            "placement records, hostel facilities."
        ),
    },
    "general": {
        "label": "General Business",
        "intents": [
            "service_inquiry", "price_request", "availability_check",
            "support_request", "partnership_inquiry", "demo_request",
            "consultation_request", "complaint", "feedback",
        ],
        "hot_signals": [
            "ready to buy", "urgent", "immediate", "today",
            "finalizing vendor", "comparing prices", "budget approved",
            "decision maker", "sign contract",
        ],
        "context": (
            "General business services and products. Common inquiries: "
            "service availability, pricing, demos, consultations, "
            "vendor partnerships, support requests."
        ),
    },
}


def _build_system_prompt(industry: str) -> str:
    """Build an industry-specific system prompt for the AI."""
    info = INDUSTRY_CONTEXT.get(industry, INDUSTRY_CONTEXT["general"])

    intents_list = ", ".join(info["intents"])
    hot_signals  = ", ".join(f'"{s}"' for s in info["hot_signals"])

    return f"""You are a Lead Qualification AI for the {info["label"]} industry.

Context: {info["context"]}

Your job:
1. Decide if this message is a REAL business inquiry (not spam, greeting, or irrelevant).
2. If it is a lead, identify the intent from this list: {intents_list}
   (Use "other_inquiry" if none match exactly.)
3. Score urgency from 0 to 100:
   - 80-100: HOT  — buyer signals present: {hot_signals}
   - 50-79:  WARM — genuine inquiry but no urgency signals
   - 1-49:   COLD — vague or early-stage interest
   - 0:      NOT a lead (spam, greeting, complaint with no purchase intent)
4. Detect sentiment: positive, neutral, or negative.
5. Give a SHORT actionable recommendation (max 15 words) for the sales team.

Return ONLY valid JSON. No extra text, no markdown, no explanation.

{{
  "is_lead": true or false,
  "intent": "intent_from_list_above",
  "urgency_score": 0 to 100,
  "confidence": 0.0 to 1.0,
  "sentiment": "positive" or "neutral" or "negative",
  "reason": "one sentence why this score",
  "recommendation": "short action for sales team",
  "entities": {{}}
}}"""


def analyze_lead_message(message: str, industry: str) -> dict:
    """
    Analyze a lead message using GPT-4o-mini with industry-specific context.

    Args:
        message:  The lead's message text (from form, email, webhook, etc.)
        industry: The brokerage's industry (from brokerages.industry column)

    Returns:
        dict with is_lead, intent, urgency_score, confidence,
             sentiment, reason, recommendation, entities
    """
    # Normalize industry — default to general if unknown
    industry = industry.lower().strip() if industry else "general"
    if industry not in INDUSTRY_CONTEXT:
        industry = "general"

    system_prompt = _build_system_prompt(industry)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": f"Lead message:\n{message}"},
            ],
            temperature=0.2,
            max_tokens=300,
        )

        raw_text = response.choices[0].message.content.strip()

        # Strip markdown code fences if model wraps output
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as json_err:
            logger.warning(f"AI returned invalid JSON [{industry}]: {json_err} | raw: {raw_text[:200]}")
            return _safe_fallback()

        # Guarantee all required fields exist and have correct types
        return {
            "is_lead":        bool(data.get("is_lead", False)),
            "intent":         str(data.get("intent", "unknown")),
            "urgency_score":  int(data.get("urgency_score", 0)),
            "confidence":     float(data.get("confidence", 0.0)),
            "reason":         str(data.get("reason", "")),
            "sentiment":      str(data.get("sentiment", "neutral")),
            "recommendation": str(data.get("recommendation", "Manual review required")),
            "entities":       dict(data.get("entities", {})),
        }

    except Exception as e:
        logger.error(f"AI engine error [{industry}]: {e}")
        return _safe_fallback()


def _safe_fallback() -> dict:
    """
    Safe fallback when AI fails.
    Never crashes the app, never generates a false HOT lead.
    """
    return {
        "is_lead":        False,
        "intent":         "unknown",
        "urgency_score":  0,
        "confidence":     0.0,
        "reason":         "AI analysis failed — manual review needed",
        "sentiment":      "neutral",
        "recommendation": "Review manually — AI could not process this message",
        "entities":       {},
    }