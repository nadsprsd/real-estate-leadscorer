import os
import sys
from logging.config import fileConfig

from dotenv import load_dotenv
from alembic import context

# -------------------------------------------------
# Load .env FIRST (CRITICAL)
# -------------------------------------------------
load_dotenv()

# -------------------------------------------------
# Ensure project root is on PYTHONPATH
# -------------------------------------------------
sys.path.append(
    os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

# -------------------------------------------------
# Import engine & metadata from app
# -------------------------------------------------
from backend.db import engine, Base
from backend import models  # noqa: F401 (needed for metadata)

# -------------------------------------------------
# Alembic Config
# -------------------------------------------------
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for autogenerate
target_metadata = Base.metadata

# -------------------------------------------------
# OFFLINE migrations
# -------------------------------------------------
def run_migrations_offline() -> None:
    url = os.getenv("DATABASE_URL")

    if not url:
        raise RuntimeError("DATABASE_URL is not set for Alembic (offline mode)")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

# -------------------------------------------------
# ONLINE migrations
# -------------------------------------------------
def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()

# -------------------------------------------------
# Run migrations
# -------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
