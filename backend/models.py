from sqlalchemy import Column, String, ForeignKey, Integer, DateTime
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

Base = declarative_base()


class Brokerage(Base):
    __tablename__ = "brokerages"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)

    users = relationship("User", back_populates="brokerage")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    brokerage_id = Column(String, ForeignKey("brokerages.id"), nullable=False)

    brokerage = relationship("Brokerage", back_populates="users")


class LeadScore(Base):
    __tablename__ = "lead_scores"

    id = Column(String, primary_key=True)
    brokerage_id = Column(String, nullable=False)
    user_email = Column(String, nullable=False)

    input_payload = Column(JSON, nullable=False)

    score = Column(Integer, nullable=False)
    bucket = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
