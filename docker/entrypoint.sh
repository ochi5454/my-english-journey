#!/bin/bash
set -e

# =====================================================
# AI Mail Agent - All-in-One Entrypoint Script
# =====================================================

echo "=========================================="
echo "AI Mail Agent - Starting All-in-One Container"
echo "=========================================="

# =====================================================
# Create log directories
# =====================================================

mkdir -p /var/log/supervisor
mkdir -p /var/run/postgresql
chown -R postgres:postgres /var/run/postgresql

# =====================================================
# Initialize PostgreSQL if needed
# =====================================================

PGDATA="/var/lib/postgresql/16/main"

if [ ! -d "$PGDATA" ] || [ -z "$(ls -A $PGDATA 2>/dev/null)" ]; then
    echo "Initializing PostgreSQL database..."

    # Create data directory
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"

    # Initialize database
    su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA"

    # Configure PostgreSQL
    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"

    # Start PostgreSQL temporarily to create database and user
    su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -l /var/log/postgresql/startup.log start"

    # Wait for PostgreSQL to start
    sleep 5

    # Create user and database
    su - postgres -c "psql -c \"CREATE USER mailagent_user WITH PASSWORD 'mailagent_password';\""
    su - postgres -c "psql -c \"CREATE DATABASE mailagent_db OWNER mailagent_user;\""
    su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE mailagent_db TO mailagent_user;\""

    # Run initialization scripts
    for f in /docker-entrypoint-initdb.d/*.sql; do
        if [ -f "$f" ]; then
            echo "Running $f..."
            su - postgres -c "psql -d mailagent_db -f $f"
        fi
    done

    # Stop PostgreSQL (Supervisor will start it)
    su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA stop"

    echo "PostgreSQL initialization complete."
else
    echo "PostgreSQL data directory already exists. Skipping initialization."
fi

# =====================================================
# Copy static files for Next.js standalone
# =====================================================

if [ -d "/app/frontend/.next/static" ]; then
    mkdir -p /app/frontend/.next/standalone/.next
    cp -r /app/frontend/.next/static /app/frontend/.next/standalone/.next/
fi

if [ -d "/app/frontend/public" ]; then
    cp -r /app/frontend/public /app/frontend/.next/standalone/
fi

# =====================================================
# Start Supervisor
# =====================================================

echo "Starting services with Supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
