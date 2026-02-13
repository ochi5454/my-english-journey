-- =====================================================
-- AI Mail Agent - Sample Data
-- =====================================================
-- This script inserts sample data for development/testing.
-- Run after: 01-schema.sql, 02-seed.sql
-- =====================================================

-- =====================================================
-- Fix default values for created_at columns
-- (In case migrations didn't set them properly)
-- =====================================================

ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE recipient_lists ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE email_templates ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE email_templates ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE signatures ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE signatures ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- =====================================================
-- Sample Recipient Lists
-- =====================================================

DO $$
DECLARE
    target_user RECORD;
    list_id INTEGER;
BEGIN
    -- Create sample recipient list for all users
    FOR target_user IN SELECT id, email FROM users LOOP
        -- Check if user already has a recipient list
        IF NOT EXISTS (SELECT 1 FROM recipient_lists WHERE user_id = target_user.id) THEN
            -- Create recipient list
            INSERT INTO recipient_lists (user_id, name, description)
            VALUES (
                target_user.id,
                'テスト用宛先リスト',
                'サンプルデータ'
            )
            RETURNING id INTO list_id;

            -- Insert sample recipient list members
            INSERT INTO recipient_list_members (list_id, email, name, department) VALUES
                (list_id, 'y.maruyama@prothentia.com', '丸山', NULL),
                (list_id, 'j.choi@prothentia.com', '崔', NULL),
                (list_id, 'hi3-ochi@aeondelight.jp', '越智', NULL);

            RAISE NOTICE 'Created recipient list for user: %', target_user.email;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- Sample Email Templates
-- =====================================================

DO $$
DECLARE
    target_user RECORD;
BEGIN
    FOR target_user IN SELECT id, email FROM users LOOP
        -- Check if user already has templates
        IF NOT EXISTS (SELECT 1 FROM email_templates WHERE user_id = target_user.id) THEN
            -- 会議招集テンプレート
            INSERT INTO email_templates (user_id, name, category, subject, body, variables)
            VALUES (
                target_user.id,
                '会議招集',
                '社内連絡',
                '【会議招集】{{meeting_title}}',
                E'各位\n\nお疲れ様です。\n\n下記の通り会議を開催いたします。\nご参加をお願いいたします。\n\n【会議名】{{meeting_title}}\n【日時】{{date}} {{time}}\n【場所】{{location}}\n【議題】\n{{agenda}}\n\n以上、よろしくお願いいたします。',
                '["meeting_title", "date", "time", "location", "agenda"]'::jsonb
            );

            -- 勤怠連絡テンプレート
            INSERT INTO email_templates (user_id, name, category, subject, body, variables)
            VALUES (
                target_user.id,
                '勤怠連絡',
                '勤怠管理',
                '【勤怠連絡】{{date}} {{type}}',
                E'上長各位\n\nお疲れ様です。\n\n勤怠について以下の通りご連絡いたします。\n\n【日付】{{date}}\n【種別】{{type}}\n【理由】{{reason}}\n\n以上、よろしくお願いいたします。',
                '["date", "type", "reason"]'::jsonb
            );

            -- お礼メールテンプレート
            INSERT INTO email_templates (user_id, name, category, subject, body, variables)
            VALUES (
                target_user.id,
                'お礼メール',
                '社外連絡',
                '【御礼】{{subject}}',
                E'{{company_name}}\n{{name}}様\n\nお世話になっております。\n\n{{content}}\n\n今後ともよろしくお願いいたします。',
                '["company_name", "name", "subject", "content"]'::jsonb
            );

            RAISE NOTICE 'Created email templates for user: %', target_user.email;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- Sample Signatures
-- =====================================================

DO $$
DECLARE
    target_user RECORD;
BEGIN
    FOR target_user IN SELECT id, email, name FROM users LOOP
        -- Check if user already has a signature
        IF NOT EXISTS (SELECT 1 FROM signatures WHERE user_id = target_user.id) THEN
            INSERT INTO signatures (user_id, name, content, is_default)
            VALUES (
                target_user.id,
                '標準署名',
                E'--\n' || COALESCE(target_user.name, 'User') || E'\nEmail: ' || target_user.email,
                TRUE
            );

            RAISE NOTICE 'Created signature for user: %', target_user.email;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- End of Sample Data
-- =====================================================
