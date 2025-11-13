import React, { useState, useEffect } from 'react';
import appConfig from '../../config';

interface DivisionSelectProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
}

/**
 * 共通の希望部門選択コンポーネント
 * /admin/skills APIから部門一覧を取得して表示
 */
const DivisionSelect: React.FC<DivisionSelectProps> = ({
    value,
    onChange,
    disabled = false,
    className = '',
    placeholder = '希望部門を選択'
}) => {
    const [divisions, setDivisions] = useState<Array<{ division: string; division_prefix: string }>>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/skills`)
            .then(res => res.json())
            .then((data: any[]) => {
                // 重複する部門名を除外（division_prefixごとに1つだけ）
                // 「共通」は除外
                const uniqueDivisions = data.reduce((acc: Array<{ division: string; division_prefix: string }>, item) => {
                    // 同じdivision_prefixが既に存在するかチェック
                    const exists = acc.find(d => d.division_prefix === item.division_prefix);
                    // 「共通」は選択肢から除外
                    const isCommon = item.division === '共通' || item.division_prefix === '共通';
                    if (!exists && item.division && item.division_prefix && !isCommon) {
                        acc.push({
                            division: item.division,
                            division_prefix: item.division_prefix
                        });
                    }
                    return acc;
                }, []);

                setDivisions(uniqueDivisions);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('部門情報取得エラー:', err);
                setIsLoading(false);
            });
    }, []);

    return (
        <select
            className={className}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || isLoading}
        >
            <option value="">{isLoading ? '読み込み中...' : placeholder}</option>
            {divisions.map((div) => (
                <option key={div.division_prefix} value={div.division_prefix}>
                    {div.division}
                </option>
            ))}
        </select>
    );
};

export default DivisionSelect;
