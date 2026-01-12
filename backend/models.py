from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

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
