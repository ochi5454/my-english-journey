import React, { useState } from 'react';
import './AdminPanel.css';
import SkillMaster from './SkillMaster.tsx';

const AdminPanel: React.FC = () => {
    const [view, setView] = useState<'skill'>('skill');  // 他のモードはまだ未対応

    return (
        <div className="admin-container">
            <div className="admin-tabs">
                <div
                    className={`admin-tab active`}
                    onClick={() => setView('skill')}
                >
                    スキルマスタ
                </div>
            </div>

            <div className="admin-content">
                {view === 'skill' && <SkillMaster />}
            </div>
        </div>
    );
};

export default AdminPanel;