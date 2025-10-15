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

        const result = expr.evaluate(variables);
        return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch (e) {
        console.error("スコア式評価エラー:", e);
        return 0;
    }
};

export const calculateTruePercentiles = (data: Result[]): Result[] => {
    const scores = data.filter(r => r.ai_score !== undefined).map(r => r.ai_score ?? 0);
    return data.map(r => {
        const score = r.ai_score ?? 0;
        const countBelow = scores.filter(s => s < score).length;
        const countEqual = scores.filter(s => s === score).length;
        const percentile = ((countBelow + 0.5 * countEqual) / scores.length) * 100;
        return { ...r, ai_score_percentile: Math.round(percentile) };
    });
};