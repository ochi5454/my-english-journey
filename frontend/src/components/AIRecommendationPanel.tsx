import React from 'react';
import './AIRecommendationPanel.css';

export interface AIWeights {
    gender: number;
    motivation_score: number;
}

interface AIRecommendationPanelProps {
    weights: AIWeights;
    onChange: (key: keyof AIWeights, value: number) => void;
    onRecalculate: () => void;
    onClose: () => void;
}

const INITIAL_VALUES: AIWeights = {
    gender: 1.2,
    motivation_score: 1.0,
};

const AIRecommendationPanel: React.FC<AIRecommendationPanelProps> = ({
    weights,
    onChange,
    onRecalculate,
    onClose
}) => {
    const handleClear = () => {
        Object.entries(INITIAL_VALUES).forEach(([key, value]) => {
            onChange(key as keyof AIWeights, value);
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
                <code>AI推薦度 = （志望動機スコア × 重み） × ジェンダー倍率</code>
                <br />
                <small className="ai-panel-note">
                    ※ AI推薦度の%は統計的パーセンタイルで算出されています。
                    同じスコアの候補者が複数いる場合は「平均順位法」で中間値をとり、公平に評価されます。
                </small>
            </p>

            <div className="ai-panel-grid">
                {Object.entries(weights).map(([key, value]) => {
                    const label = labelMap[key as keyof AIWeights] || key;
                    const initial = INITIAL_VALUES[key as keyof AIWeights];
                    return (
                        <div className="ai-panel-row" key={key}>
                            <label className="ai-panel-label">{label}</label>
                            <input
                                type="number"
                                step="0.1"
                                min={0.1}
                                max={2}
                                value={value}
                                onChange={(e) =>
                                    onChange(key as keyof AIWeights, parseFloat(e.target.value))
                                }
                                className="ai-panel-input"
                            />
                            <span className="ai-panel-initial">（初期値: {initial}）/ 範囲: 0.1〜2.0）</span>
                        </div>
                    );
                })}
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

const labelMap: Record<keyof AIWeights, string> = {
    gender: 'ジェンダー倍率（男性）',
    motivation_score: '志望動機スコア重み',
};

export default AIRecommendationPanel;