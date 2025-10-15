import React from 'react';
import './AIRecommendationPanel.css';

export type AIWeights = Record<string, number>;

interface AIRecommendationPanelProps {
    weights: AIWeights;
    initialValues: AIWeights;
    enabledFields: string[];
    onChange: (key: string, value: number) => void;
    onRecalculate: () => void;
    onClose: () => void;
    formula: string;
}

const AIRecommendationPanel: React.FC<AIRecommendationPanelProps> = ({
    weights,
    enabledFields,
    onChange,
    onRecalculate,
    onClose,
    formula,
    initialValues = {}
}) => {
    const handleClear = () => {
        enabledFields.forEach((field) => {
            const raw = initialValues?.[field];
            const initial = typeof raw === 'number' && !isNaN(raw) ? raw : 1.0;
            onChange(field, initial);
        });
    };

    const handleApply = () => {
        onRecalculate();
        onClose();
    };

    return (
        <div className="ai-panel">
            <h3>AI推薦度の重み設定</h3>

            <p className="ai-panel-description">
                <code>AIスコア={formula}</code>
                <br />
                <small className="ai-panel-note">
                    ※ 上記AIスコアより、AI推薦度（%）を統計的パーセンタイルで算出。<br />
                    統計的パーセンタイルとは、同じスコアの候補者が複数存在する場合は「平均順位法」により中間値を用いて評価されます。
                </small>
            </p>

            <div className="ai-panel-grid">
                {enabledFields.map((field) => (
                    <div className="ai-panel-row" key={field}>
                        <label className="ai-panel-label">{field} の重み</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={10}
                            value={isNaN(weights[field]) ? '' : weights[field]}
                            onChange={(e) => onChange(field, parseFloat(e.target.value))}
                            className="ai-panel-input"
                        />
                    </div>
                ))}
            </div>

            <div className="ai-panel-actions">
                <button onClick={onClose} className="ai-panel-button cancel">
                    キャンセル
                </button>
                <button onClick={handleClear} className="ai-panel-button clear">
                    クリア
                </button>
                <button onClick={handleApply} className="ai-panel-button recalc">
                    適用
                </button>
            </div>
        </div>
    );
};

export default AIRecommendationPanel;