import { useState } from 'react';
import appConfig from '../../config.ts';

export const useAiReview = (onAiReviewed?: (updatedResult: any) => void) => {
    const [isReviewing, setIsReviewing] = useState(false);
    const [aiScoreReviewed, setAiScoreReviewed] = useState(false);

    const handleAiReview = async (payload: any, onClose: () => void) => {
        try {
        setIsReviewing(true);

        await fetch(`${appConfig.API_BASE_URL}/checksheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await fetch(`${appConfig.API_BASE_URL}/interview/ai-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('再スコアに失敗しました');
        const updated = await res.json();

        setAiScoreReviewed(true);
        onAiReviewed?.(updated);
        alert('AIが面談内容を元に再スコアしました');
        onClose();
        } catch (e: unknown) {
        alert((e as Error).message || '再スコア中にエラーが発生しました');
        } finally {
        setIsReviewing(false);
        }
    };

    return { isReviewing, aiScoreReviewed, handleAiReview };
};