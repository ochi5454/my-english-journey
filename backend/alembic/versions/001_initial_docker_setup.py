"""Initial Docker setup (stub migration)

Revision ID: initial_docker_setup
Revises: None
Create Date: 2026-01-01

This is a stub migration file created to fix the migration chain.
The actual initial schema was already created directly.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'initial_docker_setup'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Initial schema already exists, nothing to do."""
    pass


def downgrade() -> None:
    """Cannot downgrade initial schema."""
    pass
