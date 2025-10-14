import React from 'react';

interface Props {
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
    isEditing: boolean;
    setIsEditing: (v: boolean) => void;
}

const HrDecisionEditor: React.FC<Props> = ({
    value, onChange, onSave, onCancel, isEditing, setIsEditing
}) => {
    if (!isEditing) {
        return (
        <span
            className={`co-chip ${
            value === 'hire_ok'
                ? 'co-chip-success'
                : value === 'hire_ng'
                ? 'co-chip-failure'
                : 'co-chip-pending'
            }`}
            onClick={() => setIsEditing(true)}
            style={{ cursor: 'pointer' }}
            title="クリックして変更"
        >
            {value === 'hire_ok' && '採用'}
            {value === 'hire_ng' && '不採用'}
            {!value && '選考中'}
        </span>
        );
    }

    return (
        <div className="hr-decision-edit-row">
        <select
            className="hr-decision-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value="">選考中</option>
            <option value="hire_ok">採用</option>
            <option value="hire_ng">不採用</option>
        </select>
        <button className="hr-decision-button" onClick={onSave}>
            保存
        </button>
        <button className="hr-decision-button cancel" onClick={onCancel}>
            キャンセル
        </button>
        </div>
    );
};

export default HrDecisionEditor;