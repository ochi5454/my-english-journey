import React from 'react';

interface Filters {
    userId: string;
    userName: string;
    gender: string;
    status: string;
    division: string;
    mustCheckAllPassed: boolean;
    aiScoreMinPercentile: string;
    aiScoreMaxPercentile: string;
    onlyPending: boolean;
}

interface Props {
    filters: Filters;
    setFilters: React.Dispatch<React.SetStateAction<Filters>>;
    allStatuses: string[];
    allDivisions: string[];
}

const CandidateMatrixFilters: React.FC<Props> = ({
    filters,
    setFilters,
    allStatuses,
    allDivisions,
}) => {
    return (
        <div className="matrix-filters">
        <button
            className="filter-clear-icon"
            onClick={() =>
            setFilters({
                userId: '',
                userName: '',
                gender: '',
                status: '',
                division: '',
                mustCheckAllPassed: false,
                aiScoreMinPercentile: '',
                aiScoreMaxPercentile: '',
                onlyPending: false,
            })
            }
            title="フィルタをクリア"
        >
            ×
        </button>

        <input
            type="text"
            placeholder="候補者ID"
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
        />
        <input
            type="text"
            placeholder="名前"
            value={filters.userName}
            onChange={(e) => setFilters({ ...filters, userName: e.target.value })}
        />

        <select
            value={filters.gender}
            onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
        >
            <option value="">性別</option>
            <option value="男">男性</option>
            <option value="女">女性</option>
            <option value="その他">その他</option>
        </select>

        <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
            <option value="">ステータス</option>
            {allStatuses.map((status) => (
            <option key={status}>{status}</option>
            ))}
        </select>

        <select
            value={filters.division}
            onChange={(e) => setFilters({ ...filters, division: e.target.value })}
        >
            <option value="">部門</option>
            {allDivisions.map((division) => (
            <option key={division}>{division}</option>
            ))}
        </select>

        <input
            type="number"
            placeholder="AI推薦度(%)以上"
            value={filters.aiScoreMinPercentile}
            onChange={(e) =>
            setFilters({ ...filters, aiScoreMinPercentile: e.target.value })
            }
            min={0}
            max={100}
            style={{ width: '140px' }}
        />
        <input
            type="number"
            placeholder="AI推薦度(%)未満"
            value={filters.aiScoreMaxPercentile}
            onChange={(e) =>
            setFilters({ ...filters, aiScoreMaxPercentile: e.target.value })
            }
            min={0}
            max={100}
            style={{ width: '140px', marginLeft: '8px' }}
        />

        <label>
            <input
            type="checkbox"
            checked={filters.mustCheckAllPassed}
            onChange={(e) =>
                setFilters({ ...filters, mustCheckAllPassed: e.target.checked })
            }
            />
            必須全合格のみ
        </label>

        <label>
            <input
            type="checkbox"
            checked={filters.onlyPending}
            onChange={(e) =>
                setFilters({ ...filters, onlyPending: e.target.checked })
            }
            />
            選考中のみ
        </label>
        </div>
    );
};

export default CandidateMatrixFilters;