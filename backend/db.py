from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql+psycopg2://app:password@127.0.0.1:15432/leadscorer"



engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def set_tenant(db, brokerage_id: str):
    db.execute(text("SET app.current_brokerage_id = :bid"), {"bid": brokerage_id})
