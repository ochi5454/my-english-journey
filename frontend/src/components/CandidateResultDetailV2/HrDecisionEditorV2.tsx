import React from 'react';

interface Props {
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
    isEditing: boolean;
    setIsEditing: (v: boolean) => void;
    hiringDecisions: { id: string; value: string }[];
}

const HrDecisionEditorV2: React.FC<Props> = ({
    value, onChange, onSave, onCancel, isEditing, setIsEditing, hiringDecisions
}) => {
    if (!isEditing) {
        // ✅ DB値 → UI 3択に変換
        const displayText =
            !value
                ? "選考中"
                : value === "no_hire"
                ? "不採用"
                : "採用"; // hire_ok / strong_hire → 採用扱い

        const chipClass =
            value === "no_hire"
                ? "co-chip-failure"
                : value === "hire_ok" || value === "strong_hire"
                ? "co-chip-success"
                : "co-chip-pending";

        return (
            <span
                className={`co-chip ${chipClass}`}
                onClick={() => setIsEditing(true)}
                style={{ cursor: "pointer" }}
                title="クリックして変更"
            >
                {displayText}
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
            {hiringDecisions.map(opt => (
                <option key={opt.id} value={opt.id}>
                {opt.value}
                </option>
            ))}
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

export default HrDecisionEditorV2;
