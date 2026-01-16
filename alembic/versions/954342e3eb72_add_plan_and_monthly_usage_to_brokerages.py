"""add plan and monthly_usage to brokerages

Revision ID: 954342e3eb72
Revises: ae75810264ef
Create Date: 2026-01-16 12:59:35.632298

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '954342e3eb72'
down_revision: Union[str, Sequence[str], None] = 'ae75810264ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns WITH DEFAULTS
    op.add_column(
        "brokerages",
        sa.Column("plan", sa.String(), nullable=False, server_default="FREE"),
    )
    op.add_column(
        "brokerages",
        sa.Column("monthly_usage", sa.Integer(), nullable=False, server_default="0"),
    )



def downgrade() -> None:
    op.drop_column("brokerages", "monthly_usage")
    op.drop_column("brokerages", "plan")
