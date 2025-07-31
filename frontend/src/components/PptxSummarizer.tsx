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

// 2025.7.30 Add（themes）START
interface FrequentThemesProps {
    onThemeClick: (theme: string) => void;
}

const FrequentThemes: React.FC<FrequentThemesProps> = ({ onThemeClick }) => {
    const [themes, setThemes] = useState<string[]>([]);

    useEffect(() => {
        const fetchThemes = async () => {
            try {
                const res = await fetch('/get_theme?limit=5');
                const data = await res.json();
                setThemes(data.themes);
            } catch (e) {
                console.error('テーマ取得エラー:', e);
            }
        };
        fetchThemes();
    }, []);

    return (
        <div className="themes-container">
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
        </div>
    );
};
// 2025.7.30 Add（themes）END

const PptxSummarizer: React.FC<PptxSummarizerProps> = ({ userId }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'summarySearch' | 'pptxSearch'>('pptxSearch');
    const [indexStatus, setIndexStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
    const [externalSearchKeyword, setExternalSearchKeyword] = useState<string | undefined>(undefined);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleThemeClick = (theme: string) => {
        setExternalSearchKeyword(theme); // 検索トリガーとして子に渡す
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
                return '📌 取り込み';
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
            <div className="main-content">
                <div className="left-panel">

                {/* DB準備セクション */}
                <div className="group-section">
                    <h1 className="group-title">📥 データ準備・登録</h1>

                    {/* Uploadセクション */}
                    <section className="pptx-upload-section">
                    <h2>📤 要約DBに取り込み</h2>
                    <span className="reload-note">
                    pptxから要約DBへ取り込みます。要約DBから検索する場合は事前に要約生成が必要です。
                    </span>
                    <input type="file" accept=".pptx" onChange={handleFileChange} />
                    <button onClick={handleUpload}>Summarize</button>
                    {isUploading && <p>🔄 要約中です...</p>}
                    {error && <p className="error-message">{error}</p>}

                    {summary && (
                        <div className="summary-display">
                        <h3>📝 要約結果</h3>
                        <p>{summary}</p>
                        </div>
                    )}
                    </section>

                    {/* Reloadセクション */}
                    <section className="pptx-reload-section">
                    <h2>📌 pptxDBに取り込み</h2>
                    <div className="index-update-wrapper-vertical">
                        <span className="reload-note">
                        pptxフォルダからpptxDBへ取り込みます。pptxDBから検索する場合は一度押下してください。
                        </span>
                        <button
                        className="index-update-button"
                        onClick={handleUpdatePptxIndex}
                        disabled={indexStatus === 'updating'}
                        >
                        {getIndexButtonLabel()}
                        </button>
                    </div>
                    </section>
                </div>

                {/* 検索セクション */}
                <div className="group-section search-scroll-section">
                    <h1 className="group-title">🔎 PPTX・要約DBから検索</h1>

                    <div className="search-tab-buttons">
                    <button
                        className={activeTab === 'pptxSearch' ? 'active-tab' : ''}
                        onClick={() => setActiveTab('pptxSearch')}
                    >
                        📊 pptxDBから検索
                    </button>
                    <button
                        className={activeTab === 'summarySearch' ? 'active-tab' : ''}
                        onClick={() => setActiveTab('summarySearch')}
                    >
                        🔍 要約DBから検索
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
                </div>

                <div className="right-panel">
                    <div className="group-section">
                        <div className="group-title">🏷️ 頻出テーマ</div>
                        <FrequentThemes onThemeClick={handleThemeClick} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PptxSummarizer;