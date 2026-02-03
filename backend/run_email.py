from backend.services.email_ingest import fetch_emails
import time



while True:
    fetch_emails()
    time.sleep(60)