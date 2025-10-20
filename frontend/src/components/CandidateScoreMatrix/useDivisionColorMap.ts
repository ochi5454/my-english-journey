import { useState, useEffect } from 'react';
import appConfig from '../../config';

/**
 * 部門データ（prefix → 和名 → 色）を取得するカスタムフック
 */
export function useDivisionColorMap() {
    const [divisionColorMap, setDivisionColorMap] = useState<Record<string, string>>({});
    const [prefixToName, setPrefixToName] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDivisions = async () => {
            try {
                const response = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
                const data: any[] = await response.json();

                // ✅ prefix → 和名 の辞書を先に作る
                const prefixNamePairs = Array.from(
                    new Map(
                        data
                        .filter(item => item.division_prefix !== 'common')
                        .map(item => [item.division_prefix, item.division]) // prefix が key！
                    )
                );

                const colorPalette = [
                    '#dbeafe', '#d1fae5', '#fce7f3',
                    '#fee2e2', '#ede9fe', '#cffafe', '#fef9c3'
                ];

                const colorMap: Record<string, string> = {};
                const nameMap: Record<string, string> = {};

                prefixNamePairs.forEach(([prefix, name], i) => {
                    colorMap[prefix] = colorPalette[i % colorPalette.length]; // ✅ prefix → 色
                    nameMap[prefix] = name; // ✅ prefix → 和名
                });

                setDivisionColorMap(colorMap);
                setPrefixToName(nameMap);
            } catch (err) {
                console.error('部門一覧の取得に失敗しました', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDivisions();
    }, []);

    return { divisionColorMap, prefixToName, loading }; // ✅ prefixToName を返した！
}