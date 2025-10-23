import React, { useState, useEffect } from 'react';
import { useDivisionColorMap } from './useDivisionColorMap';
import { renderGenderChip, renderStatusChip, renderHrDecisionChip, renderMustCheckChip, renderAIRecommendationChip, renderDivisionChip } from './RenderChips';
import type { Result } from './types';
import appConfig from '../../config';

export default function CandidateMatrixTable({
    filteredResults,
    allMustKeys,
    selectedIds,
    setSelectedIds,
    handleRowClick,
    setShowAIPanel
}: {
    filteredResults: Result[];
    allMustKeys: string[];
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    handleRowClick: (id: string) => void;
    setShowAIPanel: React.Dispatch<React.SetStateAction<boolean>>;
}) {

    const { divisionColorMap, prefixToName, loading } = useDivisionColorMap();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editedName, setEditedName] = useState<string>('');
    const [localResults, setLocalResults] = useState<Result[]>(filteredResults);
    const [sortAsc, setSortAsc] = useState(true);

    useEffect(() => {
        setLocalResults(filteredResults);
    }, [filteredResults]);

    if (loading) return <p>読み込み中...</p>;

    // ✅ PUTで名前更新
    const handleSaveName = async (userId: string) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/candidates/${userId}/name`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: editedName }),
            });

            if (!res.ok) {
            throw new Error(`Failed to update name: ${res.status}`);
            }

            const data = await res.json();

            // ✅ ローカル表示更新
            setLocalResults(prev =>
            prev.map(r => (r.user_id === userId ? { ...r, user_name: data.name } : r))
            );
        } catch (error) {
            console.error('名前更新エラー:', error);
            alert('名前の更新に失敗しました。');
        } finally {
            setEditingId(null);
        }
    };

    return (
        <div className="resume-matrix-wrapper">
        <table className="resume-matrix-table">
            <thead>
            <tr>
                <th rowSpan={2}>
                <input
                    type="checkbox"
                    checked={filteredResults.length > 0 && filteredResults.every(r => selectedIds.has(r.user_id))}
                    onChange={(e) => {
                    setSelectedIds(e.target.checked
                        ? new Set(filteredResults.map(r => r.user_id))
                        : new Set());
                    }}
                />
                </th>
                <th
                    rowSpan={2}
                    onClick={() => setSortAsc(!sortAsc)}
                    style={{ cursor: 'pointer' }}
                >
                    候補者ID {sortAsc ? '↑' : '↓'}
                </th>
                <th rowSpan={2}>
                    名前
                    <br />
                    <span style={{ fontSize: '0.8em', color: '#888' }}>
                        **ダブルクリックで修正
                    </span>
                </th>
                <th rowSpan={2}>性別</th>
                <th rowSpan={2}>ステータス</th>
                <th rowSpan={2}>合否</th>
                <th colSpan={3}>希望</th>
                <th colSpan={3}>推薦</th>
                <th colSpan={allMustKeys.length}>必須</th>
                <th rowSpan={2}>就業年数</th>
                <th rowSpan={2}>志望動機</th>
                <th rowSpan={2}>職務経歴</th>
                <th rowSpan={2}>評価日</th>
            </tr>

            <tr>
                <th>部門</th>
                <th>スコア</th>
                <th onClick={() => setShowAIPanel(true)} style={{ cursor: 'pointer' }}>
                推薦度% 🔽
                </th>
                <th>部門</th>
                <th>スコア</th>
                <th>推薦度%</th> 
                {allMustKeys.map(k => <th key={`must-${k}`}>{k}</th>)}
            </tr>
            </thead>

            <tbody>
            {localResults
                .slice()
                .sort((a, b) =>
                sortAsc
                    ? a.user_id.localeCompare(b.user_id)
                    : b.user_id.localeCompare(a.user_id)
                )
                .map((r, idx) => (
                <tr key={idx} onClick={() => handleRowClick(r.user_id)}>
                <td onClick={(e) => e.stopPropagation()}>
                    <input
                    type="checkbox"
                    checked={selectedIds.has(r.user_id)}
                    onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds(prev => {
                        const s = new Set(prev);
                        e.target.checked ? s.add(r.user_id) : s.delete(r.user_id);
                        return s;
                        });
                    }}
                    />
                </td>

                {/* ID */}
                <td>{r.user_id}</td>

                {/* ✅ 名前欄（編集対応） */}
                <td onClick={(e) => e.stopPropagation()}>
                    {editingId === r.user_id ? (
                    <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={() => handleSaveName(r.user_id)}
                        onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName(r.user_id);
                        if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        style={{ width: '100%' }}
                    />
                    ) : (
                    <span
                        onDoubleClick={() => {
                        setEditingId(r.user_id);
                        setEditedName(r.user_name || '');
                        }}
                        style={{ cursor: 'text' }}
                    >
                        {r.user_name || '-'}
                    </span>
                    )}
                </td>

                <td>{renderGenderChip(r.gender)}</td>
                <td>{renderStatusChip(r.status)}</td>
                <td>{renderHrDecisionChip(r.hr_decision)}</td>
                <td>{renderDivisionChip(r.preferred_div, prefixToName, divisionColorMap)}</td>
                <td>{r.preferred_div_score ?? '-'}</td>
                <td>
                    <div className="ai-score-combined">
                    {renderAIRecommendationChip(r.ai_score_percentile)}
                    {r.ai_score && (
                        <span className="ai-score-inline">
                        （{r.ai_score.toFixed(2)}）
                        </span>
                    )}
                    </div>
                </td>
                <td>{renderDivisionChip(r.recommended_div, prefixToName, divisionColorMap)}</td>
                <td>{r.recommended_div_score ?? '-'}</td>
                <td>
                    <div className="ai-score-combined">
                        {renderAIRecommendationChip(r.ai_score_recommended_percentile)}
                        {r.ai_score_recommended && (
                        <span className="ai-score-inline">
                            （{r.ai_score_recommended.toFixed(2)}）
                        </span>
                        )}
                    </div>
                </td>
                {allMustKeys.map(k =>
                    <td key={k}>{renderMustCheckChip(r.must_check[k]?.result, r.must_check[k]?.reason)}</td>
                )}

                <td>{r.experience?.toFixed(1) ?? '-'}</td>
                <td>{r.score_notes || '-'}</td>
                <td>{r.score_work || '-'}</td>
                <td>{r.timestamp?.slice(0, 19).replace('T', ' ')}</td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    );
}