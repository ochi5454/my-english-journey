import React, { useEffect, useState, useMemo, useCallback } from 'react';
import '../CandidateScoreMatrix/CandidateScoreMatrix.css';
import CandidateMatrixFilters from './CandidateMatrixFiltersV2';
import CandidateMatrixTable from './CandidateMatrixTableV2';
import AIRecommendationPanelContainer from './AIRecommendationPanelV2/AIRecommendationPanelContainer';
import type { AIWeights } from './AIRecommendationPanelV2/AIRecommendationPanel';
import { calculateAIScoreFromFormula, calculateTruePercentilesByPreferredDiv, calculateTruePercentilesByRecommendedDiv } from './useAIRecommendation';
import CandidateMatrixSummary from './CandidateMatrixSummaryV2';
import type { Result } from './types';
import appConfig from '../../config';
import { useHRFinalReviewData } from "./useHRFinalReviewData";
import { statusSteps } from './VerticalStatusBar';
import './CandidateScoreMatrixForModal.css';

interface Props {
    interviewerId: string;
    onCandidateSelect: (candidateId: string) => void;
}

/**
 * CandidateScoreMatrixForModal
 * モーダル表示専用の候補者一覧（フルスクリーン機能なし、行クリックで候補者選択）
 */
const CandidateScoreMatrixForModal: React.FC<Props> = ({ interviewerId, onCandidateSelect }) => {
    const [results, setResults] = useState<Result[]>([]);
    const [prefixToName, setPrefixToName] = useState<Record<string, string>>({});
    const { configData, prefixToName: hrPrefixToName } = useHRFinalReviewData(interviewerId);
    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
        gender: '',
        status: '',
        preferredDivision: '',
        recommendedDivision: '',
        mustCheckAllPassed: false,
        aiScoreMinPercentile: '',
        aiScoreMaxPercentile: '',
        onlyPending: true,
    });

    const [showAIPanel, setShowAIPanel] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [divisionConfigs, setDivisionConfigs] = useState<Record<string, {
        formula: string;
        enabledFields: string[];
        weights: AIWeights;
        initialValues: AIWeights;
    }>>({});

    const allStatuses = statusSteps;

    const fetchConfigAndResults = useCallback(async () => {
        try {
            // ① 部門ごとのAI設定をまとめて取得
            const formulaRes = await fetch(`${appConfig.API_BASE_URL}/admin/ai-formula/all`);
            const formulas = await formulaRes.json();

            const configMap: Record<string, any> = {};
            formulas.forEach((f: any) => {
                const fallbackWeights = f.enabled_fields.reduce((acc: Record<string, number>, field: string) => {
                    acc[field] = 1.0;
                    return acc;
                }, {});
                const mergedWeights = { ...fallbackWeights, ...(f.weights || {}) };
                const divisionName = f.division || "commmon";
                configMap[divisionName] = {
                    formula: f.formula,
                    enabledFields: f.enabled_fields,
                    weights: mergedWeights,
                    initialValues: { ...mergedWeights },
                };
            });
            setDivisionConfigs(configMap);

            // ② 候補者データを取得
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-results`, { cache: 'no-store' });
            const data: Result[] = await res.json();

            const latestMap = new Map<string, Result>();
            data.forEach((item) => {
                const existing = latestMap.get(item.user_id);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                    latestMap.set(item.user_id, item);
                }
            });

            // ③ AIスコア自動計算（希望部門＋推薦部門）
            const computedResults = Array.from(latestMap.values()).map((r) => {
                const preferredDiv = r.preferred_div || "common";
                const recommendedDiv = r.recommended_div || "common";

                const cfgPreferred = configMap[preferredDiv];
                const cfgRecommended = configMap[recommendedDiv];

                let aiScorePreferred = 0;
                let aiScoreRecommended = 0;

                if (cfgPreferred) {
                    aiScorePreferred = calculateAIScoreFromFormula(
                        r,
                        cfgPreferred.formula,
                        cfgPreferred.enabledFields,
                        cfgPreferred.weights,
                        'preferred'
                    );
                }

                if (cfgRecommended) {
                    aiScoreRecommended = calculateAIScoreFromFormula(
                        r,
                        cfgRecommended.formula,
                        cfgRecommended.enabledFields,
                        cfgRecommended.weights,
                        'recommended'
                    );
                }

                return {
                    ...r,
                    ai_score: aiScorePreferred,
                    ai_score_recommended: aiScoreRecommended,
                };
            });

            // ④ パーセンタイル計算（希望部門 + 推薦部門 両方）
            const withPreferredPercentiles = calculateTruePercentilesByPreferredDiv(computedResults);
            const withBothPercentiles = calculateTruePercentilesByRecommendedDiv(withPreferredPercentiles);

            setResults(withBothPercentiles);

        } catch (err) {
            console.error("AIスコア読込エラー:", err);
        }
    }, []);

    useEffect(() => {
        fetchConfigAndResults();
    }, [fetchConfigAndResults]);

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/skills`)
            .then(res => res.json())
            .then((data: any[]) => {
                const map: Record<string, string> = {};
                data.forEach(item => {
                    if (item.division_prefix && item.division) {
                        map[item.division_prefix] = item.division;
                    }
                });
                setPrefixToName(map);
            });
    }, []);

    const filteredResults = results.filter((r) => {
        const {
            userId, userName, gender, status, preferredDivision, recommendedDivision,
            mustCheckAllPassed, aiScoreMinPercentile, aiScoreMaxPercentile, onlyPending
        } = filters;

        const idMatch = r.user_id.toLowerCase().includes(userId.toLowerCase());
        const nameMatch = (r.user_name || '').toLowerCase().includes(userName.toLowerCase());
        const genderMatch = gender === '' || r.gender === gender;
        const statusMatch = status === '' || (r.status || '').includes(status);
        const preferredDivisionMatch = preferredDivision === '' || (r.preferred_div || '').includes(preferredDivision);
        const recommendedDivisionMatch = recommendedDivision === '' || (r.recommended_div || '').includes(recommendedDivision);
        const mustPassed = !mustCheckAllPassed || Object.values(r.must_check || {}).every(m => m.result === true);

        const p = r.ai_score_percentile ?? 0;
        const min = Number(aiScoreMinPercentile) || 0;
        const max = Number(aiScoreMaxPercentile) || 100;
        const aiScoreMatch = p >= min && p < max;
        const hrPendingMatch = onlyPending ? !r.hr_decision : true;

        return idMatch && nameMatch && genderMatch && statusMatch && preferredDivisionMatch && recommendedDivisionMatch && mustPassed && aiScoreMatch && hrPendingMatch;
    });

    const allMustKeys = Object.keys(results[0]?.must_check || {});

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

    const handleRowClick = (candidateId: string) => {
        onCandidateSelect(candidateId);
    };

    const mergedPrefixToName = {
        ...prefixToName,
        ...hrPrefixToName,
    };

    return (
        <div className="matrix-container matrix-for-modal">
            <CandidateMatrixFilters
                filters={filters}
                setFilters={setFilters}
                allStatuses={allStatuses}
                prefixToName={prefixToName}
            />

            <CandidateMatrixSummary
                interviewerId={interviewerId}
                results={results}
                filteredResults={filteredResults}
                aiScoreCounts={aiScoreCounts}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                setResults={setResults}
                setFilters={setFilters}
                filters={filters}
            />

            <CandidateMatrixTable
                filteredResults={filteredResults}
                allMustKeys={allMustKeys}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                handleRowClick={handleRowClick}
                setShowAIPanel={setShowAIPanel}
            />

            {showAIPanel && (
                <div
                    className="ai-modal-overlay"
                    onClick={() => setShowAIPanel(false)}
                >
                    <div
                        className="ai-modal-content"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AIRecommendationPanelContainer
                            divisions={divisionConfigs}
                            onSave={(division, updatedWeights) => {
                                const cfg = divisionConfigs[division];
                                if (!cfg) return;

                                const updatedResults = results.map((r) => {
                                    let updated = { ...r };

                                    if (r.preferred_div === division) {
                                        updated.ai_score = calculateAIScoreFromFormula(
                                            r,
                                            cfg.formula,
                                            cfg.enabledFields,
                                            updatedWeights,
                                            'preferred'
                                        );
                                    }

                                    if (r.recommended_div === division) {
                                        updated.ai_score_recommended = calculateAIScoreFromFormula(
                                            r,
                                            cfg.formula,
                                            cfg.enabledFields,
                                            updatedWeights,
                                            'recommended'
                                        );
                                    }

                                    return updated;
                                });

                                const withPreferredPercentiles = calculateTruePercentilesByPreferredDiv(updatedResults);
                                const withBothPercentiles = calculateTruePercentilesByRecommendedDiv(withPreferredPercentiles);
                                setResults(withBothPercentiles);

                                setDivisionConfigs({
                                    ...divisionConfigs,
                                    [division]: {
                                        ...cfg,
                                        weights: updatedWeights,
                                    },
                                });
                            }}
                            onClose={() => setShowAIPanel(false)}
                            prefixToName={prefixToName}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CandidateScoreMatrixForModal;
