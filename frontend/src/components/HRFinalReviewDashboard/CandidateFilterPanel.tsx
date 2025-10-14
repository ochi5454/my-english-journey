import React from 'react';
import './HRFinalReviewDashboard.css';

interface CandidateFilterPanelProps {
    filters: { userId: string; userName: string };
    onChange: (filters: { userId: string; userName: string }) => void;
    onClear: () => void;
    totalCount: number;
    filteredCount: number;
}

const CandidateFilterPanel: React.FC<CandidateFilterPanelProps> = ({
    filters,
    onChange,
    onClear,
    totalCount,
    filteredCount,
}) => {
    return (
        <div className="candidate-filters-wrapper">
        <div className="candidate-filters">
            {/* クリアボタン（右上 ×） */}
            <button
            className="hr-filter-clear-icon"
            onClick={onClear}
            aria-label="フィルタをすべてクリア"
            title="フィルタをクリア"
            >
            ×
            </button>

            <input
            type="text"
            placeholder="候補者ID"
            value={filters.userId}
            onChange={(e) =>
                onChange({ ...filters, userId: e.target.value })
            }
            />
            <input
            type="text"
            placeholder="名前"
            value={filters.userName}
            onChange={(e) =>
                onChange({ ...filters, userName: e.target.value })
            }
            />
        </div>

        <div className="candidate-summary-row">
            <div className="candidate-count-summary">
            検索結果（全 {totalCount} 件中{' '}
            <span className="hr-highlight-count">{filteredCount}</span> 件を表示中）
            </div>
        </div>
        </div>
    );
};

export default CandidateFilterPanel;