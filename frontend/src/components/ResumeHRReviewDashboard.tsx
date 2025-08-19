import React, { useEffect, useState } from 'react';

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

const ResumeHRReviewDashboard: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
    const [aiRawResults, setAiRawResults] = useState<AIRawResult[]>([]);
    const [interviewEvals, setInterviewEvals] = useState<InterviewEval[]>([]);
    const [qualItems, setQualItems] = useState<ConfigResponse['qualitativeItems']>([]);
    const [quantItems, setQuantItems] = useState<ConfigResponse['quantitativeItems']>([]);
    const initialFilter = new URLSearchParams(window.location.search).get('filter') || '';
    const [filterText, setFilterText] = useState(initialFilter);
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
        fetch('/resume-results')
            .then(res => res.json())
            .then((data: AIRawResult[]) => {
            const latestMap = new Map<string, AIRawResult>();
            const hrMap: typeof hrEvaluations = {};

            data.forEach(item => {
                const existing = latestMap.get(item.user_id);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                latestMap.set(item.user_id, item);
                }

                // ✅ HR評価があればメモ用に保存
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
            setHrEvaluations(hrMap); // ✅ ロード直後にセット
            })
        .catch(err => console.error('AIスコアの取得に失敗:', err));

        fetch('/checksheet/all')
        .then(res => res.json())
        .then((data: any[]) => {
            const flattened: InterviewEval[] = [];
            data.forEach(entry => {
            const stages = entry.stages || {};
            Object.entries(stages).forEach(([stage, d]) => {
                const stageData = d as any;
                flattened.push({
                candidate_id: entry.candidate_id,
                interviewer_id: entry.interviewer_id,
                stage,
                prepItems: stageData.prepItems,
                qualitative: stageData.qualitative,
                quantitative: stageData.quantitative,
                reviewed_resume: stageData.reviewedResume,
                ai_score_reviewed: stageData.ai_score_reviewed,
                timestamp: stageData.updated_at,
                });
            });
            });
            setInterviewEvals(flattened);
        })
        .catch(err => console.error('面接官評価の取得に失敗:', err));

        fetch('/checksheet/config')
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
                    : { value: value.value, label: value.label }  // 念のため fallback
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
    const filteredCandidateIds = allCandidateIds.filter(id => id.toLowerCase().includes(filterText.toLowerCase()));

        const handleSaveHRReview = async (candidateId: string) => {
        const payload = {
            candidate_id: candidateId,
            decision: hrEvaluations[candidateId]?.decision,
            division: hrEvaluations[candidateId]?.division,
            title: hrEvaluations[candidateId]?.title,
            annual_income: hrEvaluations[candidateId]?.annualIncome,
        };

        try {
            const res = await fetch('/resume-result/hr-review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': interviewerId, // ヘッダで reviewer を通知
            },
            body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('保存に失敗しました');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const updated = await res.json();

            // 保存後にUIにメモを表示する（例: 直近の更新内容をローカルに一時保存）
            setHrEvaluations(prev => ({
            ...prev,
            [candidateId]: {
                ...prev[candidateId],
                savedAt: new Date().toISOString(), // 保存された時刻をメモ
                savedBy: interviewerId
            }
            }));

            setActiveCandidateId(null);
        } catch (err) {
            alert('HR評価の保存に失敗しました');
            console.error(err);
        }
        };

    return (
        <div className="hr-review-wrapper">
        <input
            type="text"
            placeholder="候補者IDでフィルタ"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="resume-filter"
        />
        {filteredCandidateIds.map(candidateId => {
            const ai = groupedAI[candidateId];
            const evals = (groupedInterview[candidateId] || []).slice().sort((a, b) => {
            const order = ["面談・1次", "面談・2次", "最終面談"];
            return order.indexOf(a.stage) - order.indexOf(b.stage);
            });
            return (
            <div key={candidateId} className="candidate-block">
                <div className="candidate-header">
                <h3 style={{ margin: 0 }}>候補者ID: {candidateId}</h3>
                <div className="hr-button-and-note">
                    <div className="hr-button-wrapper">
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
                    <table className="iq-table iq-table--dense">
                    <thead>
                        <tr>
                        {Object.keys(ai.must_check).map(key => <th key={key}>{key}</th>)}
                        {ai.scores.map(s => <th key={s.division}>{s.division}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                        {Object.values(ai.must_check).map((v, idx) => (
                            <td key={`must-check-${idx}`} className={v.result ? 'pass' : 'fail'}>
                            {v.result ? '✅' : '❌'}
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
                    <table className="iq-table iq-table--dense">
                    <thead>
                        <tr>
                        <th>評価項目</th>
                        {evals.map((r, i) => (
                            <th key={`interviewer-${i}`}>{r.interviewer_id}</th>
                        ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>ステージ</td>{evals.map(r => <td>{r.stage}</td>)}</tr>
                        <tr>
                        <td>採用可否</td>
                        {evals.map((r, i) => {
                            const decision = r.qualitative?.hiringDecision ?? '-';
                            const className = decision === 'strong_hire' ? 'hire-decision-cell hire-strong' : 'hire-decision-cell';
                            return <td key={`hire-${i}`} className={className}>{decision}</td>;
                        })}
                        </tr>
                        <tr><td>部門</td>{evals.map(r => <td>{r.qualitative?.recommendedDivision ?? '-'}</td>)}</tr>
                        <tr><td>タイトル</td>{evals.map(r => <td>{r.qualitative?.recommendedTitle ?? '-'}</td>)}</tr>
                        {qualItems.map(item => (
                        <tr key={`qual-${item.key}`}>
                            <td>{item.label}</td>
                            {evals.map(r => (
                            <td key={r.interviewer_id + item.key}>{r.qualitative?.[item.key] ?? '-'}</td>
                            ))}
                        </tr>
                        ))}
                        {quantItems.map(item => (
                        <tr key={`quant-${item.key}`}>
                            <td>{item.label}</td>
                            {evals.map((r, i) => {
                            const level = r.quantitative?.[item.key]?.level;
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
                                    <li key={index} className="qa-entry">
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
                <div className="modal-overlay">
                    <div className="modal">
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

                    <div className="modal-buttons">
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

export default ResumeHRReviewDashboard;