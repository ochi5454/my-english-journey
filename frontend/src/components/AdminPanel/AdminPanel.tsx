import React, { useState } from 'react';
import './AdminPanel.css';
import SkillMaster from './SkillMaster.tsx';
import AIFormulaConfig from './AIFormulaConfig.tsx';

const AdminPanel: React.FC = () => {
    const [view, setView] = useState<'skill' | 'ai_formula'>('skill');

    return (
        <div className="admin-container">
            <div className="admin-tabs">
                <div
                    className={`admin-tab ${view === 'skill' ? 'active' : ''}`}
                    onClick={() => setView('skill')}
                >
                    スキルマスタ
                </div>
                <div
                    className={`admin-tab ${view === 'ai_formula' ? 'active' : ''}`}
                    onClick={() => setView('ai_formula')}
                >
                    AIスコア設定
                </div>
            </div>

            <div className="admin-content">
                {view === 'skill' && <SkillMaster />}
                {view === 'ai_formula' && <AIFormulaConfig />}
            </div>
        </div>
    );
};

export default AdminPanel;