import React from 'react';
import appConfig from '../../config';
import type { Result } from './types';

interface Props {
    interviewerId: string;
    results: Result[];
    filteredResults: Result[];
    aiScoreCounts: { low: number; mid: number; high: number };
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setResults: React.Dispatch<React.SetStateAction<Result[]>>;
    setFilters: React.Dispatch<React.SetStateAction<any>>;
    filters: any;
}

/**
 * CandidateMatrixSummary
 * - AI推薦度の分布（高・中・低）
 * - 一括不採用 / ステータス進行ボタン
 */
const CandidateMatrixSummary: React.FC<Props> = ({
    interviewerId,
    results,
    filteredResults,
    aiScoreCounts,
    selectedIds,
    setSelectedIds,
    setResults,
    setFilters,
    filters,
}) => {

    const handleAIScoreFilter = (range: 'low' | 'mid' | 'high') => {
        if (range === 'low') {
        setFilters({ ...filters, aiScoreMinPercentile: '0', aiScoreMaxPercentile: '50' });
        } else if (range === 'mid') {
        setFilters({ ...filters, aiScoreMinPercentile: '50', aiScoreMaxPercentile: '75' });
        } else if (range === 'high') {
        setFilters({ ...filters, aiScoreMinPercentile: '75', aiScoreMaxPercentile: '' });
        }
    };

    const handleBulkReject = async () => {
        if (selectedIds.size === 0) return alert('対象者を選択してください。');
        if (!window.confirm(`${selectedIds.size}名を不採用にしますか？`)) return;

        try {
        for (const id of selectedIds) {
            const candidate = results.find(r => r.user_id === id);
            await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': interviewerId,
            },
            body: JSON.stringify({
                candidate_id: id,
                review: {
                decision: 'hire_ng',
                division: candidate?.hr_division || '',
                title: candidate?.hr_title || '',
                annual_income: candidate?.hr_income || 0,
                },
            }),
            });
        }

        alert('不採用処理が完了しました。');
        setResults(prev =>
            prev.map(r => selectedIds.has(r.user_id)
            ? { ...r, hr_decision: 'hire_ng' }
            : r
            )
        );
        setSelectedIds(new Set());
        } catch (err) {
        console.error('不採用一括処理エラー:', err);
        alert('一部または全件でエラーが発生しました。');
        }
    };

    const handleBulkAdvanceStatus = async () => {
        if (selectedIds.size === 0) return alert('対象者を選択してください。');
        if (!window.confirm(`${selectedIds.size}名のステータスを1段階進めますか？`)) return;

        try {
        const res = await fetch(`${appConfig.API_BASE_URL}/hr/candidates/advance-status`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'x-user-id': interviewerId,
            },
            body: JSON.stringify({
            user_ids: Array.from(selectedIds),
            advanced_by: interviewerId,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || '更新エラー');

        alert(`${data.count} 名のステータスを更新しました。`);
        setResults(prev =>
            prev.map(r => {
            const updated = data.updated.find((u: any) => u.user_id === r.user_id);
            if (updated) return { ...r, status: updated.new_stage };
            return r;
            })
        );
        setSelectedIds(new Set());
        } catch (err) {
        console.error('一括ステータス進行エラー:', err);
        alert('一部または全件でステータス更新に失敗しました。');
        }
    };

    return (
        <div className="matrix-summary-row">
        <div className="matrix-count-summary">
            検索結果（全 {results.length} 件中{' '}
            <span className="highlight-count">{filteredResults.length}</span> 件を表示中）
        </div>

        <div className="ai-percentile-summary">
            <span className="summary-label">AI推薦度</span>
            <span className="ai-chip ai-high" onClick={() => handleAIScoreFilter('high')}>
            高 {aiScoreCounts.high} 件
            </span>
            <span className="ai-chip ai-mid" onClick={() => handleAIScoreFilter('mid')}>
            中 {aiScoreCounts.mid} 件
            </span>
            <span className="ai-chip ai-low" onClick={() => handleAIScoreFilter('low')}>
            低 {aiScoreCounts.low} 件
            </span>

            {/* ✅ 一括ボタンを右端に横並び配置 */}
            <div className="bulk-actions-inline">
            <button
                className="matrix-action-btn subtle negative"
                disabled={selectedIds.size === 0}
                onClick={handleBulkReject}
            >
                一括不採用
            </button>

            <button
                className="matrix-action-btn subtle primary"
                disabled={selectedIds.size === 0}
                onClick={handleBulkAdvanceStatus}
            >
                一括ステータス前進
            </button>
            </div>
        </div>
        </div>
    );
};

export default CandidateMatrixSummary;