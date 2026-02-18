"""Add recipient_type column to recipient_list_members table

Revision ID: 008_add_recipient_type
Revises: 007_add_employee_id
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008_add_recipient_type'
down_revision: Union[str, None] = '007_add_employee_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """マイグレーション適用: recipient_type カラムを追加"""
    # Add recipient_type column for To/Cc/Bcc classification
    # Default value is 'to' for existing records
    op.add_column(
        'recipient_list_members',
        sa.Column('recipient_type', sa.String(3), nullable=False, server_default='to')
    )


def downgrade() -> None:
    """マイグレーション取消"""
    op.drop_column('recipient_list_members', 'recipient_type')
