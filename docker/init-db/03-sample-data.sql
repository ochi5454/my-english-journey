-- =====================================================
-- AI Mail Agent - Sample Recipient Data
-- =====================================================
-- This script inserts sample recipient list data.
-- Run after: 01-schema.sql, 02-seed.sql
-- =====================================================

DO $$
DECLARE
    admin_id INTEGER;
    list_id INTEGER;
BEGIN
    SELECT id INTO admin_id FROM users WHERE email = 'admin' LIMIT 1;

    IF admin_id IS NOT NULL THEN
        -- Create recipient list
        INSERT INTO recipient_lists (user_id, name, description)
        VALUES (
            admin_id,
            'テスト用宛先リスト',
            'サンプルデータ'
        )
        RETURNING id INTO list_id;

        -- Insert sample recipient list members
        INSERT INTO recipient_list_members (list_id, email, name, department) VALUES
            (list_id, 'y.maruyama@prothentia.com', '丸山', NULL),
            (list_id, 'j.choi@prothentia.com', '崔', NULL),
            (list_id, 'hi3-ochi@aeondelight.jp', '越智', NULL);

        RAISE NOTICE 'Inserted recipient list with 3 sample members';
    END IF;
END $$;

-- =====================================================
-- End of Sample Data
-- =====================================================
