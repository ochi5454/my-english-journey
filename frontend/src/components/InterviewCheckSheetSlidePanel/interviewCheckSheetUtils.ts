import type { ConfigResponse, QualitativeItem, QuantitativeItem } from "../Utils/InterviewCheckSheet.ts";
import appConfig from '../../config.ts';

export const fetchConfig = async (interviewerId: string): Promise<ConfigResponse> => {
    const res = await fetch(`${appConfig.API_BASE_URL}/checksheet/config`, {
        headers: { 'x-user-id': interviewerId }
    });
    if (!res.ok) throw new Error('設定の取得に失敗しました');
    return res.json();
};

export const defaultQual = (items: QualitativeItem[]): Record<string, string> =>
    items.reduce((acc, item) => {
        acc[item.key] = '';
        return acc;
    }, {} as Record<string, string>);

export const defaultQuant = (items: QuantitativeItem[]): Record<string, { level: number; comment: string }> =>
    items.reduce((acc, item) => {
        acc[item.key] = { level: 0, comment: '' };
        return acc;
    }, {} as Record<string, { level: number; comment: string }>);