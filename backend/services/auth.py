from datetime import datetime, timedelta
from jose import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User


SECRET_KEY = "dev-secret-key"
ALGORITHM = "HS256"

security = HTTPBearer()


# Create JWT token
def create_access_token(data: dict):

    payload = data.copy()

    payload["exp"] = datetime.utcnow() + timedelta(days=7)

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# Get current logged in user
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):

    token = credentials.credentials

    try:

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        user_id = payload.get("user_id")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user

    except Exception:

        raise HTTPException(status_code=401, detail="Invalid token")


# Simple password verify (plain text for now)
def verify_password(password: str, stored_password: str):

    return password == stored_password
