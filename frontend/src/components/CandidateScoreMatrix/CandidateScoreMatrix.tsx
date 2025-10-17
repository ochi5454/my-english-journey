import React, { useEffect, useState, useMemo } from 'react';
import './CandidateScoreMatrix.css';
import CandidateMatrixFilters from './CandidateMatrixFilters';
import CandidateMatrixTable from './CandidateMatrixTable';
import CandidateResultDetail from '../CandidateResultDetail/CandidateResultDetail';
import AIRecommendationPanel from '../AIRecommendationPanel/AIRecommendationPanel';
import type { AIWeights } from '../AIRecommendationPanel/AIRecommendationPanel';
import { calculateAIScoreFromFormula, calculateTruePercentiles } from './useAIRecommendation';
import CandidateMatrixSummary from './CandidateMatrixSummary';
import type { Result } from './types';
import appConfig from '../../config';

const CandidateScoreMatrix: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
    const [results, setResults] = useState<Result[]>([]);
    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
        gender: '',
        status: '',
        division: '',
        mustCheckAllPassed: false,
        aiScoreMinPercentile: '',
        aiScoreMaxPercentile: '',
        onlyPending: true,
    });
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    const [showAIPanel, setShowAIPanel] = useState(false);
    const [aiWeights, setAiWeights] = useState<AIWeights>({});
    const [initialWeights, setInitialWeights] = useState<AIWeights>({});
    const [enabledFields, setEnabledFields] = useState<string[]>([]);
    const [aiFormula, setAiFormula] = useState<string>('');

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const allStatuses = [
        "アップロード", "書類選考", "面談・1次", "面談・2次",
        "最終面談", "待遇検討", "内定通知", "内定受諾", "内定辞退"
    ];

  // 初回ロード（AIスコア計算込み）
    useEffect(() => {
        const fetchConfigAndResults = async () => {
            try {
            // 数式の取得
            const formulaRes = await fetch(`${appConfig.API_BASE_URL}/admin/ai-formula?key=default`);
            if (!formulaRes.ok) throw new Error("式の取得に失敗");
            const formulaData = await formulaRes.json();
            setAiFormula(formulaData.formula);
            setEnabledFields(formulaData.enabled_fields);

            const fallbackWeights = formulaData.enabled_fields.reduce((acc: Record<string, number>, field: string) => {
                acc[field] = 1.0;
                return acc;
            }, {});

            const effectiveWeights = formulaData.weights ?? fallbackWeights;

            setAiWeights(effectiveWeights);
            setInitialWeights(effectiveWeights);

            // 結果の取得
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-results`, { cache: 'no-store' });
            const data: Result[] = await res.json();

            const latestMap = new Map<string, Result>();
            data.forEach((item) => {
                const existing = latestMap.get(item.user_id);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                latestMap.set(item.user_id, item);
                }
            });

            // スコアの計算
            const withScore = Array.from(latestMap.values()).map((r) => ({
                ...r,
                ai_score: calculateAIScoreFromFormula(r, formulaData.formula, formulaData.enabled_fields, aiWeights),
            }));
            const withPercentiles = calculateTruePercentiles(withScore);
            setResults(withPercentiles);
            } catch (err) {
            console.error('AIスコア読込エラー:', err);
            }
        };

        fetchConfigAndResults();
    }, []);

    // フィルタリング処理
    const filteredResults = results.filter((r) => {
        const {
        userId, userName, gender, status, division,
        mustCheckAllPassed, aiScoreMinPercentile, aiScoreMaxPercentile, onlyPending
        } = filters;

        const idMatch = r.user_id.toLowerCase().includes(userId.toLowerCase());
        const nameMatch = (r.user_name || '').toLowerCase().includes(userName.toLowerCase());
        const genderMatch = gender === '' || r.gender === gender;
        const statusMatch = status === '' || (r.status || '').includes(status);
        const divisionMatch = division === '' || (r.recommended_div || '').includes(division);
        const mustPassed = !mustCheckAllPassed || Object.values(r.must_check || {}).every(m => m.result === true);

        const p = r.ai_score_percentile ?? 0;
        const min = Number(aiScoreMinPercentile) || 0;
        const max = Number(aiScoreMaxPercentile) || 100;
        const aiScoreMatch = p >= min && p < max;
        const hrPendingMatch = !onlyPending || !r.hr_decision;

        return idMatch && nameMatch && genderMatch && statusMatch && divisionMatch && mustPassed && aiScoreMatch && hrPendingMatch;
    });

    // 部門・必須項目抽出
    const allDivisions = Array.from(new Set(results.flatMap((r) => r.scores.map((s) => s.division))));
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
        const latestWithScore = {
            ...latest,
            ai_score: calculateAIScoreFromFormula(latest, aiFormula, enabledFields, aiWeights),
        };
        const updatedList = results.map((r) => r.user_id === latest.user_id ? latestWithScore : r);
        const withPercentiles = calculateTruePercentiles(updatedList);
        setResults(withPercentiles);
        const refreshed = withPercentiles.find(r => r.user_id === latest.user_id) || latestWithScore;
        setSelectedResult(refreshed);
        } catch (e) {
        console.error("更新後データ取得エラー:", e);
        }
    };

    return (
        <div className="matrix-container">
        {/* フィルタUI */}
        <CandidateMatrixFilters
            filters={filters}
            setFilters={setFilters}
            allStatuses={allStatuses}
            allDivisions={allDivisions}
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
            // allDivisions={allDivisions}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            handleRowClick={handleRowClick}
            setShowAIPanel={setShowAIPanel}
        />

        {/* 詳細モーダル */}
        {selectedResult && (
            <CandidateResultDetail
                result={selectedResult}
                onClose={() => setSelectedResult(null)}
                onResultUpdate={handleResultUpdate}
                interviewerId={interviewerId}
            />
        )}

        {/* AI推薦設定パネル */}
        {showAIPanel && (
            <>
            <div className="ai-panel-overlay" onClick={() => setShowAIPanel(false)} />
                <AIRecommendationPanel
                    weights={aiWeights}
                    initialValues={initialWeights}
                    enabledFields={enabledFields}
                    onChange={(key, value) => setAiWeights((prev) => ({ ...prev, [key]: value }))}
                    onRecalculate={() => {
                        const currentWeights = aiWeights;
                        const updated = results.map(r => ({
                            ...r,
                            ai_score: calculateAIScoreFromFormula(r, aiFormula, enabledFields, currentWeights),
                        }));
                        const withPercentiles = calculateTruePercentiles(updated);
                        setResults(withPercentiles);
                    }}
                    onClose={() => setShowAIPanel(false)}
                    formula={aiFormula}
                />
            </>
        )}
        </div>
    );
};

export default CandidateScoreMatrix;