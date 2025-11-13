import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import VerticalStatusBar from './VerticalStatusBar';
import StatusContentPanel from './StatusContentPanel';
import CandidateScoreMatrixForModal from './CandidateScoreMatrixForModal';
import CandidateFullEvaluationModal from './CandidateFullEvaluationModal';
import DivisionSelect from './DivisionSelect';
import ResumeReuploadModal from './ResumeReuploadModal';
import InterviewSetupSlidePanel from '../InterviewSetupSlidePanel/InterviewSetupSlidePanel';
import AIProcessingScreenV2 from './AIProcessingScreenV2';
import { progressSteps, masterDefinitions } from './progressStepsV2';
import DummyAILogGenerator from './DummyAILogGenerator';
import JsonDataDisplay from './JsonDataDisplay';
import appConfig from '../../config';
import './ResumeScoringV2.css';

interface Props {
    userId: string;
}

const ResumeScoringV2: React.FC<Props> = ({ userId }) => {
    const location = useLocation();
    const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
    const [selectedStage, setSelectedStage] = useState<string>('アップロード');
    const [showCandidateList, setShowCandidateList] = useState(false);
    const [uploadDivision, setUploadDivision] = useState<string>('');
    const [candidateId, setCandidateId] = useState<string>('');
    const [showReuploadModal, setShowReuploadModal] = useState(false);

    // チャットログを候補者ID別に保持
    const [chatLogByCandidate, setChatLogByCandidate] = useState<Record<string, any[]>>({});

    // ✅ アップロード画面用のチャットメッセージ
    const [uploadMessages, setUploadMessages] = useState<{ role: 'user' | 'ai'; text: string; data?: any }[]>([]);
    const [lastLogTime, setLastLogTime] = useState<number | null>(null);
    const [shouldShowDummy, setShouldShowDummy] = useState(false);
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    // ✅ ドラッグ&ドロップとファイル選択用
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MSG_JSON_DATA = '__JSON_DATA__';

    // 候補者情報編集用の状態
    const [isEditingGender, setIsEditingGender] = useState(false);
    const [genderDraft, setGenderDraft] = useState('');
    const [isEditingPreferredDiv, setIsEditingPreferredDiv] = useState(false);
    const [preferredDivDraft, setPreferredDivDraft] = useState('');
    const [isEditingRecommendedDiv, setIsEditingRecommendedDiv] = useState(false);
    const [recommendedDivDraft, setRecommendedDivDraft] = useState('');

    // 面談設定モーダル用の状態
    const [showInterviewSetupModal, setShowInterviewSetupModal] = useState(false);
    const [interviewSetupStage, setInterviewSetupStage] = useState<string>('');

    // 候補者全評価モーダル用の状態
    const [showFullEvalModal, setShowFullEvalModal] = useState(false);

    // AI処理画面用の状態
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<string>('start');
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

    // 部門マッピング (prefix -> 日本語名)
    const [divisionMap, setDivisionMap] = useState<Record<string, string>>({});

    // ✅ ルート変更時にすべての状態をリセット（ヘッダーボタンクリック時）
    useEffect(() => {
        setSelectedCandidate(null);
        setSelectedStage('アップロード');
        setShowCandidateList(false);
        setUploadDivision('');
        setPreferredDivDraft('');
        setRecommendedDivDraft('');
        setIsEditingGender(false);
        setIsEditingPreferredDiv(false);
        setIsEditingRecommendedDiv(false);
        setShowReuploadModal(false);
        setShowInterviewSetupModal(false);
        setShowFullEvalModal(false);
        setIsProcessing(false);
        setCurrentStatus('start');
        setChatLogByCandidate({});
        setUploadMessages([]);
        setLastLogTime(null);
        setShouldShowDummy(false);
        setSelectedFiles([]);
        setIsDragging(false);
        const autoId = 'cand_' + Math.random().toString(36).substring(2, 10);
        setCandidateId(autoId);
    }, [location.pathname]);

    // 候補者IDを自動生成
    useEffect(() => {
        if (!selectedCandidate) {
            const autoId = 'cand_' + Math.random().toString(36).substring(2, 10);
            setCandidateId(autoId);
        }
    }, [selectedCandidate]);

    // 部門マッピングを取得
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/skills`)
            .then(res => res.json())
            .then((data: any[]) => {
                const map: Record<string, string> = {};
                data.forEach(item => {
                    if (item.division_prefix && item.division) {
                        map[item.division_prefix] = item.division;
                    }
                });
                setDivisionMap(map);
            })
            .catch(err => console.error('部門情報取得エラー:', err));
    }, []);

    // prefixを日本語部門名に変換
    const getDivisionName = (prefix: string): string => {
        return divisionMap[prefix] || prefix;
    };

    // 年齢を計算（YYYY-MM-DD形式の生年月日から）
    const calculateAge = (birthDate: string): number => {
        if (!birthDate) return 0;
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const handleCandidateSelect = async (candidateId: string) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${candidateId}`);
            const data = await res.json();
            if (!data.error) {
                setSelectedCandidate(data);
                setSelectedStage('アップロード');
                setShowCandidateList(false);

                // 希望部門を同期（新規アップロード、再アップロード、候補者情報で連動）
                if (data.preferred_div) {
                    setUploadDivision(data.preferred_div);
                    setPreferredDivDraft(data.preferred_div);
                }

                // 推奨部門も初期化
                if (data.recommended_division) {
                    setRecommendedDivDraft(data.recommended_division);
                }
            }
        } catch (err) {
            console.error('候補者詳細取得エラー:', err);
        }
    };

    // ヘッダークリックで新規アップロード画面にリセット
    const handleHeaderClick = () => {
        setSelectedCandidate(null);
        setSelectedStage('アップロード');
        setUploadDivision('');
        setPreferredDivDraft('');
        setRecommendedDivDraft('');
        setIsEditingGender(false);
        setIsEditingPreferredDiv(false);
        setIsEditingRecommendedDiv(false);
    };

    const handleResultUpdate = async () => {
        if (selectedCandidate) {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${selectedCandidate.user_id}`);
            const data = await res.json();
            setSelectedCandidate(data);

            // 希望部門と推奨部門のstateも更新して同期を維持
            if (data.preferred_div) {
                setUploadDivision(data.preferred_div);
                setPreferredDivDraft(data.preferred_div);
            }
            if (data.recommended_division) {
                setRecommendedDivDraft(data.recommended_division);
            }
        }
    };

    const handleReuploadSuccess = () => {
        setShowReuploadModal(false);
        handleResultUpdate();
    };

    // 面談設定を開く
    const handleOpenInterviewFlow = (stage: string) => {
        setInterviewSetupStage(stage);
        setShowInterviewSetupModal(true);
    };

    // 面談設定を保存
    const handleInterviewSetupSubmit = async (data: any) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: selectedCandidate.user_id,
                    ...data,
                }),
            });

            if (!res.ok) throw new Error('面談設定の保存に失敗しました');

            alert('面談設定を保存しました');
            setShowInterviewSetupModal(false);
            handleResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    // 性別保存
    const handleSaveGender = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-gender-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: selectedCandidate.user_id,
                    gender: genderDraft,
                }),
            });

            if (!res.ok) throw new Error('性別の更新に失敗しました');

            setSelectedCandidate((prev: any) => ({
                ...prev,
                gender: genderDraft,
            }));

            setIsEditingGender(false);
            alert('性別を更新しました');
        } catch (err) {
            console.error(err);
            alert('更新エラーが発生しました');
        }
    };

    // 希望部門保存
    const handleSavePreferredDiv = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-preferred-div-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: selectedCandidate.user_id,
                    preferred_division: preferredDivDraft,
                }),
            });

            if (!res.ok) throw new Error('希望部門の更新に失敗しました');

            setSelectedCandidate((prev: any) => ({
                ...prev,
                preferred_div: preferredDivDraft,
            }));

            // アップロード部門も同期
            setUploadDivision(preferredDivDraft);

            setIsEditingPreferredDiv(false);
            alert('希望部門を更新しました');
        } catch (err) {
            console.error(err);
            alert('更新エラーが発生しました');
        }
    };

    // 推奨部門保存
    const handleSaveRecommendedDiv = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-recommended-div-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: selectedCandidate.user_id,
                    recommended_division: recommendedDivDraft,
                }),
            });

            if (!res.ok) throw new Error('推奨部門の更新に失敗しました');

            setSelectedCandidate((prev: any) => ({
                ...prev,
                recommended_division: recommendedDivDraft,
            }));

            setIsEditingRecommendedDiv(false);
            alert('推奨部門を更新しました');
        } catch (err) {
            console.error(err);
            alert('更新エラーが発生しました');
        }
    };

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

        if (validFiles.length > 10) {
            alert('一度に10件までアップロードできます');
            return;
        }

        setSelectedFiles(validFiles);
    };

    const handleClickUploadArea = () => {
        fileInputRef.current?.click();
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        // ✅ 希望部門は任意（空でもOK）
        if (!candidateId.trim()) {
            alert('候補者IDを入力してください');
            return;
        }

        setIsProcessing(true);
        setCurrentStatus('start');

        // ✅ ユーザーメッセージを追加
        setUploadMessages(prev => [
            ...prev,
            { role: 'user', text: `📎 ファイルを送信しました (${selectedFiles.map(f => f.name).join(', ')})` }
        ]);

        const formData = new FormData();
        selectedFiles.forEach((file: File) => formData.append('files', file));
        formData.append('candidate_id', candidateId);
        formData.append('uploader_id', userId);
        if (uploadDivision) {
            formData.append('desired_division', uploadDivision);
        }

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok || !res.body) {
                setIsProcessing(false);
                alert('エラーが発生しました');
                return;
            }

            // SSE処理
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const json = JSON.parse(line.slice(5).trim());

                            // ✅ ログメッセージをチャットに追加
                            if (json.log) {
                                setLastLogTime(Date.now());
                                const logText = json.log;

                                const hasData =
                                    json.data &&
                                    !(
                                        (typeof json.data === 'object' && Object.keys(json.data).length === 0) ||
                                        (Array.isArray(json.data) && json.data.length === 0)
                                    );

                                setUploadMessages(prev => [
                                    ...prev,
                                    { role: 'ai', text: logText },
                                    ...(hasData ? [{
                                        role: 'ai' as const,
                                        text: MSG_JSON_DATA,
                                        data: json.data
                                    }] : []),
                                ]);
                            }

                            if (json.status) {
                                setCurrentStatus(json.status);
                            }

                            if (json.status === 'final_payload' && json.data) {
                                setIsProcessing(false);
                                setUploadMessages(prev => [
                                    ...prev,
                                    { role: 'ai', text: '✅ スコアリングが完了しました！' }
                                ]);
                                // 候補者を選択状態にする
                                await handleCandidateSelect(candidateId);
                                return;
                            }
                        } catch (err) {
                            console.error('JSON parse error:', err, line);
                        }
                    }
                }
            }

            setCurrentStatus('done');
        } catch (err) {
            console.error(err);
            alert('スコアリング中にエラーが発生しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    // 🎯 チャットの自動スクロール
    useEffect(() => {
        const t = setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        return () => clearTimeout(t);
    }, [uploadMessages]);

    // 🎯 DummyAILogGeneratorの制御
    useEffect(() => {
        if (!isProcessing) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const threshold = 3000 + Math.random() * 1500;
            if (lastLogTime && now - lastLogTime > threshold) {
                setShouldShowDummy(true);
            }
        }, 1200 + Math.random() * 800);
        return () => clearInterval(interval);
    }, [lastLogTime, isProcessing]);

    // 候補者が選択されていない場合は新規アップロード画面（2ペイン構造）
    if (!selectedCandidate) {
        return (
            <>
                <div
                    className="v2-upload-layout"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {/* 左ペイン：AI処理画面（折りたたみ可能） */}
                    <div className={`v2-left-panel ${isLeftPanelOpen ? 'open' : 'closed'}`}>
                        <button
                            className="v2-toggle-panel-btn"
                            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                            title={isLeftPanelOpen ? 'ワークフローを閉じる' : 'ワークフローを開く'}
                        >
                            {isLeftPanelOpen ? '◀' : '▶'}
                        </button>
                        <div className={`v2-left-panel-content ${isLeftPanelOpen ? 'visible' : 'hidden'}`}>
                            {isProcessing ? (
                                <AIProcessingScreenV2
                                    currentStatus={currentStatus}
                                    progressSteps={progressSteps}
                                    masterDefinitions={masterDefinitions}
                                />
                            ) : (
                                <div className="v2-workflow-idle">
                                    <h3>🤖 エージェントのワークフロー</h3>
                                    <p>ファイルをアップロードすると、AI評価処理が開始されます。</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右ペイン：チャット画面 */}
                    <div className="v2-right-panel">
                        <div className="v2-chat-header">
                            <h2>📤 新規履歴書アップロード</h2>
                            <button
                                className="v2-candidate-list-button"
                                onClick={() => setShowCandidateList(true)}
                            >
                                📋 候補者一覧から選択
                            </button>
                        </div>

                        {/* アップロード入力エリア */}
                        <div className="v2-upload-input-area">
                            <div className="v2-input-row">
                                <DivisionSelect
                                    value={uploadDivision}
                                    onChange={setUploadDivision}
                                    className="v2-division-select"
                                    placeholder="希望部門を選択（任意）"
                                />
                                <input
                                    type="text"
                                    className="v2-candidate-id-input"
                                    placeholder="cand_2kjmyi0e"
                                    value={candidateId}
                                    disabled
                                />
                            </div>

                            <div className="v2-file-upload-row">
                                <div
                                    className={`v2-upload-dropzone ${isDragging ? 'dragging' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
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
                                            const files = Array.from(e.target.files || []);
                                            if (files.length > 10) {
                                                alert('一度に10件までアップロードできます');
                                                return;
                                            }
                                            setSelectedFiles(files);
                                        }}
                                        disabled={isProcessing}
                                        style={{ display: 'none' }}
                                    />

                                    {selectedFiles.length === 0 ? (
                                        <div className="v2-upload-placeholder">
                                            <span className="v2-upload-icon">📂</span>
                                            <p className="v2-upload-text">ファイルをドラッグ&ドロップ または クリック</p>
                                        </div>
                                    ) : (
                                        <div className="v2-selected-files-compact">
                                            <div className="v2-files-header">
                                                <strong>選択中: {selectedFiles.length}件</strong>
                                                <button
                                                    className="v2-clear-files-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedFiles([]);
                                                    }}
                                                    title="すべてクリア"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <div className="v2-file-list-scroll">
                                                {selectedFiles.map((f, i) => (
                                                    <div key={i} className="v2-file-item-compact">
                                                        <span className="v2-file-name">📄 {f.name}</span>
                                                        <button
                                                            className="v2-remove-file-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
                                                            }}
                                                            title="削除"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    className="v2-upload-submit-button"
                                    onClick={handleUpload}
                                    disabled={isProcessing || selectedFiles.length === 0}
                                >
                                    {isProcessing ? '処理中...' : '送信'}
                                </button>
                            </div>
                        </div>

                        {/* チャットウィンドウ */}
                        <div className="v2-chat-window">
                            {uploadMessages.length === 0 && (
                                <div className="v2-chat-message ai">
                                    🤖 こんにちは！履歴書をアップロードしてAI評価を開始しましょう。
                                </div>
                            )}
                            {uploadMessages.map((m, i) => (
                                <div key={i} className={`v2-chat-message ${m.role}`}>
                                    {m.text === MSG_JSON_DATA ? (
                                        <JsonDataDisplay data={m.data} />
                                    ) : (
                                        m.text
                                    )}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* DummyAILogGenerator */}
                        <DummyAILogGenerator
                            active={false}
                            trigger={shouldShowDummy}
                            onLog={(log) => {
                                setUploadMessages(prev => [...prev, { role: 'ai', text: log }]);
                                setShouldShowDummy(false);
                                setLastLogTime(Date.now());
                            }}
                        />
                    </div>
                </div>

                {/* 候補者一覧モーダル */}
                {showCandidateList && (
                    <div className="v2-candidate-list-modal-overlay" onClick={() => setShowCandidateList(false)}>
                        <div className="v2-candidate-list-modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="v2-modal-header">
                                <h2>候補者一覧</h2>
                                <button
                                    className="v2-modal-close-button"
                                    onClick={() => setShowCandidateList(false)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="v2-modal-body">
                                <CandidateScoreMatrixForModal
                                    interviewerId={userId}
                                    onCandidateSelect={handleCandidateSelect}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // 候補者が選択されている場合は詳細画面
    return (
        <>
            <div className="resume-scoring-v2-main">
                {/* 上部: 候補者情報（2行レイアウト） */}
                <div className="v2-candidate-selector-bar">
                    {/* 1行目: ボタン類 */}
                    <div className="v2-info-row v2-info-row-1">
                        <div className="v2-reset-header" onClick={handleHeaderClick} title="クリックして新規アップロード画面に戻る">
                            🔄 Topに戻る
                        </div>

                        <div className="v2-button-spacer"></div>

                        <button
                            className="v2-candidate-list-button"
                            onClick={() => setShowFullEvalModal(true)}
                        >
                            📊 評価サマリー
                        </button>

                        <button
                            className="v2-candidate-list-button"
                            onClick={() => setShowCandidateList(true)}
                        >
                            📋 候補者一覧
                        </button>
                    </div>

                    {/* 2行目: 候補者情報 */}
                    <div className="v2-info-row v2-info-row-2">
                        <div className="v2-info-group">
                            {/* 候補者名 */}
                            <div className="info-item">
                                <span className="icon">👤</span>
                                <span className="label">候補者:</span>
                                <span className="value">{selectedCandidate.user_name || selectedCandidate.user_id}</span>
                            </div>

                            {/* 性別表示・編集 */}
                            <div className="info-item gender-display">
                                {(selectedCandidate.gender === 'その他' || selectedCandidate.gender === '不明' || !selectedCandidate.gender) ? (
                                isEditingGender ? (
                                    <div className="gender-edit-inline">
                                        <select
                                            value={genderDraft}
                                            onChange={(e) => setGenderDraft(e.target.value)}
                                            className="gender-select"
                                        >
                                            <option value="男性">男性</option>
                                            <option value="女性">女性</option>
                                            <option value="その他">その他</option>
                                            <option value="不明">不明</option>
                                        </select>
                                        <button onClick={handleSaveGender} className="save-btn">✓</button>
                                        <button
                                            onClick={() => {
                                                setIsEditingGender(false);
                                                setGenderDraft(selectedCandidate.gender || 'その他');
                                            }}
                                            className="cancel-btn"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <span
                                        className="gender-clickable"
                                        onClick={() => {
                                            setGenderDraft(selectedCandidate.gender || 'その他');
                                            setIsEditingGender(true);
                                        }}
                                        title="クリックして性別を変更"
                                    >
                                        <span className="icon">⚧️</span>
                                        <span className="label">性別:</span>
                                        <span className="gender-unknown">{selectedCandidate.gender || '不明'}</span>
                                    </span>
                                )
                            ) : (
                                <span>
                                    <span className="icon">{selectedCandidate.gender === '男性' ? '👨' : '👩'}</span>
                                    <span className="label">性別:</span> {selectedCandidate.gender}
                                </span>
                            )}
                            </div>

                            {/* 年齢表示 */}
                            <div className="info-item age-display">
                                <span className="icon">🎂</span>
                                <span className="label">年齢:</span>
                                <span className="value">
                                    {selectedCandidate.birth_date
                                        ? `${calculateAge(selectedCandidate.birth_date)}歳`
                                        : '未設定'}
                                </span>
                            </div>

                            {/* 希望部門表示・編集 */}
                            <div className="info-item preferred-div-display">
                            {isEditingPreferredDiv ? (
                                <div className="div-edit-inline">
                                    <DivisionSelect
                                        value={preferredDivDraft}
                                        onChange={setPreferredDivDraft}
                                        className="div-select"
                                        placeholder="希望部門を選択"
                                    />
                                    <button onClick={handleSavePreferredDiv} className="save-btn">✓</button>
                                    <button
                                        onClick={() => {
                                            setIsEditingPreferredDiv(false);
                                            setPreferredDivDraft(selectedCandidate.preferred_div || '');
                                        }}
                                        className="cancel-btn"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <span
                                    className="div-clickable"
                                    onClick={() => {
                                        setPreferredDivDraft(selectedCandidate.preferred_div || '');
                                        setIsEditingPreferredDiv(true);
                                    }}
                                    title="クリックして希望部門を変更"
                                >
                                    <span className="icon">🎯</span>
                                    <span className="label">希望部門:</span>
                                    <span className="value">
                                        {selectedCandidate.preferred_div
                                            ? getDivisionName(selectedCandidate.preferred_div)
                                            : '未設定'}
                                    </span>
                                </span>
                            )}
                            </div>

                            {/* 推奨部門表示・編集 */}
                            <div className="info-item recommended-div-display">
                                {isEditingRecommendedDiv ? (
                                    <div className="div-edit-inline">
                                        <DivisionSelect
                                            value={recommendedDivDraft}
                                            onChange={setRecommendedDivDraft}
                                            className="div-select"
                                            placeholder="推奨部門を選択"
                                        />
                                        <button onClick={handleSaveRecommendedDiv} className="save-btn">✓</button>
                                        <button
                                            onClick={() => {
                                                setIsEditingRecommendedDiv(false);
                                                setRecommendedDivDraft(selectedCandidate.recommended_division || '');
                                            }}
                                            className="cancel-btn"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <span
                                        className="div-clickable"
                                        onClick={() => {
                                            setRecommendedDivDraft(selectedCandidate.recommended_division || '');
                                            setIsEditingRecommendedDiv(true);
                                        }}
                                        title="クリックして推奨部門を変更"
                                    >
                                        <span className="icon">📌</span>
                                        <span className="label">推奨部門:</span>
                                        <span className="value">
                                            {selectedCandidate.recommended_division
                                                ? getDivisionName(selectedCandidate.recommended_division)
                                                : '未設定'}
                                        </span>
                                    </span>
                                )}
                            </div>

                            {/* ステータス表示 */}
                            <div className="info-item">
                                <span className="icon">📍</span>
                                <span className="label">ステータス:</span>
                                <span className="status-badge">{selectedCandidate.status || 'アップロード'}</span>
                            </div>
                        </div>
                    </div>
                </div>

            {/* メインコンテンツ: 左ブックマーク + 右サブペイン */}
            <div className="v2-main-layout">
                {/* 左側: ブックマーク形式のステータスバー */}
                <VerticalStatusBar
                    localResult={selectedCandidate}
                    selectedStage={selectedStage}
                    onStageSelect={setSelectedStage}
                />

                {/* 右側: 選択したステータスに応じた内容 */}
                <StatusContentPanel
                    selectedStage={selectedStage}
                    localResult={selectedCandidate}
                    interviewerId={userId}
                    onResultUpdate={handleResultUpdate}
                    onOpenInterviewFlow={handleOpenInterviewFlow}
                    onOpenInterviewPrep={(stage) => {
                        // 面接準備シートは右ペインに表示されるため、ここでは何もしない
                        console.log('面談準備:', stage);
                    }}
                    onOpenReupload={() => {
                        setShowReuploadModal(true);
                    }}
                    chatLogByCandidate={chatLogByCandidate}
                    onChatLogChange={(candidateId: string, newLog: any[]) => {
                        setChatLogByCandidate(prev => ({
                            ...prev,
                            [candidateId]: newLog
                        }));
                    }}
                    uploadDivision={uploadDivision}
                    onUploadDivisionChange={(newDiv: string) => {
                        setUploadDivision(newDiv);
                        setPreferredDivDraft(newDiv);
                        // 候補者情報にも反映（希望部門として保存）
                        if (selectedCandidate) {
                            setSelectedCandidate((prev: any) => ({
                                ...prev,
                                preferred_div: newDiv
                            }));
                        }
                    }}
                />
            </div>
        </div>

        {/* 候補者一覧モーダル */}
        {showCandidateList && (
            <div className="v2-candidate-list-modal-overlay" onClick={() => setShowCandidateList(false)}>
                <div className="v2-candidate-list-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="v2-modal-header">
                        <h2>候補者一覧</h2>
                        <button
                            className="v2-modal-close-button"
                            onClick={() => setShowCandidateList(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="v2-modal-body">
                        <CandidateScoreMatrixForModal
                            interviewerId={userId}
                            onCandidateSelect={handleCandidateSelect}
                        />
                    </div>
                </div>
            </div>
        )}

        {/* 候補者全評価モーダル */}
        {showFullEvalModal && selectedCandidate && (
            <CandidateFullEvaluationModal
                candidateId={selectedCandidate.user_id}
                onClose={() => setShowFullEvalModal(false)}
            />
        )}

        {/* 履歴書再アップロードモーダル */}
        {showReuploadModal && selectedCandidate && (
            <ResumeReuploadModal
                candidateId={selectedCandidate.user_id}
                preferredDivision={selectedCandidate.preferred_div || ''}
                reviewerId={userId}
                onClose={() => setShowReuploadModal(false)}
                onSuccess={handleReuploadSuccess}
            />
        )}

        {/* 面談設定モーダル */}
        {showInterviewSetupModal && selectedCandidate && (
            <InterviewSetupSlidePanel
                candidateId={selectedCandidate.user_id}
                stage={interviewSetupStage}
                isOpen={showInterviewSetupModal}
                onClose={() => setShowInterviewSetupModal(false)}
                onSubmit={handleInterviewSetupSubmit}
            />
        )}
    </>
    );
};

export default ResumeScoringV2;
