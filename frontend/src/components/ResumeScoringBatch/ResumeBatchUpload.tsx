// ResumeBatchUpload.tsx
import React, { useEffect, useState, useRef } from 'react';
import '../ResumeScoringChatMode/ResumeScoringChatMode.css';
import './ResumeBatchUpload.css';
import AIProcessingScreen from '../ResumeScoringChatMode/AIProcessingScreen';
import BatchResultSection from './BatchResultSection';
import DummyAILogGenerator from '../ResumeScoringChatMode/DummyAILogGenerator';
import { progressSteps, masterDefinitions } from '../ResumeScoringChatMode/progressSteps';
import appConfig from '../../config';
import { useLocation } from 'react-router-dom';

interface BatchResult {
    total: number;
    success: number;
    error: number;
    processing_time: number;
    avg_time_per_file: number;
    results: Array<{
        filename: string;
        status: 'success' | 'error';
        candidate_id?: string;
        name?: string;
        gender?: string;
        error?: string;
        processing_time: number;
    }>;
    successful_candidates: Array<{
        filename: string;
        candidate_id: string;
        name: string;
        gender: string;
        has_motivation: boolean;
        has_work_experience: boolean;
        processing_time: number;
    }>;
}

const ResumeBatchUpload: React.FC<{ userId: string }> = ({ userId }) => {
    const location = useLocation();
    
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
    const [messages, setMessages] = useState<{ 
        role: 'user' | 'ai'; 
        text: string;
        data?: any;
    }[]>([]);
    const [currentStatus, setCurrentStatus] = useState<string>('waiting');
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const batchResultRef = useRef<HTMLDivElement | null>(null);
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isInputAreaOpen, setIsInputAreaOpen] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lastLogTime, setLastLogTime] = useState<number | null>(null);
    const [shouldShowDummy, setShouldShowDummy] = useState(false);
    
    const MSG_BATCH_RESULT = '__BATCH_RESULT__';

    // 簡易プログレスステップ（一括用）
    const batchProgressSteps = [
        { id: 'waiting', label: '待機中', icon: '⏸️' },
        { id: 'uploading', label: 'ファイルアップロード中', icon: '📤' },
        { id: 'processing', label: '一括処理中', icon: '⚡' },
        { id: 'completed', label: '完了', icon: '✅' },
        { id: 'error', label: 'エラー', icon: '❌' }
    ];

    // ✅ ページ遷移時にリセット
    useEffect(() => {
        setMessages([]);
        setFiles([]);
        setBatchResult(null);
        setLoading(false);
        setCurrentStatus('waiting');
        setIsInputAreaOpen(true);
        setLastLogTime(null);
        setShouldShowDummy(false);
    }, [location.pathname]);

    // ✅ メッセージ追加時に自動スクロール
    useEffect(() => {
        const t = setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        return () => clearTimeout(t);
    }, [messages]);

    // ✅ 結果表示時に自動スクロール
    useEffect(() => {
        if (batchResult && batchResultRef.current) {
            setTimeout(() => {
                batchResultRef.current?.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
                
                batchResultRef.current?.classList.add('highlight-animation');
                setTimeout(() => {
                    batchResultRef.current?.classList.remove('highlight-animation');
                }, 2000);
            }, 300);
        }
    }, [batchResult]);

    // ✅ ダミーログ表示トリガー
    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const threshold = 3000 + Math.random() * 1500;
            if (lastLogTime && now - lastLogTime > threshold) {
                setShouldShowDummy(true);
            }
        }, 1200 + Math.random() * 800);
        return () => clearInterval(interval);
    }, [lastLogTime, loading]);

    // ✅ ドラッグ&ドロップハンドラー
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        const validFiles = droppedFiles.filter(file => 
            file.name.match(/\.(pdf|doc|docx|xls|xlsx)$/i)
        );

        if (validFiles.length !== droppedFiles.length) {
            alert('対応ファイル形式: PDF, DOC, DOCX, XLS, XLSX');
        }

        if (validFiles.length > 50) {
            alert('一度に50件までアップロードできます');
            return;
        }

        setFiles(validFiles);
    };

    const handleClickUploadArea = () => {
        fileInputRef.current?.click();
    };

    const handleBatchUpload = async () => {
        if (files.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        // ✅ ファイルアップロード開始時に入力エリアを閉じる
        setIsInputAreaOpen(false);

        setLoading(true);
        setBatchResult(null);
        setCurrentStatus('uploading');
        setLastLogTime(Date.now());
        
        setMessages((prev) => [
            ...prev,
            { 
                role: 'user', 
                text: `📎 ${files.length}件のファイルを一括送信しました` 
            },
            {
                role: 'ai',
                text: `🚀 ${files.length}件の履歴書を一括処理します。最大5件ずつ並列処理を行います...`
            }
        ]);

        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        formData.append('uploader_id', userId);

        try {
            setCurrentStatus('processing');
            setMessages((prev) => [
                ...prev,
                { role: 'ai', text: '⚡ 並列処理を開始しました...' }
            ]);
            setLastLogTime(Date.now());

            const response = await fetch(`${appConfig.API_BASE_URL}/resume-batch-upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('アップロードに失敗しました');
            }

            // ✅ ストリーミング形式でログを受信（もし対応していれば）
            if (response.body && response.headers.get('content-type')?.includes('stream')) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            try {
                                const json = JSON.parse(line.slice(5).trim());
                                if (json.log) {
                                    setLastLogTime(Date.now());
                                    setMessages((prev) => [
                                        ...prev,
                                        { role: 'ai' as const, text: json.log }
                                    ]);
                                }
                                if (json.status) setCurrentStatus(json.status);
                            } catch (err) {
                                console.error('JSON parse error:', err);
                            }
                        }
                    }
                }
            } else {
                // ✅ 通常のJSON応答
                const result: BatchResult = await response.json();
                
                // ✅ 処理中の模擬ログを表示
                setMessages((prev) => [
                    ...prev,
                    { role: 'ai', text: '📄 ファイルを読み込んでいます...' }
                ]);
                setLastLogTime(Date.now());

                await new Promise(resolve => setTimeout(resolve, 500));

                setMessages((prev) => [
                    ...prev,
                    { role: 'ai', text: '🔍 基本情報を抽出しています...' }
                ]);
                setLastLogTime(Date.now());

                await new Promise(resolve => setTimeout(resolve, 800));

                setMessages((prev) => [
                    ...prev,
                    { role: 'ai', text: `✨ ${result.success}件の候補者情報を抽出しました` }
                ]);
                setLastLogTime(Date.now());

                setBatchResult(result);
                setCurrentStatus('completed');

                // 処理結果のサマリをメッセージに追加
                setMessages((prev) => [
                    ...prev,
                    { 
                        role: 'ai', 
                        text: `✅ 一括処理が完了しました！\n\n` +
                              `📊 処理結果:\n` +
                              `・総件数: ${result.total}件\n` +
                              `・成功: ${result.success}件\n` +
                              `・エラー: ${result.error}件\n` +
                              `・処理時間: ${result.processing_time.toFixed(1)}秒\n` +
                              `・平均処理時間: ${result.avg_time_per_file.toFixed(1)}秒/件`
                    },
                    { role: 'ai', text: MSG_BATCH_RESULT }
                ]);

                // 次のステップを案内
                if (result.success > 0) {
                    setMessages((prev) => [
                        ...prev,
                        { 
                            role: 'ai', 
                            text: `💡 次のステップ:\n` +
                                  `候補者リストから気になる候補を選んで、個別に詳細スコアリングを実行できます。`
                        }
                    ]);
                }
            }

        } catch (err) {
            console.error(err);
            setCurrentStatus('error');
            setMessages((prev) => [
                ...prev,
                { 
                    role: 'ai', 
                    text: `❌ エラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}` 
                }
            ]);
        } finally {
            setLoading(false);
            setLastLogTime(null);
        }
    };

    return (
        <div className="resume-chat-layout">
            {/* 左：進捗表示（折りたたみ可能） */}
            <div className={`left-panel ${isLeftPanelOpen ? 'open' : 'closed'}`}>
                <button 
                    className="toggle-panel-btn"
                    onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                    title={isLeftPanelOpen ? 'ワークフローを閉じる' : 'ワークフローを開く'}
                >
                    {isLeftPanelOpen ? '◀' : '▶'}
                </button>
                <div className={`left-panel-content ${isLeftPanelOpen ? 'visible' : 'hidden'}`}>
                    <AIProcessingScreen
                        currentStatus={currentStatus}
                        progressSteps={batchProgressSteps}
                        masterDefinitions={masterDefinitions}
                    />
                </div>
            </div>

            {/* 右：チャット */}
            <div className="right-panel">
                <div className="chat-header">
                    <h2>📦 履歴書一括アップロード</h2>
                    <p className="chat-subtitle">複数の履歴書を同時に処理できます</p>
                </div>

                <div className="chat-window">
                    {messages.map((m, i) => (
                        <div 
                            key={i} 
                            className={`chat-message ${m.role}`}
                            ref={m.text === MSG_BATCH_RESULT ? batchResultRef : null}
                        >
                            {m.text === MSG_BATCH_RESULT ? (
                                <BatchResultSection 
                                    result={batchResult} 
                                    userId={userId}
                                />
                            ) : (
                                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                                    {m.text}
                                </pre>
                            )}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* ✅ ファイル選択エリア（開閉可能） */}
                <div className={`chat-input-wrapper-batch ${isInputAreaOpen ? 'open' : 'closed'}`}>
                    {/* ✅ トグルボタン */}
                    <button 
                        className="toggle-input-btn"
                        onClick={() => setIsInputAreaOpen(!isInputAreaOpen)}
                        title={isInputAreaOpen ? 'ファイル選択エリアを閉じる' : 'ファイル選択エリアを開く'}
                    >
                        {isInputAreaOpen ? '▼' : '▲'}
                    </button>

                    {isInputAreaOpen && (
                        <div className="input-area-content">
                            <div className="batch-upload-info">
                                <p>💡 一括アップロードの特徴:</p>
                                <ul>
                                    <li>最大50件まで同時アップロード可能</li>
                                    <li>基本情報のみ抽出（名前・性別・志望動機・職務経歴）</li>
                                    <li>詳細スコアリングは後から個別に実行</li>
                                    <li>並列処理で高速化（5件ずつ同時処理）</li>
                                </ul>
                            </div>
                            
                            {/* ✅ ファイル選択とボタンを横並び */}
                            <div className="batch-file-upload-row">
                                <div 
                                    className={`batch-file-drop-area ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                                    onDragEnter={handleDragEnter}
                                    onDragLeave={handleDragLeave}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onClick={handleClickUploadArea}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                                        onChange={(e) => {
                                            const selectedFiles = Array.from(e.target.files || []);
                                            if (selectedFiles.length > 50) {
                                                alert('一度に50件までアップロードできます');
                                                return;
                                            }
                                            setFiles(selectedFiles);
                                        }}
                                        disabled={loading}
                                        style={{ display: 'none' }}
                                    />

                                    {files.length === 0 ? (
                                        <div className="drop-placeholder">
                                            📎 ファイルをドラッグ&ドロップ または クリック
                                        </div>
                                    ) : (
                                        <div className="selected-files-compact">
                                            <strong>選択中: {files.length}件</strong>
                                            <div className="file-list-scroll">
                                                {files.map((f, i) => (
                                                    <div key={i} className="file-item-compact">
                                                        📄 {f.name}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ✅ アップロードボタン（右端） */}
                                <button
                                    className="batch-upload-button"
                                    onClick={handleBatchUpload}
                                    disabled={loading || files.length === 0}
                                >
                                    {loading ? '処理中...' : '送信'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ✅ ダミーAIログジェネレーター */}
                <DummyAILogGenerator
                    active={false}
                    trigger={shouldShowDummy}
                    onLog={(log) => {
                        setMessages((prev) => [...prev, { role: 'ai', text: log }]);
                        setShouldShowDummy(false);
                        setLastLogTime(Date.now());
                    }}
                />
            </div>
        </div>
    );
};

export default ResumeBatchUpload;