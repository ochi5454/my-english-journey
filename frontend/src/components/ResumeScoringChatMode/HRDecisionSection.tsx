import React from 'react';
import './HRDecisionSection.css';

type Props = {
    hrDecisionDraft: 'hire_ok' | 'no_hire' | '';
    setHrDecisionDraft: (v: 'hire_ok' | 'no_hire' | '') => void;
    showSaved: boolean;
    onSave: () => void;
};

const HRDecisionSection: React.FC<Props> = ({
    hrDecisionDraft,
    setHrDecisionDraft,
    showSaved,
    onSave,
}) => {
    return (
        <div className="hr-decision-section">
        <h4>👥 HR最終判定</h4>
        <div className="hr-decision-options">
            <label>
            <input
                type="radio"
                name="hrDecision"
                value="hire_ok"
                checked={hrDecisionDraft === 'hire_ok'}
                onChange={(e) => setHrDecisionDraft(e.target.value as any)}
            />
            ✅ 合格
            </label>
            <label>
            <input
                type="radio"
                name="hrDecision"
                value="no_hire"
                checked={hrDecisionDraft === 'no_hire'}
                onChange={(e) => setHrDecisionDraft(e.target.value as any)}
            />
            ❌ 不合格
            </label>
        </div>

        <button onClick={onSave} disabled={!hrDecisionDraft} className="save-hr-btn">
            💾 保存する
        </button>
        {showSaved && <span className="saved-label">✔ 保存しました</span>}
        </div>
    );
};

export default HRDecisionSection;