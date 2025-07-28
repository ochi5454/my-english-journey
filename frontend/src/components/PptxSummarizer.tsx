import React, { useState, useEffect } from 'react'; // 2025.7.23 Add（summarize pptx）
import './PptxSummarizer.css';

interface PptxSummarizerProps {
    userId: string;
}

interface SearchResult {
    filename: string;
    pdfFilename: string;
    summary: string;
    slide_index: number;
}

const PptxSummarizer: React.FC<PptxSummarizerProps> = ({ userId }) => {
    const [summary, setSummary] = useState<string | null>(null); // 全件用（裏で保持）
    const [visibleSummary, setVisibleSummary] = useState<string | null>(null); // 表示用
    const [isUploading, setIsUploading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    // 2025.7.23 Add（summarize pptx）START
    const [keywords, setKeywords] = useState<string[]>([]);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [userKeywords, setUserKeywords] = useState<string[]>([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [searchMode, setSearchMode] = useState<'smart' | 'keyword' | null>(null); // 2025.7.24 Add（summarize pptx）
    const [selectedKeywordHitCount, setSelectedKeywordHitCount] = useState<number | null>(null);// 2025.7.24 Add（summarize pptx）

     // 2025.7.24 Mod（summarize pptx）START
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const stored = localStorage.getItem(`user_keywords_${userId}`);
                if (stored) {
                    setUserKeywords(JSON.parse(stored));
                }
            } catch (err) {
                console.warn("保存済みキーワードの読み込みに失敗しました");
            }

            if (!isUploading) {
                await loadFrequentKeywords(); // アップロード中でないときのみ
                await fetchAllSummaries();    // summaryの取得
            }
        };

        fetchInitialData();
    }, [userId, isUploading]);

    const escapeRegex = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     // 2025.7.24 Mod（summarize pptx）END

    const saveUserKeywords = (uid: string, keywords: string[]) => {
    localStorage.setItem(`user_keywords_${uid}`, JSON.stringify(keywords));
    };

    const handleAddKeyword = () => {
        const trimmed = newKeyword.trim();
        if (!trimmed || userKeywords.includes(trimmed)) return;

        const updated = [...userKeywords, trimmed];
        if (updated.length > 10) updated.shift(); // 古いの削除
        setUserKeywords(updated);
        saveUserKeywords(userId, updated); // 保存
        setNewKeyword('');
    };

    const handleReloadKeywords = () => {
    try {
        const stored = localStorage.getItem(`user_keywords_${userId}`);
        if (stored) {
        setUserKeywords(JSON.parse(stored));
        }
    } catch (err) {
        console.warn("再読み込みに失敗しました", err);
    }
    };
    // 2025.7.23 Add（summarize pptx）END

    // 2025.7.24 Add（summarize pptx）START
    const fetchAllSummaries = async (): Promise<string | null> => {
        try {
            const res = await fetch("/get_all_summaries/");
            const data = await res.json();
            setSummary(data.summary); // グローバルにも保持
            return data.summary;
        } catch (err) {
            console.error("全件summary取得失敗", err);
            setError("要約の取得に失敗しました。");
            return null;
        }
    };

    // あるsummary内で、キーワードが含まれるスライド数を返す（スライド単位で重複排除）
    const countKeywordInSlides = (summaryText: string, keyword: string): number => {
        const slideRegex = /【ファイル名: (.*?)｜スライド\s*(\d+)】[\s\n]*([\s\S]*?)(?=【ファイル名: |$)/g;
        const regex = new RegExp(escapeRegex(keyword), 'i');
        const matchedSlides = new Set<string>();

        let match;
        while ((match = slideRegex.exec(summaryText)) !== null) {
            const slideIndex = parseInt(match[2], 10);
            const slideText = match[3].trim();
            const slideKey = `${match[1].trim()}::${slideIndex}`;
            if (regex.test(slideText)) {
            matchedSlides.add(slideKey);
            }
        }

        return matchedSlides.size;
    };
    // 2025.7.24 Add（summarize pptx）END

    // 2025.7.25 Mod（summarize pptx）START
    const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setError(null);
    setSummary(null);

    try {
        const res = await fetch("/upload_and_index_pptx/", {
        method: "POST",
        body: formData,
        });

        if (!res.ok) {
        console.error("❌ レスポンスNG:", res.status, res.statusText);
        setError("サーバーからの応答が不正です。");
        return;
        }

        const rawText = await res.text();
        console.log("🧾 サーバーからの生レスポンス:", rawText);

        let data: any;
        try {
        data = JSON.parse(rawText);
        } catch (e) {
        console.error("❌ JSON parse失敗:", e);
        setError("サーバーレスポンスの解析に失敗しました。");
        return;
        }

        if (data.success && Array.isArray(data.summaries)) {
        const combined = data.summaries
            .map((s: SearchResult) => `【スライド${s.slide_index}】 ${s.summary}`)
            .join("\n");
        setSummary(combined);
        setVisibleSummary(combined);
        } else {
        console.warn("⚠️ summaries 無し、または空。レスポンス:", data);
        setError("アップロードは成功しましたが、要約が取得できませんでした。");
        }
    } catch (err) {
        console.error("❗ fetch エラー:", err);

        if (err instanceof Response) {
        console.error("ステータス:", err.status);
        const text = await err.text();
        console.error("レスポンス本文:", text);
        }

        setError("アップロード中にエラーが発生しました。");
    } finally {
        // ✅ どんな場合でも最後に isUploading を false に戻す
        setIsUploading(false);
    }
    };
    // 2025.7.25 Mod（summarize pptx）END

    // 2025.7.24 Mod（summarize pptx）START
    const handleSearch = async () => {
        setIsSearching(true);
        setError(null);
        setSearchResults([]);
        setSearchMode('smart');  // ← スマート検索であることを明示
        try {
            const res = await fetch(`/search_summaries/?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error(err);
            setError("検索中にエラーが発生しました。");
        } finally {
            setIsSearching(false);
        }
    };
    // 2025.7.24 Mod（summarize pptx）END

    // 2025.7.24 Add（summarize pptx）END
    const handleKeywordSearch = async (keyword: string) => {
        console.log("🔍 handleKeywordSearch 開始: ", keyword);
        setIsSearching(true);
        setSearchResults([]);

        let actualSummary = summary;
        if (!actualSummary) {
            actualSummary = await fetchAllSummaries();
        }

        if (!actualSummary) {
            console.warn("summaryが取得できませんでした");
            setIsSearching(false);
            return;
        }

        const results: SearchResult[] = [];
        const matchedSlides = new Set<string>(); // filename + slideIndex でユニークに管理

        const slideRegex = /【ファイル名: (.*?)｜スライド\s*(\d+)】[\s\n]*([\s\S]*?)(?=【ファイル名: |$)/g;
        const regex = new RegExp(escapeRegex(keyword), 'i');

        let match;
        while ((match = slideRegex.exec(actualSummary)) !== null) {
            const filename = match[1].trim();
            const slideIndex = parseInt(match[2], 10);
            const slideSummary = match[3].trim();

            if (regex.test(slideSummary)) {
                const slideKey = `${filename}::${slideIndex}`;
                if (!matchedSlides.has(slideKey)) {
                    matchedSlides.add(slideKey);
                    const generatedPdfFilename = filename.replace(/\.pptx$/i, '.pdf'); // ← 修正ポイント
                    results.push({
                        filename,
                        pdfFilename: generatedPdfFilename,
                        slide_index: slideIndex,
                        summary: slideSummary
                    });
                }
            }
        }

        console.log(`🔍 「${keyword}」にヒットしたスライド数: ${matchedSlides.size}`);
        setSearchResults(results);
        setSelectedKeywordHitCount(matchedSlides.size);
        setIsSearching(false);
    };

    const handleDeleteKeyword = (keywordToDelete: string) => {
        const updatedKeywords = userKeywords.filter(k => k !== keywordToDelete);
        setUserKeywords(updatedKeywords);
        saveUserKeywords(userId, updatedKeywords); // localStorage保存も統一関数で
    };

    const loadFrequentKeywords = async () => {
        try {
            const res = await fetch("/get_frequent_keywords/");
            const data = await res.json();
            setKeywords(data.keywords || []);
        } catch (err) {
            console.error("キーワードの取得に失敗しました", err);
        }
    };
    // 2025.7.24 Add（summarize pptx）END

    const highlightQuery = (text: string, query: string) => {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
        regex.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
        );
    };

    return (
        // 2025.7.23 Add（summarize pptx）START
        <div className="pptx-layout">
        {/* 左カラム */}
        <div className="pptx-main">
            {/* 既存のアップロード＋検索UI*/}
            <div className="pptx-summarizer">
            <section className="pptx-upload">
                <h2>📄 PowerPoint スライドの要約</h2>
                <input type="file" accept=".pptx" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                }} />
                {isUploading && <p>🔄 要約中です...</p>}
                {error && <p className="error-message">{error}</p>}
                <div className="summary-result">
                <h3>📝 要約結果</h3>
                <p>{(visibleSummary || "まだ要約はありません。").split('\n').map((line, i) => (
                    <span key={i}>{line}<br /></span>
                ))}</p>
                </div>
            </section>

            <hr />

            <section className="pptx-search">
                <h2>🔍 スライド要約のスマート検索</h2>
                <p className="search-hint">意味ベースで検索ができます（例：売上の変化、プロジェクト概要など）</p>
                <div className="search-box">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="例：マーケティング戦略"
                />
                <button className="search-button" onClick={handleSearch}>この内容で検索する</button>
                </div>

                {isSearching && <p>🔍 検索中です...</p>}

                {/* 2025.7.28 Add（image pptx）START *PDF変換はできているものの、UIで生成後のPDFに遷移できず。残課題* */}
                {searchMode === 'smart' && searchResults.length > 0 && (
                <div className="search-results">
                    <h4>🔍 スマート検索結果</h4>
                    {searchResults.map((result, index) => (
                    <div key={index} className="result-card">
                        <strong>{result.filename}（スライド {result.slide_index}）</strong>
                        <p>{highlightQuery(result.summary, searchQuery)}</p>
                        {result.pdfFilename ? (
                        <a
                            href={`/static/pdf_files/${encodeURIComponent(result.pdfFilename)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            PDFでスライドを開く
                        </a>
                        ) : (
                        <p>PDFファイルがありません。</p>
                        )}
                    </div>
                    ))}
                </div>
                )}

                {searchMode === 'keyword' && searchResults.length > 0 && (
                <div className="search-results keyword-search">
                    <h4>🔑 「{selectedKeyword}」に関する結果（{selectedKeywordHitCount ?? 0}スライド）</h4>
                    {searchResults.map((result, index) => (
                    <div key={index} className="result-card">
                        <strong>{result.filename}（スライド {result.slide_index}）</strong>
                        <p>{highlightQuery(result.summary, selectedKeyword || '')}</p>
                        {result.pdfFilename ? (
                        <a
                            href={`/static/pdf_files/${encodeURIComponent(result.pdfFilename)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            PDFでスライドを開く
                        </a>
                        ) : (
                        <p>PDFファイルがありません。</p>
                        )}
                    </div>
                    ))}
                </div>
                )}
                {/* 2025.7.28 Add（image pptx）END */}

                {searchResults.length === 0 && !isSearching && searchMode && (
                <p>該当する要約が見つかりませんでした。</p>
                )}
            </section>
            </div>
        </div>

        {/* 右カラム */}
        <div className="pptx-sidebar">
            <div className="user-keywords-section">
            <h3>🧠 登録済キーワード（最大10個）</h3>
            <div className="add-keyword-form">
                <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="キーワードを入力"
                />
                <button onClick={handleAddKeyword}>追加</button>
                <button onClick={handleReloadKeywords}>読込</button> 
            </div>
            <ul className="keyword-list">
            {/* 2025.7.24 Mod（summarize pptx）START */}
            {userKeywords.map((keyword, i) => {
                const hitCount = !isUploading && summary ? countKeywordInSlides(summary, keyword) : 0;

                return (
                    <li key={i}>
                    <div className="keyword-item-row">
                        <button
                        className={`keyword-button ${selectedKeyword === keyword ? "selected" : ""}`}
                        onClick={() => {
                            setSearchQuery(keyword);
                            setSelectedKeyword(keyword);
                            setSearchMode('keyword');
                            handleKeywordSearch(keyword);
                        }}
                        >
                        {keyword} ({hitCount}スライド)
                        </button>
                        <button
                        className="delete-button"
                        onClick={() => handleDeleteKeyword(keyword)}
                        aria-label={`Delete ${keyword}`}
                        >
                        🗑️
                        </button>
                    </div>
                    </li>
                );
            })}
            {/* 2025.7.24 Mod（summarize pptx）END */}
            </ul>
            </div>
            <div className="ai-keyword-header">
                <h3>🔑 頻出キーワード</h3>
                <button className="refresh-button" onClick={loadFrequentKeywords}>読込</button>
            </div>
            {keywords.length === 0 && <p>キーワードはまだありません。</p>}
            <ul className="keyword-list">
            {keywords
                .map((keyword) => ({
                    keyword,
                    hitCount: !isUploading && summary ? countKeywordInSlides(summary, keyword) : 0,
                }))
                .filter(({ hitCount }) => hitCount >= 2)
                .map(({ keyword, hitCount }, i) => (
                    <li key={i}>
                        <button
                            className={`keyword-button ${selectedKeyword === keyword ? "selected" : ""}`}
                            onClick={() => {
                                setSearchQuery(keyword);
                                setSelectedKeyword(keyword);
                                setSearchMode('keyword');
                                handleKeywordSearch(keyword);
                            }}
                        >
                            {keyword} ({hitCount}スライド)
                        </button>
                    </li>
                ))}
            </ul>
        </div>
        </div>
        // 2025.7.23 Add（summarize pptx）END
    );
};

export default PptxSummarizer;