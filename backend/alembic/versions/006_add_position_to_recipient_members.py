"""Add position column to recipient_list_members table

Revision ID: 006_add_position
Revises: 005_add_entra_sub
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006_add_position'
down_revision: Union[str, None] = '005_add_entra_sub'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """マイグレーション適用"""
    # Add position column for job title/position info
    op.add_column('recipient_list_members', sa.Column('position', sa.String(255), nullable=True))


def downgrade() -> None:
    """マイグレーション取消"""
    op.drop_column('recipient_list_members', 'position')
