import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FROM_EMAIL = "notifications@leadrankerai.com"


def send_hot_alert(
    to_email: str,
    lead_data: dict
) -> bool:
    """
    Sends a HOT lead alert email with full lead details.
    """

    if not RESEND_API_KEY:
        logging.error("❌ RESEND_API_KEY missing")
        return False

    # Extract structured data safely
    name = lead_data.get("name", "Not provided")
    phone = lead_data.get("phone", "Not provided")
    contact_email = lead_data.get("email", "Not provided")
    campaign = lead_data.get("campaign", "Unknown")
    message = lead_data.get("message", "")
    score = lead_data.get("score", 0)
    source = lead_data.get("source", "Unknown")

    # Clean minimal SaaS-style HTML
    html = f"""
    <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2 style="color:#00D4FF;">🔥 HOT Lead Alert</h2>

        <p><strong>Score:</strong> {score}</p>
        <p><strong>Source:</strong> {source}</p>
        <p><strong>Campaign:</strong> {campaign}</p>

        <hr style="margin:20px 0;"/>

        <p><strong>Name:</strong> {name}</p>
        <p><strong>Phone:</strong> {phone}</p>
        <p><strong>Email:</strong> {contact_email}</p>

        <hr style="margin:20px 0;"/>

        <p><strong>Message:</strong></p>
        <p style="background:#f5f5f5;padding:10px;border-radius:6px;">
            {message}
        </p>
    </div>
    """

    payload = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": f"🔥 HOT Lead (Score {score})",
        "html": html,
    }

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=10,
    )

    if response.status_code >= 400:
        logging.error("❌ Email failed: %s", response.text)
        return False

    logging.info(f"✅ HOT alert sent to {to_email}")
    return True
