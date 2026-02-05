import os
import smtplib
from email.mime.text import MIMEText
from urllib.parse import quote


APP_URL = "http://localhost:5173"


# ---------------- EMAIL ALERT ----------------

def send_email_alert(to_email, lead, score):

    sender = os.getenv("ALERT_EMAIL")
    password = os.getenv("ALERT_EMAIL_PASS")

    if not sender or not password:
        print("⚠️ Email alerts not configured")
        return

    subject = "🔥 HOT Lead Alert"

    body = f"""
New HOT Lead Detected!

Message: {lead}
Score: {score}

Open Dashboard:
{APP_URL}/history
"""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender, password)
        server.send_message(msg)
        server.quit()

        print("✅ Email alert sent")

    except Exception as e:
        print("❌ Email alert failed:", e)


# ---------------- WHATSAPP LINK ----------------

def get_whatsapp_link(phone, lead, score):

    text = f"""
🔥 HOT Lead Alert

{lead}
Score: {score}

Open:
{APP_URL}/history
"""

    return f"https://wa.me/{phone}?text={quote(text)}"


# ---------------- MAIN ALERT ----------------

def send_hot_alert(user_email, phone, lead, score):

    print("🚨 Sending HOT alert...")

    send_email_alert(user_email, lead, score)

    whatsapp = None

    if phone:
        whatsapp = get_whatsapp_link(phone, lead, score)

    return {
        "email_sent": True,
        "whatsapp_link": whatsapp
    }
