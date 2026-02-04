"""
Alembic環境設定

マイグレーションの実行環境を設定
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# アプリケーションのモデルとベースをインポート
from backend.core.database import Base
from backend.core.config import Settings
from backend import models  # noqa: F401 - モデルをインポートしてメタデータを登録

# Alembicの設定オブジェクト
config = context.config

# ログ設定
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# モデルのメタデータ（autogenerateで使用）
target_metadata = Base.metadata

# アプリケーション設定からデータベースURLを取得
settings = Settings()


def get_url():
    """データベースURLを取得"""
    return settings.database_url


def run_migrations_offline() -> None:
    """
    オフラインモードでマイグレーションを実行

    データベースに接続せずにSQLスクリプトを生成
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    オンラインモードでマイグレーションを実行

    データベースに接続してマイグレーションを直接適用
    """
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
