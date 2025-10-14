import React, { useEffect, useState, useMemo } from 'react';
import './HRFinalReviewDashboard.css';
import appConfig from '../config.ts';

interface Score {
    division: string;
    score: number;
    reason: string;
}

interface MustCheckItem {
    result: boolean;
    reason: string;
}

interface AIRawResult {
    user_id: string;
    user_name?: string;
    gender?: string;
    status?: string;
    timestamp: string;
    recommended_division: string;
    must_check: Record<string, MustCheckItem>;
    scores: Score[];
}

interface InterviewEval {
    candidate_id: string;
    interviewer_id: string;
    stage: string;
    qualitative?: Record<string, string>;
    quantitative?: Record<string, { level: number; comment: string }>;
    prepItems?: { question: string; answer: string; tags?: string[] }[];
    reviewed_resume?: boolean;
    ai_score_reviewed?: boolean;
    timestamp?: string;
}

interface ConfigResponse {
    qualitativeItems: { key: string; label: string }[];
    quantitativeItems: { key: string; label: string }[];
}

interface LabeledOption {
    value: string;
    label: string;
}

const renderMustCheckChip = (result: boolean | undefined, reason?: string) => {
    if (result === true) {
        return <span className="hr-mustcheck-chip hr-mustcheck-ok" title={reason}>合格</span>;
    } else if (result === false) {
        return <span className="hr-mustcheck-chip hr-mustcheck-ng" title={reason}>不合格</span>;
    } else {
        return <span className="hr-mustcheck-chip hr-mustcheck-unknown" title="未評価">--</span>;
    }
};

