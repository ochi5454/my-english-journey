import React from 'react';
import './AIRecommendationPanel.css';

export interface AIWeights {
    gender: number;
    motivation_score: number;
    experience: number;
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
    experience: 0.05,
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
                <code>
                    推薦スコア = （志望動機スコア × 重み） × ジェンダー倍率 ×（1 + 就業年数 × 重み）
                </code>
                <br />
                <small className="ai-panel-note">
                    ※ 推薦スコアは各候補者ごとに計算され、推薦度（%）は<br />
                    すべての候補者のスコアに対して統計的パーセンタイルで算出されます。<br />
                    同じスコアの候補者が複数存在する場合は「平均順位法」により中間値を用いて評価されます。
                </small>
            </p>

            <div className="ai-panel-grid">
                <div className="ai-panel-row">
                    <label className="ai-panel-label">ジェンダー倍率（男性）</label>
                    <input
                        type="number"
                        step="0.1"
                        min={0.1}
                        max={2}
                        value={weights.gender}
                        onChange={(e) => onChange('gender', parseFloat(e.target.value))}
                        className="ai-panel-input"
                    />
                    <span className="ai-panel-initial">（初期値: 1.2）/ 範囲: 0.1〜2.0</span>
                </div>

                <div className="ai-panel-row">
                    <label className="ai-panel-label">志望動機重み</label>
                    <input
                        type="number"
                        step="0.1"
                        min={0.1}
                        max={2}
                        value={weights.motivation_score}
                        onChange={(e) => onChange('motivation_score', parseFloat(e.target.value))}
                        className="ai-panel-input"
                    />
                    <span className="ai-panel-initial">（初期値: 1.0）/ 範囲: 0.1〜2.0</span>
                </div>

                <div className="ai-panel-row">
                    <label className="ai-panel-label">就業年数重み（1年あたり）</label>
                    <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={0.2}
                        value={weights.experience}
                        onChange={(e) => onChange('experience', parseFloat(e.target.value))}
                        className="ai-panel-input"
                    />
                    <span className="ai-panel-initial">（初期値: 0.05）/ 範囲: 0〜0.2</span>
                </div>
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