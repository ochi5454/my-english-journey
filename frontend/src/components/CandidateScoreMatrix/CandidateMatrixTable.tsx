import React from 'react';
import { renderGenderChip, renderStatusChip, renderHrDecisionChip, renderMustCheckChip, renderAIRecommendationChip } from './RenderChips';
import type { Result } from './types';

export default function CandidateMatrixTable({
        filteredResults, allMustKeys, allDivisions,
        selectedIds, setSelectedIds, handleRowClick, setShowAIPanel
    }: {
        filteredResults: Result[];
        allMustKeys: string[];
        allDivisions: string[];
        selectedIds: Set<string>;
        setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
        handleRowClick: (id: string) => void;
        setShowAIPanel: React.Dispatch<React.SetStateAction<boolean>>;
    }) {
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
                <th rowSpan={2}>候補者ID</th>
                <th rowSpan={2}>名前</th>
                <th rowSpan={2}>性別</th>
                <th rowSpan={2}>就業年数</th>
                <th rowSpan={2}>ステータス</th>
                <th rowSpan={2}>合否</th>
                <th rowSpan={2} onClick={() => setShowAIPanel(true)} style={{ cursor: 'pointer' }}>
                    AI推薦度 🔽
                </th>
                <th rowSpan={2}>AIスコア</th>
                <th rowSpan={2}>志望動機</th>
                <th rowSpan={2}>推薦部門</th>
                <th colSpan={allMustKeys.length}>必須</th>
                <th colSpan={allDivisions.length}>部門スコア</th>
                <th rowSpan={2}>サマリ</th>
                <th rowSpan={2}>評価日</th>
            </tr>
            <tr>
                {allMustKeys.map(k => <th key={`must-${k}`}>{k}</th>)}
                {allDivisions.map(d => <th key={`div-${d}`}>{d}</th>)}
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
                <td>{r.user_id}</td>
                <td>{r.user_name || '-'}</td>
                <td>{renderGenderChip(r.gender)}</td>
                <td>{r.experience?.toFixed(1) ?? '-'}</td>
                <td>{renderStatusChip(r.status)}</td>
                <td>{renderHrDecisionChip(r.hr_decision)}</td>
                <td>{renderAIRecommendationChip(r.ai_score_percentile)}</td>
                <td>{r.ai_score?.toFixed(2) ?? '-'}</td>
                <td>{r.score_notes || '-'}</td>
                <td>{r.recommended_division}</td>
                {allMustKeys.map(k =>
                    <td key={k}>{renderMustCheckChip(r.must_check[k]?.result, r.must_check[k]?.reason)}</td>
                )}
                {allDivisions.map(d => {
                    const s = r.scores.find(sc => sc.division === d);
                    return <td key={d}>{s?.score ?? '-'}</td>;
                })}
                <td>{r.notes || '-'}</td>
                <td>{r.timestamp?.slice(0, 19).replace('T', ' ')}</td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    );
}