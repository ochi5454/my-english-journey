"""Add employee_id column to recipient_list_members table

Revision ID: 007_add_employee_id
Revises: 006_add_position
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007_add_employee_id'
down_revision: Union[str, None] = '006_add_position'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """マイグレーション適用"""
    # Add employee_id column for employee number
    op.add_column('recipient_list_members', sa.Column('employee_id', sa.String(50), nullable=True))
    op.create_index('ix_recipient_list_members_employee_id', 'recipient_list_members', ['employee_id'])


def downgrade() -> None:
    """マイグレーション取消"""
    op.drop_index('ix_recipient_list_members_employee_id', table_name='recipient_list_members')
    op.drop_column('recipient_list_members', 'employee_id')
