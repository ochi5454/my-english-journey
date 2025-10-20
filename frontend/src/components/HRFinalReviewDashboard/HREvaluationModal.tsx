import React from 'react';
import './HRFinalReviewDashboard.css';
import type { LabeledOption } from './hrReviewTypes';

interface HREvaluationModalProps {
    candidateId: string;
    interviewerId: string;
    hrEvaluation: {
        decision?: string;
        division?: string;
        title?: string;
        annualIncome?: string;
    };
    titleOptions: LabeledOption[];
    prefixToName: Record<string, string>;
    onChange: (updated: Partial<HREvaluationModalProps['hrEvaluation']>) => void;
    onSave: (candidateId: string) => void;
    onCancel: () => void;
}

const HREvaluationModal: React.FC<HREvaluationModalProps> = ({
    candidateId,
    hrEvaluation,
    titleOptions,
    prefixToName,
    onChange,
    onSave,
    onCancel
    }) => {
    return (
        <div className="hr-modal-overlay">
        <div className="hr-modal">
            <h4>HR最終評価（{candidateId}）</h4>

            <label>
            採用可否:
            <select
                value={hrEvaluation.decision || ''}
                onChange={(e) => onChange({ decision: e.target.value })}
            >
                <option value="">選択してください</option>
                <option value="hire_ok">✅ 採用</option>
                <option value="hire_ng">🙅‍♂️ 不採用</option>
            </select>
            </label>

            <label>
                部門:
                <select
                    value={hrEvaluation.division || ''}
                    onChange={(e) => onChange({ division: e.target.value })}
                >
                    <option value="">選択してください</option>
                    {Object.entries(prefixToName)
                    .filter(([prefix]) => prefix !== 'common')
                    .map(([prefix, label]) => (
                        <option key={prefix} value={prefix}>
                        {label} {/* ✅ prefixではなく和名を表示 */}
                        </option>
                    ))}
                </select>
            </label>

            <label>
            タイトル:
            <select
                value={hrEvaluation.title || ''}
                onChange={(e) => onChange({ title: e.target.value })}
            >
                <option value="">選択してください</option>
                {titleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
                ))}
            </select>
            </label>

            <label>
            年収（万円）:
            <input
                type="number"
                placeholder="例: 600"
                value={hrEvaluation.annualIncome || ''}
                onChange={(e) => onChange({ annualIncome: e.target.value })}
            />
            </label>

            <div className="hr-modal-buttons">
            <button onClick={() => onSave(candidateId)}>保存</button>
            <button onClick={onCancel} className="cancel-button">
                キャンセル
            </button>
            </div>
        </div>
        </div>
    );
};

export default HREvaluationModal;