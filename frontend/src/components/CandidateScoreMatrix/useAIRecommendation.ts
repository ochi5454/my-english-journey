import type { Result } from './types';
import type { AIWeights } from '../AIRecommendationPanel';

export const calculateAIScore = (candidate: Result, weights: AIWeights): number => {
    const motivation = Number(candidate.score_notes) || 0;
    const experience = candidate.experience ?? 0;
    const weightedMotivation = motivation * weights.motivation_score;
    const experienceMultiplier = 1 + (experience * (weights.experience ?? 0.05));
    return weightedMotivation * experienceMultiplier;
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