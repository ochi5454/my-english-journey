import React, { useState, useEffect, useCallback } from 'react';

interface PptxSearchResult {
    filename: string;
    slide_index: number;
    pdfFilename: string;
    explanation: string;
}

interface Props {
    userId: string;
    triggerSearchKeyword?: string;
}

const PptxBasedSearch: React.FC<Props> = ({ userId, triggerSearchKeyword }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PptxSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [comment, setComment] = useState<string | null>(null); // 2025.7.30 Mod（ai comment）

    const handleSearch = useCallback(async (keyword?: string) => {
        const q = keyword ?? query;
        setIsLoading(true);
        try {
            const response = await fetch(`/search_pptx/?query=${encodeURIComponent(q)}`);
            const data = await response.json();
            // 2025.7.30 Mod（ai comment）
            // const updatedResults = data.map((result: PptxSearchResult) => ({
            const updatedResults = data.results.map((result: PptxSearchResult) => ({  // data.map から data.results.map に変更
                ...result,
                pdfFilename: result.filename.replace(/\.pptx$/i, '.pdf'),
            }));
            setResults(updatedResults);
            setComment(data.comment);  // 2025.7.30 Mod（ai comment）
        } catch (error) {
            console.error('Search PPTX failed:', error);
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // [query]→[] に訂正（頻出テーマからの遷移時2回検索されることを防ぐため）

    useEffect(() => {
        if (triggerSearchKeyword) {
            setQuery(triggerSearchKeyword);
            handleSearch(triggerSearchKeyword);
        }
    }, [triggerSearchKeyword, handleSearch]);

    const openPdf = (pdfFilename: string, pageIndex: number) => {
        window.open(`http://localhost:8000/static/pdf_files/${pdfFilename}#page=${pageIndex + 1}`, '_blank');
    };

    return (
        <div className="pptx-search">
        <h2 className="text-xl font-semibold mb-4">📊 PPTX-based Search</h2>
        <div className="search-bar">
            <input
                className="input-box"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search in PPTX slides..."
            />
            <button className="search-button" onClick={() => handleSearch(query)} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Search'}
            </button>
        </div>
        {/* 2025.7.30 Mod（ai comment）START */}
        {comment && (
            <div className="ai-comment-box">
                <p className="ai-comment">💡 AI’s comment: {comment}</p>
            </div>
        )}
        {/* 2025.7.30 Mod（ai comment）END */}
        <div className="search-results">
            {results.map((result, idx) => (
            <div key={idx} className="result-card" onClick={() => openPdf(result.pdfFilename, result.slide_index)}>
                <h3 className="filename">{result.filename}</h3>
                <p className="explanation">{result.explanation}</p>
                <p className="slide-number">Slide: {result.slide_index + 1}</p>
            </div>
            ))}
        </div>
        </div>
    );
};

export default PptxBasedSearch;