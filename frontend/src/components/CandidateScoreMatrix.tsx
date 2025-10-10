import React, { useEffect, useState, useMemo } from 'react';
import './CandidateScoreMatrix.css';
import CandidateResultDetail from './CandidateResultDetail.tsx';
import type { AIWeights } from './AIRecommendationPanel.tsx';
import AIRecommendationPanel from './AIRecommendationPanel.tsx';
import appConfig from '../config.ts';

interface Props {
    interviewerId: string;
}

interface Score {
    division: string;
    score: number;
    reason: string;
}

interface MustCheckItem {
    result: boolean;
    reason: string;
}

interface Result {
    user_id: string;
    user_name?: string;
    gender?: string;
    status?: string;
    notes?: string; 
    score_notes?: string;
    experience?: number;
    timestamp: string;
    uploader_id?: string; // 1次評価者
    updated_at?: string;  // 2次評価日時
    updated_by?: string;  // 2次評価者
    recommended_division: string;
    must_check: Record<string, MustCheckItem>;
    scores: Score[];
    ai_score?: number;
    ai_score_percentile?: number;
}

const renderGenderChip = (gender?: string) => {
    let label = 'その他';
    let className = 'gender-chip other';
    if (gender === '男') {
        label = '男性';
        className = 'gender-chip male';
    } else if (gender === '女') {
        label = '女性';
        className = 'gender-chip female';
    }
    return <span className={className}>{label}</span>;
};

const renderStatusChip = (status?: string) => {
    if (!status || status === 'アップロード') {
        return <span className="matrix-status-chip matrix-status-upload">アップロード</span>;
    }
    return <span className="matrix-status-chip matrix-status-active">{status}</span>;
};

const renderMustCheckChip = (result: boolean | undefined, reason?: string) => {
    if (result === true) {
        return <span className="mustcheck-chip mustcheck-ok" title={reason}>合格</span>;
    } else if (result === false) {
        return <span className="mustcheck-chip mustcheck-ng" title={reason}>不合格</span>;
    } else {
        return <span className="mustcheck-chip mustcheck-unknown" title="未評価">--</span>;
    }
};

const renderAIRecommendationChip = (percentile?: number) => {
    if (percentile === undefined) return <span className="ai-chip ai-unknown">-</span>;

    let className = 'ai-chip ai-low'; // デフォルトはグレー
    if (percentile >= 75) {
        className = 'ai-chip ai-high';
    } else if (percentile >= 50) {
        className = 'ai-chip ai-mid';
    }

    return <span className={className}>{percentile}%</span>;
};

