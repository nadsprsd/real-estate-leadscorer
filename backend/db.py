import os
from dotenv import load_dotenv

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from backend.models import Base

# -------------------------------------------------
# Load environment variables from .env
# -------------------------------------------------
load_dotenv()

# -------------------------------------------------
# Database URL (MANDATORY)
# -------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Check your .env file.")

# -------------------------------------------------
# SQLAlchemy engine & session
# -------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

# -------------------------------------------------
# Dependency for FastAPI
# -------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------------------------
# Tenant context (your custom logic)
# -------------------------------------------------
def set_tenant(db, brokerage_id: str):
    db.execute(
        text("SET app.current_brokerage_id = :bid"),
        {"bid": brokerage_id},
    )
