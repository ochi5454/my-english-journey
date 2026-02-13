-- =====================================================
-- AI Mail Agent - PostgreSQL Schema
-- =====================================================
-- This script creates all tables for the mail agent system.
-- Run order: 01-schema.sql -> 02-seed.sql
-- =====================================================

-- =====================================================
-- Users & Authentication
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    password_salt VARCHAR(255),
    entra_sub VARCHAR(255) UNIQUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_entra_sub ON users(entra_sub);

CREATE TABLE IF NOT EXISTS token_store (
    id SERIAL PRIMARY KEY,
    user_sub VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_store_user_sub ON token_store(user_sub);

-- =====================================================
-- Email Templates
-- =====================================================

CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    variables JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);

-- =====================================================
-- Signatures
-- =====================================================

CREATE TABLE IF NOT EXISTS signatures (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signatures_user_id ON signatures(user_id);

-- =====================================================
-- Recipient Lists
-- =====================================================

CREATE TABLE IF NOT EXISTS recipient_lists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recipient_lists_user_id ON recipient_lists(user_id);

CREATE TABLE IF NOT EXISTS recipient_list_members (
    id SERIAL PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    department VARCHAR(255),
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipient_list_members_list_id ON recipient_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_recipient_list_members_email ON recipient_list_members(email);

-- =====================================================
-- Mail Send Logs
-- =====================================================

CREATE TABLE IF NOT EXISTS mail_send_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    to_addresses JSONB NOT NULL,
    cc_addresses JSONB,
    bcc_addresses JSONB,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    body_type VARCHAR(20) NOT NULL DEFAULT 'text',
    attachments JSONB,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    graph_message_id VARCHAR(255),
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mail_send_logs_user_id ON mail_send_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_send_logs_status ON mail_send_logs(status);
CREATE INDEX IF NOT EXISTS idx_mail_send_logs_sent_at ON mail_send_logs(sent_at);

-- =====================================================
-- Scheduled Mails
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduled_mails (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    scheduled_at TIMESTAMP NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
    to_addresses JSONB NOT NULL,
    cc_addresses JSONB,
    bcc_addresses JSONB,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    body_type VARCHAR(20) NOT NULL DEFAULT 'text',
    attachments JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    graph_message_id VARCHAR(255),
    sent_at TIMESTAMP,
    mail_log_id INTEGER REFERENCES mail_send_logs(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_mails_user_id ON scheduled_mails(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_mails_scheduled_at ON scheduled_mails(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_mails_status ON scheduled_mails(status);

-- =====================================================
-- Temporary Attachments
-- =====================================================

CREATE TABLE IF NOT EXISTS temp_attachments (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size INTEGER,
    file_path VARCHAR(500) NOT NULL,
    source VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_temp_attachments_session_id ON temp_attachments(session_id);
CREATE INDEX IF NOT EXISTS idx_temp_attachments_user_id ON temp_attachments(user_id);

-- =====================================================
-- Organizations (Entra ID Sync)
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    parent_id INTEGER REFERENCES organizations(id),
    level INTEGER DEFAULT 1,
    entra_department_name VARCHAR(255),
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_code ON organizations(code);
CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_entra_department_name ON organizations(entra_department_name);

-- =====================================================
-- Employee Assignments (Entra ID Sync)
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    entra_user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    display_name_kana VARCHAR(255),
    organization_id INTEGER REFERENCES organizations(id),
    job_title VARCHAR(255),
    employee_number VARCHAR(50),
    is_primary BOOLEAN DEFAULT TRUE,
    employment_type VARCHAR(50),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    synced_at TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'synced',
    sync_error_message TEXT,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_assignments_user_id ON employee_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_entra_user_id ON employee_assignments(entra_user_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_email ON employee_assignments(email);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_organization_id ON employee_assignments(organization_id);

-- =====================================================
-- Entra Sync Logs (Audit)
-- =====================================================

CREATE TABLE IF NOT EXISTS entra_sync_logs (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(20) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    users_processed INTEGER DEFAULT 0,
    users_added INTEGER DEFAULT 0,
    users_updated INTEGER DEFAULT 0,
    users_deactivated INTEGER DEFAULT 0,
    orgs_added INTEGER DEFAULT 0,
    orgs_updated INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_details JSONB DEFAULT '[]',
    metadata_json JSONB DEFAULT '{}'
);

-- =====================================================
-- Employee Transfer History (Audit)
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_transfer_history (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employee_assignments(id),
    from_organization_id INTEGER REFERENCES organizations(id),
    to_organization_id INTEGER REFERENCES organizations(id),
    transfer_date DATE NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_log_id INTEGER REFERENCES entra_sync_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_transfer_history_employee_id ON employee_transfer_history(employee_id);

-- =====================================================
-- Alembic Version Table (for migrations)
-- =====================================================

CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- =====================================================
-- End of Schema
-- =====================================================
