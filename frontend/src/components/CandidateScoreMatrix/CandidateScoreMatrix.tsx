import React, { useEffect, useState, useMemo, useCallback } from 'react';
import './CandidateScoreMatrix.css';
import CandidateMatrixFilters from './CandidateMatrixFilters';
import CandidateMatrixTable from './CandidateMatrixTable';
import CandidateResultDetail from '../CandidateResultDetail/CandidateResultDetail';
import AIRecommendationPanelContainer from '../AIRecommendationPanel/AIRecommendationPanelContainer';
import type { AIWeights } from '../AIRecommendationPanel/AIRecommendationPanel';
import { calculateAIScoreFromFormula, calculateTruePercentilesByPreferredDiv } from './useAIRecommendation';
import CandidateMatrixSummary from './CandidateMatrixSummary';
import type { Result } from './types';
import appConfig from '../../config';
import { useHRFinalReviewData } from "../HRFinalReviewDashboard/useHRFinalReviewData";

const CandidateScoreMatrix: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
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
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    const [showAIPanel, setShowAIPanel] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [divisionConfigs, setDivisionConfigs] = useState<Record<string, {
        formula: string;
        enabledFields: string[];
        weights: AIWeights;
        initialValues: AIWeights;
    }>>({});

    const allStatuses = [
        "アップロード", "書類選考", "面談・1次", "面談・2次",
        "最終面談", "待遇検討", "内定通知", "内定受諾", "内定辞退"
    ];

    // useEffect の外に移動（useCallbackで囲む）
    const fetchConfigAndResults = useCallback(async () => {
        try {
            // ✅ ① 部門ごとのAI設定をまとめて取得
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

            // ✅ ② 候補者データを取得
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-results`, { cache: 'no-store' });
            const data: Result[] = await res.json();

            const latestMap = new Map<string, Result>();
            data.forEach((item) => {
                const existing = latestMap.get(item.user_id);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                    latestMap.set(item.user_id, item);
                }
            });

            // ✅ ③ AIスコア自動計算
            const computedResults = Array.from(latestMap.values()).map((r) => {
                const division = r.preferred_div || "common";
                const cfg = configMap[division];
                if (!cfg) return r;
                const aiScore = calculateAIScoreFromFormula(
                    r,
                    cfg.formula,
                    cfg.enabledFields,
                    cfg.weights
                );
                return { ...r, ai_score: aiScore };
            });

            // ✅ ④ パーセンタイル計算
            const withPercentiles = calculateTruePercentilesByPreferredDiv(computedResults);

            // ✅ ⑤ state に保存
            setResults(withPercentiles);

        } catch (err) {
            console.error("AIスコア読込エラー:", err);
        }
    }, []); // useCallbackでメモ化

    // 初回ロードのみ呼ぶ
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

    // フィルタリング処理
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
        const hrPendingMatch = !onlyPending || !r.hr_decision;

        return idMatch && nameMatch && genderMatch && statusMatch && preferredDivisionMatch && recommendedDivisionMatch && mustPassed && aiScoreMatch && hrPendingMatch;
    });

    // 必須項目抽出
    const allMustKeys = Object.keys(results[0]?.must_check || {});

    // AIスコア分布サマリ
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

    // 候補者クリック時
    const handleRowClick = async (candidateId: string) => {
        try {
        const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${candidateId}`);
        const data = await res.json();
        if (!data.error) setSelectedResult(data);
        } catch (e) {
        console.error("詳細取得エラー:", e);
        }
    };

    // 結果更新（詳細ビューから呼ばれる）
    const handleResultUpdate = async (updated: Result) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${updated.user_id}`, { cache: 'no-store' });
            const latest = await res.json();

            // 🧠 部門をキーに設定を取得（例: 人事 / 法務 など）
            const division = latest.preferred_div || "人事"; // fallback
            const cfg = divisionConfigs[division];

        // ⚙️ 設定が存在しない場合はスキップ
        if (!cfg) {
            console.warn(`No AI config found for division: ${division}`);
            setSelectedResult(latest);
            return;
            }

            // ✅ 部門の設定に基づいてAIスコア再計算
            const latestWithScore = {
            ...latest,
            ai_score: calculateAIScoreFromFormula(
                latest,
                cfg.formula,
                cfg.enabledFields,
                cfg.weights
            ),
            };

            // ✅ 結果一覧を更新
            const updatedList = results.map((r) =>
            r.user_id === latest.user_id ? latestWithScore : r
            );
            const withPercentiles = calculateTruePercentilesByPreferredDiv(updatedList);

            setResults(withPercentiles);

            // ✅ 選択中の候補者も更新
            const refreshed =
            withPercentiles.find((r) => r.user_id === latest.user_id) ||
            latestWithScore;
            setSelectedResult(refreshed);
        } catch (e) {
            console.error("更新後データ取得エラー:", e);
        }
    };

    const mergedPrefixToName = {
        ...prefixToName,
        ...hrPrefixToName, // ← HR管理画面の prefix も統合
    };

    return (
        <div className="matrix-container">
        {/* フィルタUI */}
        <CandidateMatrixFilters
            filters={filters}
            setFilters={setFilters}
            allStatuses={allStatuses}
            prefixToName={prefixToName}
        />

        {/* 検索結果サマリ */}
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

        {/* テーブル */}
        <CandidateMatrixTable
            filteredResults={filteredResults}
            allMustKeys={allMustKeys}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            handleRowClick={handleRowClick}
            setShowAIPanel={setShowAIPanel}
        />

        {/* 詳細モーダル */}
        {selectedResult && (
            <CandidateResultDetail
                result={selectedResult}
                onClose={() => {
                    setSelectedResult(null);
                    // ✅ Detailを閉じたときに一覧再フェッチ
                    fetchConfigAndResults();
                }}
                onResultUpdate={handleResultUpdate}
                interviewerId={interviewerId}
                prefixToName={mergedPrefixToName}
                configData={configData}
            />
        )}

        {/* AI推薦設定パネル */}
            {showAIPanel && (
                <div
                    className="ai-modal-overlay"
                    onClick={() => setShowAIPanel(false)} // 背景クリックで閉じる
                >
                    <div
                    className="ai-modal-content"
                    onClick={(e) => e.stopPropagation()} // 中身クリックでは閉じない
                    >
                    <AIRecommendationPanelContainer
                        divisions={divisionConfigs}
                        onSave={(division, updatedWeights) => {
                        const cfg = divisionConfigs[division];
                        if (!cfg) return;

                        // 部門一致する候補者だけ再計算
                        const updatedResults = results.map((r) => {
                            if (r.preferred_div === division) {
                            return {
                                ...r,
                                ai_score: calculateAIScoreFromFormula(
                                r,
                                cfg.formula,
                                cfg.enabledFields,
                                updatedWeights
                                ),
                            };
                            }
                            return r;
                        });

                        const withPercentiles = calculateTruePercentilesByPreferredDiv(updatedResults);
                        setResults(withPercentiles);

                        // 重みもstate更新
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

export default CandidateScoreMatrix;