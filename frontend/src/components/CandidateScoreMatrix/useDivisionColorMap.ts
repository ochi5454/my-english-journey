import { useState, useEffect } from 'react';
import appConfig from '../../config';

/**
 * 部門データを取得して divisionColorMap を返すカスタムフック
 */
export function useDivisionColorMap() {
    const [divisionColorMap, setDivisionColorMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDivisions = async () => {
        try {
            const response = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
            const data: any[] = await response.json();

            // 'common' 以外の division_prefix を抽出
            const uniqueDivisions = Array.from(
            new Map(
                data
                .filter(item => item.division_prefix !== 'common')
                .map(item => [item.division, item.division_prefix])
            )
            );

            const colorPalette = [
            '#dbeafe', // very soft blue
            '#d1fae5', // very soft mint green
            '#fce7f3', // very soft pink
            '#fee2e2', // very soft coral
            '#ede9fe', // very soft lavender
            '#cffafe', // very soft aqua
            '#fef9c3', // very soft lemon
            ];

            const map: Record<string, string> = {};
            uniqueDivisions.forEach(([division], i) => {
            map[division] = colorPalette[i % colorPalette.length];
            });

            setDivisionColorMap(map);
        } catch (err) {
            console.error('部門一覧の取得に失敗しました', err);
        } finally {
            setLoading(false);
        }
        };

        fetchDivisions();
    }, []);

    return { divisionColorMap, loading };
}