import React, { useState, useEffect, useCallback } from 'react';

interface SearchResult {
    filename: string;
    pdfFilename: string;
    summary: string;
    slide_index: number;
}

interface Props {
    userId: string;
    triggerSearchKeyword?: string;
}

const PptxSummaryBasedSearch: React.FC<Props> = ({ userId, triggerSearchKeyword }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSearch = useCallback(async (keyword?: string) => {
        const q = keyword ?? query;
        setIsLoading(true);
        try {
            const response = await fetch(`/search_summaries/?query=${encodeURIComponent(q)}`);
            const data = await response.json();
            const updatedResults = data.map((result: SearchResult) => ({
                ...result,
                pdfFilename: result.filename.replace(/\.pptx$/i, '.pdf'),
            }));
            setResults(updatedResults);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsLoading(false);
        }
    }, [query]);

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
        <div className="summary-search">
        <h2 className="text-xl font-semibold mb-4">🔍 Summary-based Search</h2>
        <div className="search-bar">
            <input
                className="input-box"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search in summaries..."
            />
            <button className="search-button" onClick={() => handleSearch()} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Search'}
            </button>
        </div>
        <div className="search-results">
            {results.map((result, idx) => (
            <div key={idx} className="result-card" onClick={() => openPdf(result.pdfFilename, result.slide_index)}>
                <h3 className="filename">{result.filename}</h3>
                <p className="summary">{result.summary}</p>
                <p className="slide-number">Slide: {result.slide_index + 1}</p>
            </div>
            ))}
        </div>
        </div>
    );
};

export default PptxSummaryBasedSearch;