from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from .db import Base

class Brokerage(Base):
    __tablename__ = "brokerages"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="brokerage")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    brokerage_id = Column(String, ForeignKey("brokerages.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    brokerage = relationship("Brokerage", back_populates="users")
