import { Parser } from 'expr-eval';
import type { Result } from './types';

export const calculateAIScoreFromFormula = (
    candidate: Result,
    formula: string,
    enabledFields: string[],
    weights?: Record<string, number>
): number => {
    try {
        const parser = new Parser();
        const expr = parser.parse(formula);

        const variables: Record<string, number> = {};
        enabledFields.forEach((key) => {
            const val = candidate[key as keyof Result];
            const numericVal = typeof val === 'number' ? val : Number(val ?? 0);
            const weight = weights?.[key] ?? 1;
            variables[key] = numericVal * weight;
        });

        // ✅ デバッグ追加部分ここから
        console.groupCollapsed(
            `[AI SCORE DEBUG] user_id=${candidate.user_id} (${candidate.user_name ?? ''})`
        );
        console.log('preferred_div:', candidate.preferred_div);
        console.log('formula:', formula);
        console.table(
            enabledFields.map((key) => ({
                key,
                raw: candidate[key as keyof Result],
                numeric: Number(candidate[key as keyof Result] ?? 0),
                weight: weights?.[key] ?? 1,
                multiplied: (Number(candidate[key as keyof Result] ?? 0)) * (weights?.[key] ?? 1),
            }))
        );
        console.groupEnd();
        // ✅ デバッグ追加ここまで

        const result = expr.evaluate(variables);
        return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch (e) {
        console.error('スコア式評価エラー:', e);
        return 0;
    }
};

// 部門ごとのパーセンタイル
export const calculateTruePercentilesByPreferredDiv = (data: Result[]): Result[] => {
    const divisionGroups: Record<string, Result[]> = {};
    data.forEach(r => {
        const div = r.preferred_div || '未設定';
        if (!divisionGroups[div]) divisionGroups[div] = [];
        divisionGroups[div].push(r);
    });

    const updated: Result[] = [];
    Object.entries(divisionGroups).forEach(([div, group]) => {
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