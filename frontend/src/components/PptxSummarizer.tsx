import React, { useState, useEffect } from 'react';
import PptxSummaryBasedSearch from './PptxSummaryBasedSearch';
import PptxBasedSearch from './PptxBasedSearch';
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

interface FrequentKeywordsProps {
    onKeywordClick: (keyword: string) => void;
}

const FrequentKeywords: React.FC<FrequentKeywordsProps> = ({ onKeywordClick }) => {
    const [keywords, setKeywords] = useState<string[]>([]);

    useEffect(() => {
        const fetchKeywords = async () => {
            try {
                const res = await fetch('/get_frequent_keywords?limit=10');
                const data = await res.json();
                setKeywords(data.keywords);
            } catch (e) {
                console.error('キーワード取得エラー:', e);
            }
        };
        fetchKeywords();
    }, []);

    return (
        <div className="keywords-container">
            <h3>頻出キーワード</h3>
            <ul>
                {keywords.map((kw, idx) => (
                    <li key={idx}>
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onKeywordClick(kw);
                            }}
                        >
                            {kw}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const PptxSummarizer: React.FC<PptxSummarizerProps> = ({ userId }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'summarySearch' | 'pptxSearch'>('summarySearch');
    const [indexStatus, setIndexStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
    const [externalSearchKeyword, setExternalSearchKeyword] = useState<string | undefined>(undefined);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleKeywordClick = (keyword: string) => {
        setExternalSearchKeyword(keyword); // 検索トリガーとして子に渡す
        setTimeout(() => setExternalSearchKeyword(undefined), 100);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('userId', userId);

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

    const getIndexButtonLabel = () => {
        switch (indexStatus) {
            case 'updating':
                return '🔄 更新中...';
            case 'success':
                return '✅ 更新完了！';
            case 'error':
                return '❌ 更新失敗';
            default:
                return '📌 pptxDB読込';
        }
    };

    const handleUpdatePptxIndex = async () => {
        setIndexStatus('updating');
        try {
            const res = await fetch('/update_pptx_index', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                setIndexStatus('success');
            } else {
                setIndexStatus('error');
            }
        } catch (err) {
            console.error('インデックス更新エラー:', err);
            setIndexStatus('error');
        } finally {
            setTimeout(() => setIndexStatus('idle'), 3000);
        }
    };

    return (
        <div className="summarizer-container pptx-summarizer">
            {/* 横並びレイアウト */}
            <div className="main-content">
                <div className="left-panel">
                    <h2>Upload and Summarize PPTX</h2>
                    <input type="file" accept=".pptx" onChange={handleFileChange} />
                    <button onClick={handleUpload}>Summarize</button>
                    {isUploading && <p>🔄 要約中です...</p>}
                    {error && <p className="error-message">{error}</p>}

                    {summary && (
                        <div className="summary-display">
                            <h3>📝 要約結果</h3>
                            <h3>Summary:</h3>
                            <p>{summary}</p>
                        </div>
                    )}

                    <hr style={{ margin: '30px 0' }} />

                    <div className="search-tab-buttons">
                        <button
                            className={activeTab === 'summarySearch' ? 'active-tab' : ''}
                            onClick={() => setActiveTab('summarySearch')}
                        >
                            🔍 要約DBから検索
                        </button>
                        <button
                            className={activeTab === 'pptxSearch' ? 'active-tab' : ''}
                            onClick={() => setActiveTab('pptxSearch')}
                        >
                            📊 pptxDBから検索
                        </button>
                    </div>

                <div className="search-tab-content">
                    {activeTab === 'summarySearch' && (
                        <PptxSummaryBasedSearch
                            userId={userId}
                            triggerSearchKeyword={externalSearchKeyword}
                        />
                    )}
                    {activeTab === 'pptxSearch' && (
                        <PptxBasedSearch
                            userId={userId}
                            triggerSearchKeyword={externalSearchKeyword}
                        />
                    )}
                </div>
                </div>

                <div className="right-panel">

                <div className="index-update-wrapper" style={{ marginBottom: '20px' }}>
                    <button
                    className="index-update-button"
                    onClick={handleUpdatePptxIndex}
                    disabled={indexStatus === 'updating'}
                    >
                    {getIndexButtonLabel()}
                    </button>
                </div>
                    {/* ここに頻出キーワードやユーザーキーワードを表示 */}
                    <FrequentKeywords onKeywordClick={handleKeywordClick} />
                    {/* 将来的にユーザ登録キーワードコンポーネントもここに追加可能 */}
                </div>
            </div>
        </div>
    );
};

export default PptxSummarizer;