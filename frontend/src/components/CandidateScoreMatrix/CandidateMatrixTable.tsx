import React from 'react';
import { useDivisionColorMap } from './useDivisionColorMap';
import { renderGenderChip, renderStatusChip, renderHrDecisionChip, renderMustCheckChip, renderAIRecommendationChip, renderDivisionChip } from './RenderChips';
import type { Result } from './types';

export default function CandidateMatrixTable({
        filteredResults, allMustKeys, 
        selectedIds, setSelectedIds, handleRowClick, setShowAIPanel
    }: {
        filteredResults: Result[];
        allMustKeys: string[];
        selectedIds: Set<string>;
        setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
        handleRowClick: (id: string) => void;
        setShowAIPanel: React.Dispatch<React.SetStateAction<boolean>>;
    }) {

    const { divisionColorMap, prefixToName, loading } = useDivisionColorMap(); 

    if (loading) return <p>読み込み中...</p>;

    return (
        <div className="resume-matrix-wrapper">
            <table className="resume-matrix-table">
                <thead>
                    <tr>
                        <th rowSpan={2}>
                            <input type="checkbox"
                                checked={filteredResults.length > 0 && filteredResults.every(r => selectedIds.has(r.user_id))}
                                onChange={(e) => {
                                setSelectedIds(e.target.checked
                                    ? new Set(filteredResults.map(r => r.user_id))
                                    : new Set());
                                }} />
                        </th>

                        {/* 基本情報 */}
                        <th rowSpan={2}>候補者ID</th>
                        <th rowSpan={2}>名前</th>
                        <th rowSpan={2}>性別</th>
                        <th rowSpan={2}>ステータス</th>
                        <th rowSpan={2}>合否</th>

                        {/* 希望部門 */}
                        <th colSpan={3}>希望</th>
                        {/* 推薦部門 */}
                        <th colSpan={2}>推薦</th>

                        {/* 共通must */}
                        <th colSpan={allMustKeys.length}>必須</th>

                        <th rowSpan={2}>就業年数</th>
                        <th rowSpan={2}>志望動機</th>
                        <th rowSpan={2}>職務経歴</th>
                        <th rowSpan={2}>評価日</th>
                    </tr>

                    <tr>
                        {/* 希望部門 */}
                        <th>部門</th>
                        <th>スコア</th>
                        <th onClick={() => setShowAIPanel(true)} style={{ cursor: 'pointer' }}>
                            推薦度% 🔽
                        </th>

                        {/* 推薦部門 */}
                        <th>部門</th>
                        <th>スコア</th>

                        {/* 共通must */}
                        {allMustKeys.map(k => <th key={`must-${k}`}>{k}</th>)}
                    </tr>
                </thead>

                <tbody>
                    {filteredResults.map((r, idx) => (
                        <tr key={idx} onClick={() => handleRowClick(r.user_id)}>
                            <td onClick={(e) => e.stopPropagation()}>
                                <input
                                type="checkbox"
                                checked={selectedIds.has(r.user_id)}
                                onChange={(e) => {
                                    setSelectedIds(prev => {
                                    const s = new Set(prev);
                                    e.target.checked ? s.add(r.user_id) : s.delete(r.user_id);
                                    return s;
                                    });
                                }} />
                            </td>

                            {/* 基本情報 */}
                            <td>{r.user_id}</td>
                            <td>{r.user_name || '-'}</td>
                            <td>{renderGenderChip(r.gender)}</td>
                            <td>{renderStatusChip(r.status)}</td>
                            <td>{renderHrDecisionChip(r.hr_decision)}</td>

                            {/* 希望部門 */}
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

                            {/* 推薦部門 */}
                            <td>{renderDivisionChip(r.recommended_div, prefixToName, divisionColorMap)}</td>
                            <td>{r.recommended_div_score ?? '-'}</td>

                            {/* 共通must */}
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