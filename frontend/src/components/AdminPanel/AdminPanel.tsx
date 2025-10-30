import React, { useState } from 'react';
import './AdminPanel.css';
import SkillMaster from './SkillMaster.tsx';
import AIFormulaConfig from './AIFormulaConfig.tsx';
import QATagMaster from './QATagMaster.tsx';
import RoleMaster from './RoleMaster.tsx';
import QualitativeItemMaster from './QualitativeItemMaster.tsx';

const AdminPanel: React.FC = () => {
    const [view, setView] = useState<'skill' | 'roles' | 'qualitative' | 'qa_tag' | 'ai_formula' >('skill');

    return (
        <div className="admin-container">
            <div className="admin-tabs">
                <div
                    className={`admin-tab ${view === 'skill' ? 'active' : ''}`}
                    onClick={() => setView('skill')}
                >
                    部門・スキル
                </div>
                <div
                    className={`admin-tab ${view === 'roles' ? 'active' : ''}`}
                    onClick={() => setView('roles')}
                >
                    ロール
                </div>
                <div
                    className={`admin-tab ${view === 'qualitative' ? 'active' : ''}`}
                    onClick={() => setView('qualitative')}
                >
                    定性評価
                </div>
                <div
                    className={`admin-tab ${view === 'qa_tag' ? 'active' : ''}`}
                    onClick={() => setView('qa_tag')}
                >
                    QAタグ
                </div>
                <div
                    className={`admin-tab ${view === 'ai_formula' ? 'active' : ''}`}
                    onClick={() => setView('ai_formula')}
                >
                    AIスコア
                </div>
            </div>

            <div className="admin-content">
                {view === 'skill' && <SkillMaster />}
                {view === 'roles' && <RoleMaster />}
                {view === 'qualitative' && <QualitativeItemMaster />}
                {view === 'qa_tag' && <QATagMaster />}
                {view === 'ai_formula' && <AIFormulaConfig />}
            </div>
        </div>
    );
};

export default AdminPanel;