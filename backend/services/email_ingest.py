import imaplib
import email
import os
from backend.services.ai_engine import analyze_lead_message
from backend.db import SessionLocal
from backend.models import LeadScore
import uuid
from datetime import datetime


EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")


def fetch_emails():

    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(EMAIL_USER, EMAIL_PASS)
    mail.select("inbox")

    status, data = mail.search(None, "UNSEEN")

    mail_ids = data[0].split()

    for num in mail_ids:

        _, msg_data = mail.fetch(num, "(RFC822)")
        raw = msg_data[0][1]

        msg = email.message_from_bytes(raw)

        subject = msg["subject"]
        sender = msg["from"]

        body = ""

        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode()
        else:
            body = msg.get_payload(decode=True).decode()

        process_email(sender, subject, body)

    mail.logout()


def process_email(sender, subject, body):

    # Extract brokerage_id from email
    # Example: leads+UUID@gmail.com
    if "+" not in EMAIL_USER:
        return

    brokerage_id = EMAIL_USER.split("+")[1].split("@")[0]

    ai = analyze_lead_message(body, "real_estate")

    db = SessionLocal()

    lead = LeadScore(
        id=str(uuid.uuid4()),
        brokerage_id=brokerage_id,
        user_email=sender,
        input_payload={"subject": subject, "body": body},

        urgency_score=ai["urgency_score"],
        sentiment=ai["sentiment"],
        ai_recommendation=ai["recommendation"],

        score=ai["urgency_score"],
        bucket="HOT" if ai["urgency_score"] >= 80 else "WARM",

        created_at=datetime.utcnow()
    )

    db.add(lead)
    db.commit()
    db.close()
