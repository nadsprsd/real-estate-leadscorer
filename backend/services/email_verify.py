import uuid
import requests
import os

RESEND_KEY = os.getenv("RESEND_API_KEY")

def send_verify_email(email: str) -> str:
    token = str(uuid.uuid4())

    link = f"http://localhost:8000/auth/verify?token={token}"

    payload = {
        "from": "onboarding@leadrankerai.com",
        "to": [email],
        "subject": "Verify your LeadRanker account",
        "html": f"""
        <h3>Verify your email</h3>
        <p>Click below to verify your account:</p>
        <a href="{link}">Verify Account</a>
        """
    }

    requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=10
    )

    return token


def send_password_reset_email(email: str, token: str):

    link = f"http://localhost:5173/reset-password?token={token}"

    payload = {
        "from": "onboarding@leadrankerai.com",
        "to": [email],
        "subject": "Reset your password",
        "html": f"""
        <h3>Password Reset</h3>
        <p>Click below to reset:</p>
        <a href="{link}">Reset Password</a>
        """
    }

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type": "application/json"
        },
        json=payload
    )

    print(response.status_code)
    print(response.text)