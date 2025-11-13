import React, { useState, useEffect } from 'react';
import AIRecommendationPanel from './AIRecommendationPanel';
import type { AIWeights } from './AIRecommendationPanel';
import './AIRecommendationPanelContainer.css';

interface DivisionConfig {
  formula: string;
  enabledFields: string[];
  weights: AIWeights;
  initialValues: AIWeights;
}

interface Props {
  divisions: Record<string, DivisionConfig>;
  onSave: (division: string, weights: AIWeights) => void;
  onClose: () => void;
  prefixToName: Record<string, string>;
}

const AIRecommendationPanelContainer: React.FC<Props> = ({ divisions: initialDivisions, onSave, onClose, prefixToName }) => {
  // ✅ divisionsをローカルstate化
  const [divisions, setDivisions] = useState<Record<string, DivisionConfig>>(initialDivisions);
  const divisionKeys = Object.keys(divisions);
  const [selectedDivision, setSelectedDivision] = useState<string>('');

  // ✅ propsが更新されたとき同期（他の部門設定を読み直したとき用）
  useEffect(() => {
    setDivisions(initialDivisions);
  }, [initialDivisions]);

  // ✅ divisionKeys更新後に自動で最初の部門を選択
  useEffect(() => {
    if (divisionKeys.length > 0 && !selectedDivision) {
      setSelectedDivision(divisionKeys[0]);
    }
  }, [divisionKeys, selectedDivision]);

  // 🧠 重み変更（リアルタイム反映）
  const handleChange = (key: string, value: number) => {
    const current = divisions[selectedDivision];
    if (!current) return;

    const updatedWeights = { ...current.weights, [key]: value };

    // ✅ 親もローカルも両方更新
    const updatedDivisions = {
      ...divisions,
      [selectedDivision]: {
        ...current,
        weights: updatedWeights,
      },
    };
    setDivisions(updatedDivisions);
    onSave(selectedDivision, updatedWeights);
  };

  // ✅ 「適用」ボタン押下時
const handleApply = (newWeights?: AIWeights) => {
    const cfg = divisions[selectedDivision];
    if (!cfg) return;
    onSave(selectedDivision, { ...(newWeights || cfg.weights) });
  };

  return (
    <div className="ai-container">
      <h2>部門別の推薦度%</h2>

      {/* ✅ 部門タブヘッダー */}
      <div className="ai-tab-header">
        {divisionKeys.map((div) => (
          <button
            key={div}
            className={`ai-tab-button ${div === selectedDivision ? 'active' : ''}`}
            onClick={() => setSelectedDivision(div)}
          >
            {prefixToName[div] || div}
          </button>
        ))}
      </div>

      {/* ✅ タブ内容 */}
      {selectedDivision && (
        <div className="ai-tab-content">
          <AIRecommendationPanel
            division={selectedDivision}
            weights={divisions[selectedDivision].weights}
            initialValues={divisions[selectedDivision].initialValues}
            enabledFields={divisions[selectedDivision].enabledFields}
            formula={divisions[selectedDivision].formula}
            onChange={handleChange}
            onApply={handleApply}
            onClose={onClose}
            prefixToName={prefixToName} 
          />
        </div>
      )}
    </div>
  );
};

export default AIRecommendationPanelContainer;