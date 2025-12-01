import React, { useEffect, useState, useMemo } from 'react';
import './HRFinalReviewDashboard.css';
import appConfig from '../../config.ts';
import type { AIRawResult, InterviewEval } from './hrReviewTypes';
import { useHRFinalReviewData } from './useHRFinalReviewData';
import CandidateReviewBlock from './CandidateReviewBlock';
import CandidateFilterPanel from './CandidateFilterPanel';
import type { StatusMasterRow } from '../CandidateResultDetail/StatusBar';

const HRFinalReviewDashboard: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
    const {
        aiRawResults,
        interviewEvals,
        configData,
        hrEvaluations,
        setHrEvaluations
    } = useHRFinalReviewData(interviewerId);

    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
    });
    const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
    const [interviewStageOrder, setInterviewStageOrder] = useState<Record<string, number>>({});

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
            .then(res => res.json())
            .then((rows: StatusMasterRow[]) => {
                const map: Record<string, number> = {};

                rows
                    .filter((r) => r.is_interview)
                    .forEach((r) => {
                        map[r.key] = r.order ?? 999;
                    });

                setInterviewStageOrder(map);
            })
            .catch(err => console.error("StatusMaster取得エラー:", err));
    }, []);

    // detail画面からの遷移
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        setFilters(prev => ({
        ...prev,
        userId: query.get('filter') || '',
        }));
    }, []);

    const allMustKeys = useMemo(() => {
        const first = aiRawResults.find((r) => r && r.must_check);
        return first ? Object.keys(first.must_check) : [];
    }, [aiRawResults]);

    const qualItems = configData.qualitativeItems;
    const quantItems = configData.quantitativeItems;
    const titleOptions = configData.titleOptions;
    const hiringDecisions = configData.hiringDecisions; 
    const { prefixToName } = useHRFinalReviewData(interviewerId);

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
                pay_type: hrEvaluations[candidateId]?.payType || null,
                employment_type: hrEvaluations[candidateId]?.employmentType || null,
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
            {/* フィルター */}
            <CandidateFilterPanel
                filters={filters}
                onChange={(newFilters) => setFilters(newFilters)}
                onClear={() => setFilters({ userId: '', userName: '' })}
                totalCount={allCandidateIds.length}
                filteredCount={filteredCandidateIds.length}
            />

            {/* 候補者単位のブロック */}
            {filteredCandidateIds.map((candidateId) => {
                const ai = groupedAI[candidateId];
                const evals = (groupedInterview[candidateId] || [])
                    .slice()
                    .sort((a, b) => {
                        const orderA = interviewStageOrder[a.stage] ?? 999;
                        const orderB = interviewStageOrder[b.stage] ?? 999;
                        return orderA - orderB;
                    });

                return (
                    <CandidateReviewBlock
                    key={candidateId}
                    candidateId={candidateId}
                    ai={ai}
                    evals={evals}
                    allMustKeys={allMustKeys}
                    qualItems={qualItems}
                    quantItems={quantItems}
                    titleOptions={titleOptions}
                    hiringDecisions={hiringDecisions}
                    hrEvaluation={hrEvaluations[candidateId] || {}}
                    interviewerId={interviewerId}
                    activeCandidateId={activeCandidateId}
                    onOpenModal={(id) => setActiveCandidateId(id)}
                    onCloseModal={() => setActiveCandidateId(null)}
                    onChangeHR={(updated) =>
                        setHrEvaluations((prev) => ({
                        ...prev,
                        [candidateId]: { ...prev[candidateId], ...updated },
                        }))
                    }
                    onSaveHR={handleSaveHRReview}
                    prefixToName={prefixToName}
                    payTypeItems={configData.employmentTypes
                        ?.map(et => ({ value: et.pay_type, label: et.pay_type_label }))
                        ?.filter((v, i, self) => self.findIndex(x => x.value === v.value) === i) || []}
                    employmentTypes={configData.employmentTypes || []}
                    />
                );
            })}
        </div>
    );
};

export default HRFinalReviewDashboard;