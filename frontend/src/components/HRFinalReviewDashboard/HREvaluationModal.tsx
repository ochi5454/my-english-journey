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
        payType?: string;
        employmentType?: string;
    };
    titleOptions: LabeledOption[];
    decisionOptions: { id: string; value: string }[];
    prefixToName: Record<string, string>;
    payTypeItems: { value: string; label: string }[];
    employmentTypes: { value: string; label: string; pay_type: string }[];
    onChange: (updated: Partial<HREvaluationModalProps['hrEvaluation']>) => void;
    onSave: (candidateId: string) => void;
    onCancel: () => void;
}

const HREvaluationModal: React.FC<HREvaluationModalProps> = ({
    candidateId,
    hrEvaluation,
    titleOptions,
    decisionOptions,
    prefixToName,
    payTypeItems,
    employmentTypes,
    onChange,
    onSave,
    onCancel
}) => {
    return (
        <div className="hr-modal-overlay">
            <div className="hr-modal">
                <h4>HR最終評価（{candidateId}）</h4>

                {/* 採用可否 */}
                <label>
                    採用可否:
                    <select
                        value={hrEvaluation.decision || ''}
                        onChange={(e) => onChange({ decision: e.target.value })}
                    >
                        <option value="">選択してください</option>
                        {decisionOptions?.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.value}
                            </option>
                        ))}
                    </select>
                </label>

                {/* 部門 */}
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
                                    {label}
                                </option>
                            ))}
                    </select>
                </label>

                {/* タイトル */}
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

                {/* 給与体系 */}
                <label>
                    給与体系:
                    <select
                        value={hrEvaluation.payType || ''}
                        onChange={(e) => onChange({ payType: e.target.value, employmentType: '' })}
                    >
                        <option value="">選択してください</option>
                        {payTypeItems.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </label>

                {/* 従業員区分 */}
                <label>
                    従業員区分:
                    <select
                        value={hrEvaluation.employmentType || ''}
                        onChange={(e) => onChange({ employmentType: e.target.value })}
                        disabled={!hrEvaluation.payType}
                    >
                        <option value="">
                            {hrEvaluation.payType
                                ? '選択してください'
                                : '← 給与体系を先に選択してください'}
                        </option>
                        {employmentTypes
                            .filter((et) => et.pay_type === hrEvaluation.payType)
                            .map((et) => (
                                <option key={et.value} value={et.value}>
                                    {et.label}
                                </option>
                            ))}
                    </select>
                </label>

                {/* 年収 */}
                <label>
                    年収（万円）:
                    <input
                        type="number"
                        placeholder="例: 600"
                        value={hrEvaluation.annualIncome || ''}
                        onChange={(e) => onChange({ annualIncome: e.target.value })}
                    />
                </label>

                {/* ボタン */}
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