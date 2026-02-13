#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script

This script migrates data from SQLite (data/app.db) to PostgreSQL.

Usage:
    1. Start PostgreSQL container:
       docker-compose up postgres -d

    2. Run this script:
       python scripts/migrate_sqlite_to_postgres.py

    3. Update backend/.env:
       DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db

Requirements:
    - psycopg2-binary
    - sqlalchemy
"""

import os
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker


# Configuration
SQLITE_URL = f"sqlite:///{project_root}/data/app.db"
POSTGRES_URL = os.getenv(
    "POSTGRES_URL",
    "postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db"
)

# Tables to migrate (in order of dependencies)
TABLES_TO_MIGRATE = [
    "users",
    "token_store",
    "organizations",
    "email_templates",
    "signatures",
    "recipient_lists",
    "recipient_list_members",
    "mail_send_logs",
    "scheduled_mails",
    "temp_attachments",
    "employee_assignments",
    "entra_sync_logs",
    "employee_transfer_history",
]


def get_table_columns(engine, table_name: str) -> list[str]:
    """Get column names for a table."""
    inspector = inspect(engine)
    columns = inspector.get_columns(table_name)
    return [col["name"] for col in columns]


def migrate_table(sqlite_session, postgres_session, table_name: str, sqlite_engine, postgres_engine):
    """Migrate a single table from SQLite to PostgreSQL."""
    print(f"  Migrating {table_name}...")

    # Check if table exists in both databases
    sqlite_inspector = inspect(sqlite_engine)
    postgres_inspector = inspect(postgres_engine)

    if table_name not in sqlite_inspector.get_table_names():
        print(f"    Skipping {table_name} (not in SQLite)")
        return 0

    if table_name not in postgres_inspector.get_table_names():
        print(f"    Skipping {table_name} (not in PostgreSQL)")
        return 0

    # Get common columns
    sqlite_cols = set(get_table_columns(sqlite_engine, table_name))
    postgres_cols = set(get_table_columns(postgres_engine, table_name))
    common_cols = sqlite_cols & postgres_cols

    if not common_cols:
        print(f"    No common columns found for {table_name}")
        return 0

    # Read data from SQLite
    cols_str = ", ".join(common_cols)
    result = sqlite_session.execute(text(f"SELECT {cols_str} FROM {table_name}"))
    rows = result.fetchall()

    if not rows:
        print(f"    No data in {table_name}")
        return 0

    # Clear existing data in PostgreSQL (optional, be careful!)
    # postgres_session.execute(text(f"DELETE FROM {table_name}"))

    # Insert data into PostgreSQL
    inserted = 0
    for row in rows:
        try:
            # Build INSERT statement
            values = {}
            for col, val in zip(common_cols, row):
                values[col] = val

            placeholders = ", ".join([f":{col}" for col in common_cols])
            cols_list = ", ".join(common_cols)

            # Use ON CONFLICT DO NOTHING to skip duplicates
            insert_sql = f"""
                INSERT INTO {table_name} ({cols_list})
                VALUES ({placeholders})
                ON CONFLICT DO NOTHING
            """
            postgres_session.execute(text(insert_sql), values)
            inserted += 1
        except Exception as e:
            print(f"    Error inserting row: {e}")
            continue

    postgres_session.commit()
    print(f"    Migrated {inserted}/{len(rows)} rows")
    return inserted


def reset_sequences(postgres_session, postgres_engine):
    """Reset PostgreSQL sequences to max ID + 1."""
    print("\n  Resetting sequences...")

    inspector = inspect(postgres_engine)
    tables = inspector.get_table_names()

    for table in tables:
        # Check if table has 'id' column
        columns = inspector.get_columns(table)
        id_col = next((c for c in columns if c["name"] == "id"), None)

        if id_col:
            try:
                # Get max ID
                result = postgres_session.execute(text(f"SELECT MAX(id) FROM {table}"))
                max_id = result.scalar() or 0

                # Reset sequence
                seq_name = f"{table}_id_seq"
                postgres_session.execute(
                    text(f"SELECT setval('{seq_name}', :val, true)"),
                    {"val": max(max_id, 1)}
                )
                print(f"    Reset {seq_name} to {max(max_id, 1)}")
            except Exception as e:
                # Sequence might not exist for this table
                pass

    postgres_session.commit()


def main():
    print("=" * 60)
    print("SQLite to PostgreSQL Migration")
    print("=" * 60)
    print(f"Source: {SQLITE_URL}")
    print(f"Target: {POSTGRES_URL}")
    print()

    # Check if SQLite database exists
    sqlite_path = project_root / "data" / "app.db"
    if not sqlite_path.exists():
        print(f"Error: SQLite database not found at {sqlite_path}")
        sys.exit(1)

    # Create engines
    print("Connecting to databases...")
    try:
        sqlite_engine = create_engine(SQLITE_URL)
        postgres_engine = create_engine(POSTGRES_URL)
    except Exception as e:
        print(f"Error connecting to databases: {e}")
        sys.exit(1)

    # Create sessions
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    PostgresSession = sessionmaker(bind=postgres_engine)

    sqlite_session = SQLiteSession()
    postgres_session = PostgresSession()

    try:
        # Migrate each table
        print("\nMigrating tables...")
        total_migrated = 0

        for table in TABLES_TO_MIGRATE:
            count = migrate_table(
                sqlite_session,
                postgres_session,
                table,
                sqlite_engine,
                postgres_engine
            )
            total_migrated += count

        # Reset sequences
        reset_sequences(postgres_session, postgres_engine)

        print("\n" + "=" * 60)
        print(f"Migration complete! Total rows migrated: {total_migrated}")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Update backend/.env:")
        print("   DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db")
        print()
        print("2. Restart the backend:")
        print("   uvicorn backend.app:app --reload")
        print()

    except Exception as e:
        print(f"Migration failed: {e}")
        postgres_session.rollback()
        sys.exit(1)
    finally:
        sqlite_session.close()
        postgres_session.close()


if __name__ == "__main__":
    main()
