

from sqlalchemy import Column, String, ForeignKey, Integer, DateTime, Boolean
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

Base = declarative_base()


class Brokerage(Base):
    __tablename__ = "brokerages"

    id                     = Column(String, primary_key=True)
    name                   = Column(String, nullable=False)
    phone_number           = Column(String(20), nullable=True)

    # Billing
    plan                   = Column(String, nullable=False, default="trial")
    monthly_usage          = Column(Integer, nullable=False, default=0)
    stripe_customer_id     = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_status    = Column(String, nullable=False, default="trial")

    # Industry + Plugin
    industry               = Column(String, default="real_estate")
    api_key                = Column(String, nullable=True)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="brokerage")


class User(Base):
    __tablename__ = "users"

    id                     = Column(String, primary_key=True)
    email                  = Column(String, unique=True, nullable=False)
    hashed_password        = Column(String, nullable=False)
    brokerage_id           = Column(String, ForeignKey("brokerages.id"), nullable=False)

    # Profile / Settings
    role                   = Column(String, default="Manager")
    notification_threshold = Column(Integer, default=80)
    email_alerts           = Column(Boolean, default=True)   # FIXED: Boolean now imported
    hot_lead_only          = Column(Boolean, default=False)  # FIXED: Boolean now imported
    avatar_url             = Column(String, nullable=True)

    brokerage = relationship("Brokerage", back_populates="users")


class LeadScore(Base):
    __tablename__ = "lead_scores"

    id                = Column(String, primary_key=True)
    brokerage_id      = Column(String, nullable=False)
    user_email        = Column(String, nullable=False)
    input_payload     = Column(JSON, nullable=False)

    # AI fields
    urgency_score     = Column(Integer)
    sentiment         = Column(String)
    ai_recommendation = Column(String)

    score             = Column(Integer, nullable=False)
    bucket            = Column(String, nullable=False)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)