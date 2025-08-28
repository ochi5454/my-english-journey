import { useState, useImperativeHandle, forwardRef } from 'react';

interface PptxFrequentThemesProps {
    onThemeClick: (theme: string) => void;
    sourceType: 'summary' | 'pptx'; //2025.8.4 Mod（change db for themes）
}

export interface PptxFrequentThemesRef {
    fetchThemes: () => void;
}

const PptxFrequentThemes = forwardRef<PptxFrequentThemesRef, PptxFrequentThemesProps>(({ onThemeClick, sourceType }, ref) => { //2025.8.4 Mod（change db for themes）
    const [themes, setThemes] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [usedSourceType, setUsedSourceType] = useState<'summary' | 'pptx' | null>(null); //2025.8.4 Mod（change db for themes）
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null); //2025.8.4 Mod（change db for themes）

    const fetchThemes = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/get_theme?limit=5&source=${sourceType}`); //2025.8.4 Mod（change db for themes）
            const data = await res.json();
            setThemes(data.themes);
            setUsedSourceType(sourceType); //2025.8.4 Mod（change db for themes）
            setFetchedAt(new Date()); //2025.8.4 Mod（change db for themes）
        } catch (e) {
            console.error('テーマ取得エラー:', e);
        } finally {
            setIsLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        fetchThemes,
    }));

    return (
        <div className="themes-container">
            {/* 2025.8.4 Mod（change db for themes） */}
            {usedSourceType && fetchedAt && (
                <p className="db-info">
                    使用DB: {usedSourceType === 'summary' ? '🧠 要約DB' : '📊 pptxDB'}<br />
                    読込日時: {fetchedAt.toLocaleString()}
                </p>
            )}
            {/* 2025.8.4 Mod（change db for themes） */}
            {isLoading ? (
                <p>🔄 読み込み中...</p> // ← ローディング表示
            ) : (
                <ul>
                    {themes.map((theme, idx) => (
                        <li key={idx}>
                            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onThemeClick(theme);
                                }}
                            >
                                {theme}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});

export default PptxFrequentThemes;