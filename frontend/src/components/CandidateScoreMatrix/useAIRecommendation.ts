import { Parser } from 'expr-eval';
import type { Result } from './types';

// 🧮 共通スコア計算関数（希望・推薦どちらでも使用）
export const calculateAIScoreFromFormula = (
    candidate: Result,
    formula: string,
    enabledFields: string[],
    weights?: Record<string, number>,
    divisionType: 'preferred' | 'recommended' = 'preferred' // ← 追加: 希望 or 推薦を明示
): number => {
    try {
        const parser = new Parser();
        const expr = parser.parse(formula);

        const variables: Record<string, number> = {};

        enabledFields.forEach((key) => {
            let val: any = 0;

            // ✅ division_score の処理を「希望」「推薦」で分岐
            if (key === 'division_score') {
                const div =
                    divisionType === 'preferred'
                        ? candidate.preferred_div
                        : candidate.recommended_div;

                val = candidate.division_scores?.[div ?? 'common'] ?? 0;
            } else {
                val = candidate[key as keyof Result];
            }

            const numericVal = typeof val === 'number' ? val : Number(val ?? 0);
            const weight = weights?.[key] ?? 1;
            variables[key] = numericVal * weight;
        });

        // ✅ デバッグログ（どちらの部門か出す）
        console.groupCollapsed(
            `[AI SCORE DEBUG] ${divisionType} user_id=${candidate.user_id} (${candidate.user_name ?? ''})`
        );
        console.log("→ 使用したdivision_score:", variables["division_score"]);
        console.log('divisionType:', divisionType);
        console.log('preferred_div:', candidate.preferred_div);
        console.log('recommended_div:', candidate.recommended_div);
        console.log('division_scores:', candidate.division_scores);
        console.log('formula:', formula);
        console.table(
            enabledFields.map((key) => ({
                key,
                raw:
                    key === 'division_score'
                        ? candidate.division_scores?.[
                            divisionType === 'preferred'
                                ? candidate.preferred_div ?? 'common'
                                : candidate.recommended_div ?? 'common'
                        ]
                        : candidate[key as keyof Result],
                numeric:
                    key === 'division_score'
                        ? candidate.division_scores?.[
                            divisionType === 'preferred'
                                ? candidate.preferred_div ?? 'common'
                                : candidate.recommended_div ?? 'common'
                        ] ?? 0
                        : Number(candidate[key as keyof Result] ?? 0),
                weight: weights?.[key] ?? 1,
                multiplied:
                    (key === 'division_score'
                        ? candidate.division_scores?.[
                            divisionType === 'preferred'
                                ? candidate.preferred_div ?? 'common'
                                : candidate.recommended_div ?? 'common'
                        ] ?? 0
                        : Number(candidate[key as keyof Result] ?? 0)) *
                    (weights?.[key] ?? 1),
            }))
        );
        console.groupEnd();

        const result = expr.evaluate(variables);
        return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch (e) {
        console.error('スコア式評価エラー:', e);
        return 0;
    }
};

// 🌟 希望部門ごとのパーセンタイル
export const calculateTruePercentilesByPreferredDiv = (data: Result[]): Result[] => {
    const divisionGroups: Record<string, Result[]> = {};
    data.forEach(r => {
        const div = r.preferred_div || '未設定';
        if (!divisionGroups[div]) divisionGroups[div] = [];
        divisionGroups[div].push(r);
    });

    const updated: Result[] = [];
    Object.entries(divisionGroups).forEach(([_div, group]) => {
        const scores = group.map(r => r.ai_score ?? 0);
        group.forEach(r => {
            const score = r.ai_score ?? 0;
            const countBelow = scores.filter(s => s < score).length;
            const countEqual = scores.filter(s => s === score).length;
            const percentile = ((countBelow + 0.5 * countEqual) / scores.length) * 100;
            updated.push({ ...r, ai_score_percentile: Math.round(percentile) });
        });
    });

    return updated;
};

// 🌟 推薦部門ごとのパーセンタイル
export const calculateTruePercentilesByRecommendedDiv = (data: Result[]): Result[] => {
    const divisionGroups: Record<string, Result[]> = {};
    data.forEach(r => {
        const div = r.recommended_div || '未設定';
        if (!divisionGroups[div]) divisionGroups[div] = [];
        divisionGroups[div].push(r);
    });

    const updated: Result[] = [];
    Object.entries(divisionGroups).forEach(([_div, group]) => {
        // ✅ 修正：ai_score_recommended を使用
        const scores = group.map(r => r.ai_score_recommended ?? 0);
        group.forEach(r => {
            const score = r.ai_score_recommended ?? 0;
            const countBelow = scores.filter(s => s < score).length;
            const countEqual = scores.filter(s => s === score).length;
            const percentile = ((countBelow + 0.5 * countEqual) / scores.length) * 100;
            updated.push({ ...r, ai_score_recommended_percentile: Math.round(percentile) });
        });
    });

    return updated;
};