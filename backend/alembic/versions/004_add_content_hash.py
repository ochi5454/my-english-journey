"""datasetsテーブルにcontent_hashカラム追加

Revision ID: 004_add_content_hash
Revises: 003_add_api_keys
Create Date: 2026-02-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_add_content_hash'
down_revision: Union[str, None] = '003_add_api_keys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """マイグレーション適用"""
    op.add_column('datasets', sa.Column('content_hash', sa.String(64), nullable=True))
    op.create_index('ix_datasets_content_hash', 'datasets', ['content_hash'])


def downgrade() -> None:
    """マイグレーション取消"""
    op.drop_index('ix_datasets_content_hash', table_name='datasets')
    op.drop_column('datasets', 'content_hash')