const CandidateScoreMatrix: React.FC<Props> = ({ interviewerId }) => {
    const [results, setResults] = useState<Result[]>([]);
    const allStatuses = [
        "アップロード",
        "書類選考",
        "面談・1次",
        "面談・2次",
        "最終面談",
        "待遇検討",
        "内定通知",
        "内定受諾",
        "内定辞退"
    ];
    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
        gender: '',
        status: '',
        division: '',
        mustCheckAllPassed: false,
        aiScoreMinPercentile: '',
        aiScoreMaxPercentile: '',
    });
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);
    const [showAIPanel, setShowAIPanel] = useState(false);
    const [aiWeights, setAiWeights] = useState<AIWeights>({
        motivation_score: 1.0,
        experience: 0.05,
    });

    const calculateAIScore = (candidate: Result, weights: AIWeights): number => {
        const motivation = Number(candidate.score_notes) || 0;
        const experience = candidate.experience ?? 0;

        const weightedMotivation = motivation * weights.motivation_score;
        const experienceMultiplier = 1 + (experience * (weights.experience ?? 0.05));

        return weightedMotivation * experienceMultiplier;
    };

    // --- 同スコア同順位のパーセンタイル（統計的パーセンタイル） ---
    const calculateTruePercentiles = (data: Result[]): Result[] => {
        const scores = data
            .filter(r => r.ai_score !== undefined)
            .map(r => r.ai_score ?? 0);

        return data.map(r => {
            const score = r.ai_score ?? 0;
            const countBelow = scores.filter(s => s < score).length;
            const countEqual = scores.filter(s => s === score).length;
            const percentile = ((countBelow + 0.5 * countEqual) / scores.length) * 100;

            return {
                ...r,
                ai_score_percentile: Math.round(percentile),
            };
        });
    };

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/resume-results`, { cache: 'no-store' })
            .then((res) => res.json())
            .then((data: Result[]) => {
                const latestMap = new Map<string, Result>();

                data.forEach((item) => {
                    const existing = latestMap.get(item.user_id);
                    if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                        latestMap.set(item.user_id, item);
                    }
                });

                // AIスコア計算
                const withAIScore = Array.from(latestMap.values()).map((r) => ({
                    ...r,
                    ai_score: calculateAIScore(r, aiWeights),
                }));

                // パーセンタイル化
                const withPercentiles = calculateTruePercentiles(withAIScore);

                setResults(withPercentiles);
            })
            .catch((err) => console.error('読み込みエラー:', err));
    }, []);

    const filteredResults = results.filter((r) => {
        const {
            userId, userName, gender, status, division,
            mustCheckAllPassed, aiScoreMinPercentile, aiScoreMaxPercentile
        } = filters;

        const idMatch = r.user_id.toLowerCase().includes(userId.toLowerCase());
        const nameMatch = (r.user_name || '').toLowerCase().includes(userName.toLowerCase());
        const genderMatch = gender === '' || r.gender === gender;
        const statusMatch = status === '' || (r.status || '').includes(status);
        const divisionMatch = division === '' || (r.recommended_division || '').includes(division);
        const mustPassed = !mustCheckAllPassed || Object.values(r.must_check || {}).every(m => m.result === true);

        const p = r.ai_score_percentile ?? 0;
        const min = Number(aiScoreMinPercentile) || 0;
        const max = Number(aiScoreMaxPercentile) || 100;
        const aiScoreMatch = p >= min && p < max;

        return idMatch && nameMatch && genderMatch && statusMatch && divisionMatch && mustPassed && aiScoreMatch;
    });

    const aiScoreCounts = useMemo(() => {
        let low = 0, mid = 0, high = 0;
        filteredResults.forEach(r => {
            const p = r.ai_score_percentile ?? -1;
            if (p < 50) low++;
            else if (p < 75) mid++;
            else high++;
        });
        return { low, mid, high };
    }, [filteredResults]);

    const handleAIScoreFilter = (range: 'low' | 'mid' | 'high') => {
        if (range === 'low') {
            setFilters(prev => ({
                ...prev,
                aiScoreMinPercentile: '0',
                aiScoreMaxPercentile: '50',
            }));
        } else if (range === 'mid') {
            setFilters(prev => ({
                ...prev,
                aiScoreMinPercentile: '50',
                aiScoreMaxPercentile: '75',
            }));
        } else if (range === 'high') {
            setFilters(prev => ({
                ...prev,
                aiScoreMinPercentile: '75',
                aiScoreMaxPercentile: '', // 上限なし
            }));
        }
    };

    const allDivisions = Array.from(
        new Set(results.flatMap((r) => r.scores.map((s) => s.division)))
    );

    const allMustKeys = Object.keys(results[0]?.must_check || {});

    const handleRowClick = async (candidateId: string) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${candidateId}`);
            const data = await res.json();
            if (!data.error) setSelectedResult(data);
        } catch (e) {
            console.error("詳細取得エラー:", e);
        }
    };

    const handleResultUpdate = async (updated: Result) => {
        try {
            // 1. 最新の候補者データを取得
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${updated.user_id}`, {
            cache: 'no-store',
            });
            const latest = await res.json();

            // 2. AIスコアの再計算
            const latestWithScore = {
            ...latest,
            ai_score: calculateAIScore(latest, aiWeights),
            };

            // 3. percentile 再計算のために全体を更新
            const updatedList = results.map((r) =>
            r.user_id === latest.user_id ? latestWithScore : r
            );
            const withPercentiles = calculateTruePercentiles(updatedList);

            // 4. state に反映
            setResults(withPercentiles);

            // 詳細ビュー（Detail側）にも反映
            const refreshed = withPercentiles.find(r => r.user_id === latest.user_id) || latestWithScore;
            setSelectedResult(refreshed);

        } catch (e) {
            console.error("更新後データ取得エラー:", e);
        }
    };

    return (
        <div className="matrix-container">
            <div className="matrix-filters">

            {/* クリアボタン：右上に × 表示 */}
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
                    })
                    }
                    aria-label="フィルタをすべてクリア"
                    title="フィルタをクリア"
                >
                    ×
                </button>

                <input type="text" placeholder="候補者ID" value={filters.userId} onChange={(e) => setFilters({...filters, userId: e.target.value})} />
                <input type="text" placeholder="名前" value={filters.userName} onChange={(e) => setFilters({...filters, userName: e.target.value})} />
                <select value={filters.gender} onChange={(e) => setFilters({...filters, gender: e.target.value})}>
                    <option value="">性別不問</option>
                    <option value="男">男性</option>
                    <option value="女">女性</option>
                    <option value="その他">その他</option>
                </select>
                <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                    <option value="">全ステータス</option>
                    {allStatuses.map((status) => (
                        <option key={status} value={status}>
                            {status}
                        </option>
                    ))}
                </select>
                <select
                    value={filters.division}
                    onChange={(e) => setFilters({ ...filters, division: e.target.value })}
                >
                    <option value="">全部門</option>
                    {allDivisions.map((division) => (
                        <option key={division} value={division}>
                            {division}
                        </option>
                    ))}
                </select>
                <input
                    type="number"
                    placeholder="AI推薦度(%)以上"
                    value={filters.aiScoreMinPercentile}
                    onChange={(e) => setFilters({
                        ...filters,
                        aiScoreMinPercentile: e.target.value
                    })}
                    min={0}
                    max={100}
                    style={{ width: '140px' }}
                />
                <input
                    type="number"
                    placeholder="AI推薦度(%)未満"
                    value={filters.aiScoreMaxPercentile}
                    onChange={(e) => setFilters({
                        ...filters,
                        aiScoreMaxPercentile: e.target.value
                    })}
                    min={0}
                    max={100}
                    style={{ width: '140px', marginLeft: '8px' }}
                />
                <label>
                    <input type="checkbox" checked={filters.mustCheckAllPassed} onChange={(e) => setFilters({...filters, mustCheckAllPassed: e.target.checked})} />
                    必須全合格のみ
                </label>
            </div>

            <div className="matrix-summary-row">
                <div className="matrix-count-summary">
                    検索結果（全 {results.length} 件中 <span className="highlight-count">{filteredResults.length}</span> 件を表示中）
                </div>

                <div className="ai-percentile-summary">
                    <span className="summary-label">AI推薦度</span>
                    <span className="ai-chip ai-high" onClick={() => handleAIScoreFilter('high')}>高 {aiScoreCounts.high} 件</span>
                    <span className="ai-chip ai-mid" onClick={() => handleAIScoreFilter('mid')}>中 {aiScoreCounts.mid} 件</span>
                    <span className="ai-chip ai-low" onClick={() => handleAIScoreFilter('low')}>低 {aiScoreCounts.low} 件</span>
                </div>
            </div>

            <div className="resume-matrix-wrapper">
                <table className="resume-matrix-table">
                    <thead>
                        <tr>
                            <th rowSpan={2}>候補者ID</th>
                            <th rowSpan={2}>名前</th>
                            <th rowSpan={2}>性別</th>
                            <th rowSpan={2}>就業年数</th> 
                            <th rowSpan={2}>ステータス</th>
                            <th rowSpan={2} onClick={() => setShowAIPanel(true)} style={{ cursor: 'pointer' }}>
                                AI推薦度 🔽
                            </th>
                            <th rowSpan={2}>AI推薦スコア</th>
                            <th rowSpan={2}>志望動機スコア</th> 
                            <th rowSpan={2}>推薦部門</th>
                            <th colSpan={allMustKeys.length}>必須</th>
                            <th colSpan={allDivisions.length}>部門スコア</th>
                            <th rowSpan={2}>志望動機・自己PRサマリ</th>
                            <th rowSpan={2}>評価日</th>
                        </tr>
                        <tr>
                            {allMustKeys.map((k) => (
                                <th key={`must-${k}`}>{k}</th>
                            ))}
                            {allDivisions.map((d) => (
                                <th key={`score-${d}`}>{d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredResults.map((r, idx) => (
                            <tr
                                key={idx}
                                onClick={() => handleRowClick(r.user_id)}
                            >
                                <td>{r.user_id}</td>
                                <td>{r.user_name || '-'}</td>
                                <td>{renderGenderChip(r.gender)}</td>
                                <td>{typeof r.experience === 'number' ? `${r.experience.toFixed(1)} ` : '-'}</td>
                                <td>{renderStatusChip(r.status)}</td>
                                <td>{renderAIRecommendationChip(r.ai_score_percentile)}</td>
                                <td>{r.ai_score?.toFixed(2) ?? '-'}</td>
                                <td>{r.score_notes || '-'}</td>
                                <td>{r.recommended_division}</td>
                                {allMustKeys.map((k) => (
                                    <td
                                        key={`must-${k}-${idx}`}
                                    >
                                        {renderMustCheckChip(r.must_check[k]?.result, r.must_check[k]?.reason)}
                                    </td>
                                ))}
                                {allDivisions.map((d) => {
                                    const found = r.scores.find((s) => s.division === d);
                                    const isRecommended = r.recommended_division === d;

                                    return (
                                        <td
                                            key={`score-${d}-${idx}`}
                                            className={`resume-score-cell ${isRecommended ? 'highlight-recommended' : ''}`}
                                        >
                                            {found ? found.score : '-'}
                                        </td>
                                    );
                                })}
                                <td>{r.notes || '-'}</td>
                                <td>{r.timestamp ? r.timestamp.slice(0, 19).replace('T', ' ') : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedResult && (
                <CandidateResultDetail
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onResultUpdate={handleResultUpdate}
                    interviewerId={interviewerId}
                />
            )}

            {showAIPanel && (
                <>
                    <div className="ai-panel-overlay" onClick={() => setShowAIPanel(false)} />
                    <AIRecommendationPanel
                        weights={aiWeights}
                        onChange={(key, value) => setAiWeights(prev => ({ ...prev, [key]: value }))}
                        onRecalculate={() => {
                            const updated = results.map((r) => ({
                                ...r,
                                ai_score: calculateAIScore(r, aiWeights), // ← 最新の重みを渡す
                            }));
                            const withPercentiles = calculateTruePercentiles(updated);
                            setResults(withPercentiles);
                        }}
                        onClose={() => setShowAIPanel(false)}
                    />
                </>
            )}
        </div>
    );
};

export default CandidateScoreMatrix;