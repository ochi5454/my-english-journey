import React, { useEffect, useState } from 'react';
import './AIRecommendationPanel.css';
import { fieldOptions } from '../../Utils/fieldOptions';

export type AIWeights = Record<string, number>;

interface AIRecommendationPanelProps {
    division: string;
    weights: AIWeights;
    initialValues: AIWeights;
    enabledFields: string[];
    formula: string;
    onChange: (key: string, value: number) => void;
    onApply: (newWeights?: AIWeights) => void;
    onClose: () => void;
    prefixToName: Record<string, string>;
}

const getFieldLabel = (value: string) => {
    return fieldOptions.find(opt => opt.value === value)?.label || value;
};

const convertFormulaToLabel = (formula: string): string => {
    return fieldOptions.reduce((acc, { value, label }) => {
        const regex = new RegExp(`\\b${value}\\b`, 'g');
        return acc.replace(regex, label);
    }, formula);
};

const AIRecommendationPanel: React.FC<AIRecommendationPanelProps> = ({
    division,
    weights,
    initialValues,
    enabledFields,
    formula,
    onChange,
    onApply,
    onClose,
    prefixToName,
}) => {
    // 🧠 ローカル状態で即時反映
    const [localWeights, setLocalWeights] = useState<AIWeights>({ ...weights });
    // ボタン押下時の反応
    const [isApplying, setIsApplying] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // ✅ 親からのweightsが変わったときに同期
    useEffect(() => {
        setLocalWeights({ ...weights });
    }, [weights]);
    
    const handleApply = () => {
        setIsApplying(true);
        onApply();
        setTimeout(() => setIsApplying(false), 1000);
    };

    const handleInputChange = (key: string, value: number) => {
        const updated = { ...localWeights, [key]: value };
        setLocalWeights(updated);
        onChange(key, value);
    };

    const handleClear = () => {
        setIsClearing(true);
        const reset: AIWeights = {};
        enabledFields.forEach((field) => {
            const raw = initialValues?.[field];
            reset[field] = typeof raw === 'number' && !isNaN(raw) ? raw : 1.0;
        });
        setLocalWeights(reset);
        onApply(reset);
        setTimeout(() => setIsClearing(false), 1000);
    };

    return (
        <div className="ai-panel">
            <button className="ai-panel-close" onClick={onClose}>
                ×
            </button>

            <h3>{prefixToName[division] || division} の重み付スコア算出</h3>

            <p className="ai-panel-description">
                <code>(例) 重み付スコア = {convertFormulaToLabel(formula)}</code>
                <br />
                <small className="ai-panel-note">
                    ※ 上記計算により重み付スコアを算出し、その後統計的パーセンタイルで推薦度（%）を算出。<br />
                    統計的パーセンタイルでは、同じ重み付スコアが複数存在する場合「平均順位法」により平等に評価します。
                </small>
            </p>

            <div className="ai-panel-grid">
                {enabledFields.map((field) => (
                    <div className="ai-panel-row" key={field}>
                        <label className="ai-panel-label">{getFieldLabel(field)}の重み</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={10}
                            value={isNaN(localWeights[field]) ? '' : localWeights[field]}
                            onChange={(e) => handleInputChange(field, parseFloat(e.target.value))}
                            className="ai-panel-input"
                        />
                    </div>
                ))}
            </div>

            <div className="ai-panel-actions">
                <button
                    onClick={handleClear}
                    className={`ai-panel-button clear ${isClearing ? 'loading' : ''}`}
                >
                    {isClearing ? 'クリア中...' : 'クリア'}
                </button>

                <button
                    onClick={handleApply}
                    className={`ai-panel-button recalc ${isApplying ? 'loading' : ''}`}
                >
                    {isApplying ? '適用中...' : '適用'}
                </button>
            </div>
        </div>
    );
};

export default AIRecommendationPanel;