const HRFinalReviewDashboard: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
    const [aiRawResults, setAiRawResults] = useState<AIRawResult[]>([]);
    const [interviewEvals, setInterviewEvals] = useState<InterviewEval[]>([]);
    const [qualItems, setQualItems] = useState<ConfigResponse['qualitativeItems']>([]);
    const [quantItems, setQuantItems] = useState<ConfigResponse['quantitativeItems']>([]);
    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
    });
    const allMustKeys = useMemo(() => {
        const first = aiRawResults.find((r) => r && r.must_check);
        return first ? Object.keys(first.must_check) : [];
    }, [aiRawResults]);
    const [titleOptions, setTitleOptions] = useState<LabeledOption[]>([]);
    const [divisionOptions, setDivisionOptions] = useState<LabeledOption[]>([]);
    const [hrEvaluations, setHrEvaluations] = useState<Record<string, {
        decision?: string;
        division?: string;
        title?: string;
        annualIncome?: string;
        savedAt?: string;
        savedBy?: string;
    }>>({});
    const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);

    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        setFilters(prev => ({
            ...prev,
            userId: query.get('filter') || '',  // ← ここで filter → userId にマッピング
        }));
    }, []);

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/resume-results`)
            .then(res => res.json())
            .then((data: AIRawResult[]) => {
            const latestMap = new Map<string, AIRawResult>();
            const hrMap: typeof hrEvaluations = {};

            data.forEach(item => {
                const existing = latestMap.get(item.user_id);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                latestMap.set(item.user_id, item);
                }

                if ((item as any).hr_review) {
                const hr = (item as any).hr_review;
                hrMap[item.user_id] = {
                    decision: hr.decision,
                    division: hr.division,
                    title: hr.title,
                    annualIncome: hr.annual_income,
                    savedAt: hr.updated_at,
                    savedBy: hr.updated_by,
                };
                }
            });

            setAiRawResults(Array.from(latestMap.values()));
            setHrEvaluations(hrMap);
            })
        .catch(err => console.error('AIスコアの取得に失敗:', err));

        fetch(`${appConfig.API_BASE_URL}/checksheet/all`)
        .then(res => res.json())
        .then((data: InterviewEval[]) => {
            console.log("チェックシートAPI結果:", data);
            setInterviewEvals(data);
        })
        .catch(err => console.error('面接官評価の取得に失敗:', err));

        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
            .then(res => res.json())
            .then((config: ConfigResponse & {
            hiringDecisions: LabeledOption[];
            titleOptions: LabeledOption[];
            divisions: LabeledOption[];
            }) => {
            setQualItems(config.qualitativeItems);
            setQuantItems(config.quantitativeItems);

            setTitleOptions(config.titleOptions.map(opt => ({
            value: opt.value,
            label: opt.label
            })));

            setDivisionOptions(
            Array.isArray(config.divisions)
                ? config.divisions.map((value) =>
                    typeof value === "string"
                    ? { value, label: value }
                    : { value: value.value, label: value.label }
                )
                : []
            );
            })
            .catch(err => console.error('定性/定量・選択肢の取得に失敗:', err));
        
    }, []);

    const groupedAI = aiRawResults.reduce<Record<string, AIRawResult>>((acc, curr) => {
        acc[curr.user_id] = curr;
        return acc;
    }, {});

    const groupedInterview = interviewEvals.reduce<Record<string, InterviewEval[]>>((acc, curr) => {
        if (!acc[curr.candidate_id]) acc[curr.candidate_id] = [];
        acc[curr.candidate_id].push(curr);
        return acc;
    }, {});

    const allCandidateIds = Array.from(new Set([...Object.keys(groupedAI), ...Object.keys(groupedInterview)]));
    const filteredCandidateIds = allCandidateIds.filter((id) => {
        const ai = groupedAI[id];
        const { userId, userName } = filters;

        // AI評価がない場合、user_nameでは判定できない
        if (!ai) return false;

        const idMatch = id.toLowerCase().includes(userId.toLowerCase());
        const nameMatch = (ai.user_name || '').toLowerCase().includes(userName.toLowerCase());

        return idMatch && nameMatch ;
    });

    const handleSaveHRReview = async (candidateId: string) => {
        const rawIncome = hrEvaluations[candidateId]?.annualIncome;
        const parsedIncome =
            rawIncome === '' || rawIncome === undefined || rawIncome === null
            ? 0
            : Number(rawIncome);

        const payload = {
            candidate_id: candidateId,
            review: {
            decision: hrEvaluations[candidateId]?.decision,
            division: hrEvaluations[candidateId]?.division,
            title: hrEvaluations[candidateId]?.title,
            annual_income: isNaN(parsedIncome) ? 0 : parsedIncome,
            },
        };

        console.log("HR送信payload:", payload);

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': interviewerId,
            },
            body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('保存に失敗しました');

            setHrEvaluations(prev => ({
            ...prev,
            [candidateId]: {
                ...prev[candidateId],
                savedAt: new Date().toISOString(),
                savedBy: interviewerId,
            },
            }));

            setActiveCandidateId(null);
        } catch (err) {
            alert('HR評価の保存に失敗しました');
            console.error(err);
        }
    };

    return (
        <div className="hr-review-wrapper">
            <div className="candidate-filters">

            {/* クリアボタン：右上に × 表示 */}
                <button
                    className="hr-filter-clear-icon"
                    onClick={() =>
                    setFilters({
                        userId: '',
                        userName: '',
                    })
                    }
                    aria-label="フィルタをすべてクリア"
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
            </div>

            <div className="candidate-summary-row">
                <div className="candidate-count-summary">
                    検索結果（全 {allCandidateIds.length} 件中 <span className="hr-highlight-count">{filteredCandidateIds.length}</span> 件を表示中）
                </div>
            </div>

            {filteredCandidateIds.map(candidateId => {
                const ai = groupedAI[candidateId];
                const evals = (groupedInterview[candidateId] || []).slice().sort((a, b) => {
                    const order = ["面談・1次", "面談・2次", "最終面談"];
                    return order.indexOf(a.stage) - order.indexOf(b.stage);
                });
                const normalizedCandidateId = candidateId.replace(/^cand_/, '');
                const resumeURL = `http://localhost:8000/resumes/by-candidate/${normalizedCandidateId}`;
                return (

                <div key={candidateId} className="candidate-block">
                    <div className="candidate-header">
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
                            👤 {ai?.user_name || '-'}（{candidateId}）

                            {ai?.gender && (
                                <span className={`hr-gender-chip ${ai.gender === '男' ? 'male' : ai.gender === '女' ? 'female' : 'other'}`}>
                                {ai.gender === '男' ? '男性' : ai.gender === '女' ? '女性' : 'その他'}
                                </span>
                            )}

                            {ai?.status && (
                                <span className="hr-status-chip">
                                {ai.status}
                                </span>
                            )}

                            {resumeURL && (
                                <a
                                href={resumeURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="resume-link"
                                >
                                📄 履歴書を表示
                                </a>
                            )}
                        </h3>
                        <div className="hr-button-and-note">
                            <div>
                            <button
                                onClick={() => setActiveCandidateId(candidateId)}
                                className={`hr-review-btn ${hrEvaluations[candidateId]?.savedAt ? 'saved' : ''}`}
                                >
                                HR評価を入力
                            </button>
                            </div>
                            {hrEvaluations[candidateId]?.savedAt && (
                            <div className="hr-review-note">
                                保存済: {new Date(hrEvaluations[candidateId].savedAt!).toLocaleString()}
                                {hrEvaluations[candidateId].decision && ` / ${hrEvaluations[candidateId].decision}`}
                                {hrEvaluations[candidateId].division && ` / ${hrEvaluations[candidateId].division}`}
                                {hrEvaluations[candidateId].title && ` / ${hrEvaluations[candidateId].title}`}
                                {hrEvaluations[candidateId].annualIncome && ` / ${hrEvaluations[candidateId].annualIncome}万円`}
                            </div>
                            )}
                        </div>
                    </div>

                    {ai && (
                    <>
                        <h4>AI評価</h4>
                        <table className="hr-result-check-table">
                        <thead>
                            <tr>
                            {Object.keys(ai.must_check).map(key => <th key={key}>{key}</th>)}
                            {ai.scores.map(s => <th key={s.division}>{s.division}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                            {allMustKeys.map((key) => (
                                <td key={`must-${candidateId}-${key}`}>
                                    {renderMustCheckChip(ai.must_check?.[key]?.result, ai.must_check?.[key]?.reason)}
                                </td>
                            ))}
                            {ai.scores.map(s => (
                                <td
                                key={s.division}
                                className={s.division === ai.recommended_division ? 'highlight' : ''}
                                >
                                {s.score}
                                </td>
                            ))}
                            </tr>
                        </tbody>
                        </table>
                    </>
                    )}

                    {evals.length > 0 && (
                        <>
                            <h4>面接官評価</h4>
                            <table className="hr-result-check-table">
                            <thead>
                                <tr>
                                <th>評価項目</th>
                                {evals.map((r, i) => (
                                    <th key={`interviewer-${i}`}>{r.interviewer_id}</th>
                                ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>ステージ</td>
                                    {evals.map(r => (
                                        <td key={`stage-${r.interviewer_id}`}>{r.stage}</td>
                                    ))}
                                </tr>
                                <tr>
                                <td>採用可否</td>
                                {evals.map((r, i) => {
                                    const decision = r.qualitative?.hiringDecision ?? '-';
                                    const className = decision === 'strong_hire' ? 'hire-decision-cell hire-strong' : 'hire-decision-cell';
                                    return <td key={`hire-${i}`} className={className}>{decision}</td>;
                                })}
                                </tr>
                                <tr>
                                    <td>部門</td>
                                    {evals.map(r => (
                                        <td key={`division-${r.interviewer_id}`}>{r.qualitative?.recommendedDivision ?? '-'}</td>
                                    ))}
                                </tr>

                                <tr>
                                    <td>タイトル</td>
                                    {evals.map(r => (
                                        <td key={`title-${r.interviewer_id}`}>{r.qualitative?.recommendedTitle ?? '-'}</td>
                                    ))}
                                </tr>
                                {qualItems.map(item => (
                                    <tr key={`qual-${item.key}`}>
                                        <td>{item.label}</td>
                                        {evals.map(r => (
                                        <td key={`${r.interviewer_id}-${item.key}`}>
                                            {r.qualitative?.[item.key] ?? '-'}
                                        </td>
                                        ))}
                                    </tr>
                                ))}
                                {quantItems.map(item => (
                                    <tr key={`quant-${item.key}`}>
                                        <td>{item.label}</td>
                                        {evals.map((r) => {
                                        // ✅ 配列をMapに変換（1人分の評価ごとに）
                                        const quantMap = Array.isArray(r.quantitative)
                                            ? r.quantitative.reduce((acc, q) => {
                                                acc[q.item_key] = q;
                                                return acc;
                                            }, {} as Record<string, { level: number; comment: string }>)
                                            : r.quantitative ?? {};

                                        // ✅ 表示値の取得
                                        const level = quantMap[item.key]?.level;
                                        const className =
                                            level === 4 || level === 5 ? 'quant-cell quant-high' : 'quant-cell';

                                        return (
                                            <td key={`${r.interviewer_id}-${item.key}`} className={className}>
                                            {level ?? '-'}
                                            </td>
                                        );
                                        })}
                                    </tr>
                                ))}
                                <tr>
                                <td>カスタムQA</td>
                                {evals.map((r) => (
                                    <td key={`qa-${r.interviewer_id}`}>
                                    {r.prepItems && r.prepItems.length > 0 ? (
                                        <ul style={{ paddingLeft: '1em', margin: 0 }}>
                                        {r.prepItems.map((qa, index) => (
                                            <li key={`qa-${r.interviewer_id}-${index}`} className="qa-entry">
                                                <div><span className="question">Q:</span> {qa.question}</div>
                                                <div><span className="answer">A:</span> {qa.answer}</div>
                                            </li>
                                        ))}
                                        </ul>
                                    ) : (
                                        '-'
                                    )}
                                    </td>
                                ))}
                                </tr>
                            </tbody>
                            </table>
                        </>
                    )}

                    {/* HR評価モーダル */}
                    {activeCandidateId === candidateId && (
                    <div className="hr-modal-overlay">
                        <div className="hr-modal">
                        <h4>HR最終評価（{candidateId}）</h4>
                            <label>
                            採用可否:
                            <select
                                value={hrEvaluations[candidateId]?.decision || ''}
                                onChange={(e) =>
                                setHrEvaluations(prev => ({
                                    ...prev,
                                    [candidateId]: {
                                    ...prev[candidateId],
                                    decision: e.target.value
                                    }
                                }))
                                }
                            >
                                <option value="">選択してください</option>
                                <option value="hire_ok">✅ 採用</option>
                                <option value="hire_ng">🙅‍♂️ 不採用</option>
                            </select>
                            </label>

                        <label>
                            部門:
                            <select
                            value={hrEvaluations[candidateId]?.division || ''}
                            onChange={(e) =>
                                setHrEvaluations(prev => ({
                                ...prev,
                                [candidateId]: {
                                    ...prev[candidateId],
                                    division: e.target.value
                                }
                                }))
                            }
                            >
                            <option value="">選択してください</option>
                            {divisionOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            </select>
                        </label>

                        <label>
                            タイトル:
                            <select
                            value={hrEvaluations[candidateId]?.title || ''}
                            onChange={(e) =>
                                setHrEvaluations(prev => ({
                                ...prev,
                                [candidateId]: {
                                    ...prev[candidateId],
                                    title: e.target.value
                                }
                                }))
                            }
                            >
                            <option value="">選択してください</option>
                            {titleOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            </select>
                        </label>

                        <label>
                        年収（万円）:
                        <input
                            type="number"
                            placeholder="例: 600"
                            value={hrEvaluations[candidateId]?.annualIncome || ''}
                            onChange={(e) =>
                            setHrEvaluations(prev => ({
                                ...prev,
                                [candidateId]: {
                                ...prev[candidateId],
                                annualIncome: e.target.value
                                }
                            }))
                            }
                        />
                        </label>

                        <div className="hr-modal-buttons">
                            <button onClick={() => handleSaveHRReview(candidateId)}>保存</button>
                            <button onClick={() => setActiveCandidateId(null)} className="cancel-button">キャンセル</button>
                        </div>
                        </div>
                    </div>
                    )}

                </div>
                );
            })}
        </div>
    );
};

export default HRFinalReviewDashboard;