import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FROM_EMAIL = "notifications@leadrankerai.com"


def send_hot_alert(to_email: str, message: str, score: int):
    if not RESEND_API_KEY:
        logging.error("❌ RESEND_API_KEY missing")
        return False

    payload = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": f"🔥 HOT Lead (Score {score})",
        "html": f"""
        <h2>New HOT Lead</h2>
        <p><strong>Score:</strong> {score}</p>
        <p>{message}</p>
        """
    }

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
    )

    if response.status_code >= 400:
        logging.error("❌ Email failed: %s", response.text)
        return False

    logging.info(f"✅ Alert sent to {to_email}")
    return True
