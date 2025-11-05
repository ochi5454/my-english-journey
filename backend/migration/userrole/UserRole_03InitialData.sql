-- システム標準ロール
INSERT OR IGNORE INTO roles (id, name, display_name, is_system_role, description) VALUES
('role_admin', 'admin', 'システム管理者', 1, '全ての操作が可能'),
('role_hr_mgr', 'hr_manager', '人事マネージャー', 1, 'HR最終判定・面談設定が可能'),
('role_hr_rev', 'hr_reviewer', '人事レビュアー', 1, 'スコアリング結果の確認・コメントが可能'),
('role_bpo_op', 'bpo_operator', 'BPOオペレーター', 1, '履歴書スコアリングの実行が可能'),
('role_interviewer', 'interviewer', '面接官', 1, '面談の実施・評価が可能');

-- システム標準権限
INSERT OR IGNORE INTO permissions (id, name, display_name, category, is_system_permission) VALUES
-- Admin系
('perm_manage_users', 'can_manage_users', 'ユーザー管理', 'admin', 1),
('perm_manage_roles', 'can_manage_roles', 'ロール管理', 'admin', 1),
('perm_manage_permissions', 'can_manage_permissions', '権限管理', 'admin', 1),
('perm_view_audit_log', 'can_view_audit_log', '監査ログ閲覧', 'admin', 1),

-- Resume系
('perm_score_resume', 'can_score_resume', '履歴書スコアリング実行', 'resume', 1),
('perm_view_scoring_result', 'can_view_scoring_result', 'スコアリング結果閲覧', 'resume', 1),
('perm_export_resume_data', 'can_export_resume_data', '履歴書データエクスポート', 'resume', 1),

-- HR Decision系
('perm_request_hr_review', 'can_request_hr_review', 'HR確認依頼送信', 'hr_decision', 1),
('perm_make_final_decision', 'can_make_final_decision', 'HR最終判定実行', 'hr_decision', 1),
('perm_override_ai_score', 'can_override_ai_score', 'AIスコア上書き', 'hr_decision', 1),

-- Interview系
('perm_schedule_interview', 'can_schedule_interview', '面談設定', 'interview', 1),
('perm_conduct_interview', 'can_conduct_interview', '面談実施', 'interview', 1),
('perm_view_interview_history', 'can_view_interview_history', '面談履歴閲覧', 'interview', 1),

-- Skills系
('perm_manage_skills', 'can_manage_skills', 'スキル定義管理', 'admin', 1);

-- ロールと権限の紐付け
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
-- admin: 全権限
('role_admin', 'perm_manage_users'),
('role_admin', 'perm_manage_roles'),
('role_admin', 'perm_manage_permissions'),
('role_admin', 'perm_view_audit_log'),
('role_admin', 'perm_score_resume'),
('role_admin', 'perm_view_scoring_result'),
('role_admin', 'perm_export_resume_data'),
('role_admin', 'perm_request_hr_review'),
('role_admin', 'perm_make_final_decision'),
('role_admin', 'perm_override_ai_score'),
('role_admin', 'perm_schedule_interview'),
('role_admin', 'perm_conduct_interview'),
('role_admin', 'perm_view_interview_history'),
('role_admin', 'perm_manage_skills'),

-- hr_manager
('role_hr_mgr', 'perm_view_scoring_result'),
('role_hr_mgr', 'perm_make_final_decision'),
('role_hr_mgr', 'perm_override_ai_score'),
('role_hr_mgr', 'perm_schedule_interview'),
('role_hr_mgr', 'perm_view_interview_history'),

-- hr_reviewer
('role_hr_rev', 'perm_view_scoring_result'),
('role_hr_rev', 'perm_request_hr_review'),

-- bpo_operator
('role_bpo_op', 'perm_score_resume'),
('role_bpo_op', 'perm_view_scoring_result'),
('role_bpo_op', 'perm_request_hr_review'),

-- interviewer
('role_interviewer', 'perm_conduct_interview'),
('role_interviewer', 'perm_view_interview_history');