from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    JSON
)
from sqlalchemy.sql import func
from backend.db import Base


class LeadHistory(Base):

    __tablename__ = "lead_history"

    id = Column(String, primary_key=True)

    # Multi-tenancy
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    brokerage_id = Column(String, nullable=False)

    # Lead data
    raw_message = Column(String, nullable=False)
    parsed_entities = Column(JSON)

    score = Column(Integer)
    bucket = Column(String)

    sentiment = Column(String)
    ai_recommendation = Column(String)

    # Anti-misleading
    is_simulation = Column(Boolean, default=False)

    # AI versioning
    model_version = Column(String)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )
