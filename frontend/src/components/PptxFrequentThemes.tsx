import React, { useState, useImperativeHandle, forwardRef } from 'react';

interface PptxFrequentThemesProps {
    onThemeClick: (theme: string) => void;
}

export interface PptxFrequentThemesRef {
    fetchThemes: () => void;
}

const PptxFrequentThemes = forwardRef<PptxFrequentThemesRef, PptxFrequentThemesProps>(({ onThemeClick }, ref) => {
    const [themes, setThemes] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const fetchThemes = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/get_theme?limit=5');
            const data = await res.json();
            setThemes(data.themes);
        } catch (e) {
            console.error('テーマ取得エラー:', e);
        } finally {
            setIsLoading(false); // ローディング終了
        }
    };

    useImperativeHandle(ref, () => ({
        fetchThemes,
    }));

    return (
        <div className="themes-container">
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