"""Add entra_sub column to users table for Entra ID support

Revision ID: 005_add_entra_sub
Revises: 004_add_content_hash
Create Date: 2026-02-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_add_entra_sub'
down_revision: Union[str, None] = '004_add_content_hash'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """マイグレーション適用"""
    # Add entra_sub column for Entra ID users
    op.add_column('users', sa.Column('entra_sub', sa.String(), nullable=True))
    op.create_index('ix_users_entra_sub', 'users', ['entra_sub'], unique=True)

    # Make password_hash and password_salt nullable for Entra users
    op.alter_column('users', 'password_hash', nullable=True)
    op.alter_column('users', 'password_salt', nullable=True)


def downgrade() -> None:
    """マイグレーション取消"""
    op.alter_column('users', 'password_salt', nullable=False)
    op.alter_column('users', 'password_hash', nullable=False)
    op.drop_index('ix_users_entra_sub', table_name='users')
    op.drop_column('users', 'entra_sub')
