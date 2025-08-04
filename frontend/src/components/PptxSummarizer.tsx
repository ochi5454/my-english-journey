import React, { useState, useRef } from 'react';
import PptxSummaryBasedSearch from './PptxSummaryBasedSearch';
import PptxBasedSearch from './PptxBasedSearch';
import PptxFrequentThemes, { PptxFrequentThemesRef } from './PptxFrequentThemes';
import './PptxSummarizer.css';

interface PptxSummarizerProps {
    userId: string;
}

const PptxSummarizer: React.FC<PptxSummarizerProps> = ({ userId }) => {
    const [activeTab, setActiveTab] = useState<'summarySearch' | 'pptxSearch'>('pptxSearch');
    const [indexStatus, setIndexStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
    const [externalSearchKeyword, setExternalSearchKeyword] = useState<string | undefined>(undefined);
    const pptxFrequentThemesRef = useRef<PptxFrequentThemesRef>(null);
    const [summaryIndexStatus, setSummaryIndexStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle'); // 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）

    const handleThemeClick = (theme: string) => {
        setExternalSearchKeyword(theme); // 検索トリガーとして子に渡す
        setTimeout(() => setExternalSearchKeyword(undefined), 100);
    };

    const handleLoadThemes = () => {
        pptxFrequentThemesRef.current?.fetchThemes();
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
                return '📌 pptxDB更新';
        }
    };

    // 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）START
    const getSummaryIndexButtonLabel = () => {
        switch (summaryIndexStatus) {
            case 'updating':
                return '🔄 要約中...';
            case 'success':
                return '✅ 要約完了！';
            case 'error':
                return '❌ 要約失敗';
            default:
                return '📑 要約DB更新';
        }
    };
     // 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）END

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

    // 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）START
    const handleUpdateSummaryIndex = async () => {
        setSummaryIndexStatus('updating');
        try {
            const res = await fetch('/update_summary_index', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                setSummaryIndexStatus('success');
            } else {
                setSummaryIndexStatus('error');
            }
        } catch (err) {
            console.error('要約インデックス更新エラー:', err);
            setSummaryIndexStatus('error');
        } finally {
            setTimeout(() => setSummaryIndexStatus('idle'), 3000);
        }
    };
    // 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）END


    return (
            <div className="summarizer-container pptx-summarizer">
            <div className="main-content">
                <div className="left-panel">

                {/* DB準備セクション */}
                <div className="group-section">
                    <h1 className="group-title">📥 データ準備・登録</h1>

                        {/* pptxDB / summaryDB 取り込みセクション：横並び（コンパクト） */}
                        <div className="dual-buttons">
                        <section className="pptx-reload-section no-heading">
                            <button
                            className="index-update-button"
                            onClick={handleUpdatePptxIndex}
                            disabled={indexStatus === 'updating'}
                            >
                            {getIndexButtonLabel()}
                            </button>
                        </section>

                        <section className="pptx-reload-section no-heading">
                            <button
                            className="index-update-button"
                            onClick={handleUpdateSummaryIndex}
                            disabled={summaryIndexStatus === 'updating'}
                            >
                            {getSummaryIndexButtonLabel()}
                            </button>
                        </section>
                        </div>

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
                        {/* 2025.8.1 Mod（reduce api consumption）START */}
                        <button onClick={handleLoadThemes}>📥 テーマ取得</button>
                        <PptxFrequentThemes
                            ref={pptxFrequentThemesRef}
                            onThemeClick={handleThemeClick}
                            sourceType={activeTab === 'pptxSearch' ? 'pptx' : 'summary'}  //2025.8.4 Mod（change db for themes）
                        />
                        {/* 2025.8.1 Mod（reduce api consumption）END */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PptxSummarizer;