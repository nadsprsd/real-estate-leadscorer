# backend/services/alerts.py

import logging


def send_hot_alert(email: str, message: str, score: int):
    """
    Sends HOT lead alert (email / WhatsApp / SMS later)
    For now: log to console
    """

    logging.info("🚨 HOT LEAD ALERT 🚨")
    logging.info(f"To: {email}")
    logging.info(f"Score: {score}")
    logging.info(f"Message: {message}")

    print("\n🔥 NEW HOT LEAD 🔥")
    print("To:", email)
    print("Score:", score)
    print("Message:", message)
    print("-------------------\n")
