from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import User
from backend.services.auth import verify_password, create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])



# FUNCTION for Depends()
def get_current_user(db: Session = Depends(get_db)):

    user = db.query(User).first()

    if not user:
        return {
            "authenticated": False,
            "user_id": None,
            "brokerage_id": None
        }

    return {
        "authenticated": True,
        "user_id": user.id,
        "brokerage_id": user.brokerage_id if hasattr(user, "brokerage_id") else 1,
        "email": user.email
    }


# ROUTE endpoint
@router.get("/me")
def read_me(user=Depends(get_current_user)):
    return user
