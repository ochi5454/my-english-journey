import React, { useState, useEffect } from 'react';
import './CandidateResultDetail.css';
import InterviewSetupSlidePanel from '../InterviewSetupSlidePanel/InterviewSetupSlidePanel.tsx';
import InterviewCheckSheetSlidePanel from '../InterviewCheckSheetSlidePanel/InterviewCheckSheetSlidePanel.tsx';
import appConfig from '../../config.ts';
import HrDecisionEditor from './HrDecisionEditor';
import StatusBar from './StatusBar'
import type { StatusMasterRow } from './StatusBar';
import ScoreDetail from './ScoreDetail';
import ScoreReviewChat from './ScoreReviewChat';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

interface Props {
    result: any;
    onClose: () => void;
    onResultUpdate?: (updatedResult: any) => void;
    interviewerId: string; 
    prefixToName: Record<string, string>;
    configData: { 
        hiringDecisions: { id: string; value: string }[];
    };
}

const CandidateResultDetail: React.FC<Props> = ({ result, onClose, onResultUpdate, interviewerId, prefixToName, configData }) => {
    const [chatInput, setChatInput] = useState('');
    const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
    const [localResult, setLocalResult] = useState<any>(result);
    const [isSending, setIsSending] = useState(false);
    const [chatStage, setChatStage] = useState<string>('書類選考');
    const [interviewStage, setInterviewStage] = useState<string | null>(null);
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showInterviewPrepModal, setShowInterviewPrepModal] = useState(false);
    const [interviewPrepData, setInterviewPrepData] = useState<Record<string, any>>({});
    const [isPrepLoading, setIsPrepLoading] = useState(false);
    const [hrDecisionDraft, setHrDecisionDraft] = useState(localResult.hr_decision || '');
    const [isEditingHrDecision, setIsEditingHrDecision] = useState(false);
    const [isReEvaluating, setIsReEvaluating] = useState(false);
    const [showReuploadModal, setShowReuploadModal] = useState(false);
    const [reuploadFiles, setReuploadFiles] = useState<File[]>([]);
    const [isReuploading, setIsReuploading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isEditingGender, setIsEditingGender] = useState(false);
    const [genderDraft, setGenderDraft] = useState(localResult.gender || 'その他');
    const [statusMaster, setStatusMaster] = useState<StatusMasterRow[]>([]);
    const [stageMap, setStageMap] = useState<Record<string, string>>({});

    const hasMustCheckFailure = (): boolean => {
        const mustCheck = localResult.must_check || {};
        return Object.values(mustCheck).some((item: any) => item.result === false);
    };
    
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
            .then(res => res.json())
            .then((rows: StatusMasterRow[]) => {
                setStatusMaster(rows);

                // 🔥 日本語 → 英語 の変換マップを生成
                const map: Record<string, string> = {};
                rows.filter(r => r.is_interview).forEach(r => {
                    map[r.label] = r.key;      // 例: "1次面談" → "interview_2"
                });
                setStageMap(map);
            })
            .catch(err => console.error("StatusMaster取得エラー:", err));
    }, []);

    useEffect(() => {
        setLocalResult(result);
    }, [result]);

    useEffect(() => {
        if (!interviewStage || !interviewerId || !result?.user_id) return;

        const url = `${appConfig.API_BASE_URL}/checksheet/one?` +
        new URLSearchParams({
            interviewer_id: interviewerId,
            candidate_id: result.user_id,
            stage: stageMap[interviewStage] ?? interviewStage,
        }).toString();

        fetch(encodeURI(url))
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(block => {
            setInterviewPrepData(prev => ({ ...prev, [interviewStage]: block }));
        })
        .catch(err => console.warn('面談準備取得失敗:', err));
    }, [interviewStage, interviewerId, result?.user_id]); 

    const generateContextualMessage = (scores: any[], comment: string): string => {
        const scoreLines = scores.map(s =>
        `【${s.division}】現在スコア: ${s.score}点, 理由: ${s.reason}`
        ).join('\n');
        return `${scoreLines}\n【ユーザーコメント】: ${comment}`;
    };

    const handleSaveHrDecision = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': interviewerId,
            },
            body: JSON.stringify({
                candidate_id: localResult.user_id,
                review: {
                    decision: hrDecisionDraft,
                }
            }),
            });

            if (!res.ok) throw new Error('保存に失敗しました');

            setLocalResult((prev: any) => ({
                ...prev,
                hr_decision: hrDecisionDraft,
                hr_division: localResult.hr_division,
                hr_title: localResult.hr_title,
                hr_income: localResult.hr_income,
                hr_review: {
                    ...(prev.hr_review || {}),
                    decision: hrDecisionDraft,
                    division: localResult.hr_division,
                    title: localResult.hr_title,
                    annual_income: localResult.hr_income,
                    updated_by: interviewerId,
                    updated_at: new Date().toISOString(),
                },
            }));

            onResultUpdate?.({
                ...(localResult || {}),
                hr_decision: hrDecisionDraft,
                hr_division: localResult.hr_division,
                hr_title: localResult.hr_title,
                hr_income: localResult.hr_income,
            });

            alert('HR決定を保存しました');
        } catch (err) {
            console.error(err);
            alert('保存エラーが発生しました');
        }
    };

    // 性別保存関数を追加
    const handleSaveGender = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-gender-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    gender: genderDraft,
                }),
            });

            if (!res.ok) throw new Error('性別の更新に失敗しました');

            setLocalResult((prev: any) => ({
                ...prev,
                gender: genderDraft,
            }));

            onResultUpdate?.({
                ...(localResult || {}),
                gender: genderDraft,
            });

            setIsEditingGender(false);
            alert('性別を更新しました');
        } catch (err) {
            console.error(err);
            alert('更新エラーが発生しました');
        }
    };

    const handleSend = async () => {
        if (!chatInput.trim() || isSending) return;

        const userComment = chatInput.trim();
        const aiContextMessage = generateContextualMessage(localResult.scores, userComment);

        const newUserMsg: ChatMessage = { role: 'user', content: userComment };
        const newApiMsg: ChatMessage = { role: 'user', content: aiContextMessage };

        const updatedChatLog = [...chatLog, newUserMsg];
        const apiMessages = [...chatLog, newApiMsg].slice(-5);

        setChatLog(updatedChatLog);
        setChatInput('');
        setIsSending(true);

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/chat-score-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candidate_id: localResult.user_id,
                reviewer_id: interviewerId,
                messages: apiMessages,
            }),
            });

            if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
            const data = await res.json();

            const aiReply = data.reply || 'AI応答なし';
            const shouldUpdate = data.shouldUpdateScore === true;
            const scoreChangesArray = Array.isArray(data.adjusted_scores)
            ? data.adjusted_scores
            : [];

            setChatLog(prev => [...prev, { role: 'assistant', content: aiReply }]);

            const now = new Date().toISOString();
            const newChatReviewKey = `chat_review_${chatStage}_at`;
            const newChatReviewerKey = `chat_reviewer_${chatStage}`;
            setLocalResult((prev: any) => ({
            ...prev,
            [newChatReviewKey]: now,
            [newChatReviewerKey]: interviewerId,
            }));
            onResultUpdate?.({
            ...(localResult || {}),
            [newChatReviewKey]: now,
            [newChatReviewerKey]: interviewerId,
            });

            if (shouldUpdate && scoreChangesArray.length > 0) {
            const updateRes = await fetch(`${appConfig.API_BASE_URL}/update-score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                candidate_id: localResult.user_id,
                reviewer_id: interviewerId,
                stage: chatStage,
                adjustments: scoreChangesArray,
                }),
            });

            if (updateRes.ok) {
                const refreshed = await fetch(
                `${appConfig.API_BASE_URL}/resume-result/${localResult.user_id}`,
                { cache: 'no-store' }
                );
                if (refreshed.ok) {
                const updatedResult = await refreshed.json();
                setLocalResult(updatedResult);
                onResultUpdate?.(updatedResult);
                } else {
                console.warn('再取得に失敗しました');
                }
            } else {
                console.error('スコア更新に失敗しました');
            }
            }

        } catch (err: any) {
            setChatLog(prev => [
            ...prev,
            { role: 'assistant', content: `⚠ エラーが発生しました: ${err.message || err.toString()}` },
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const isInterviewScheduled = (label: string): boolean => {
        // 日本語ラベル → 英語 key を取得
        const backendKey = stageMap[label];    // 例: "1次面談" → "interview_1"
        if (!backendKey) return false;

        // StatusMaster から面談ステージを確認
        const row = statusMaster.find(r => r.key === backendKey);
        if (!row || !row.is_interview) return false;

        // date カラムは必ず `{key}_date`
        const dateKey = `${backendKey}_date`;  // interview_1_date など

        return Boolean(localResult[dateKey]);
    };

    const openInterviewFlow = (stage: string) => {
        setInterviewStage(stage);
        if (isInterviewScheduled(stage)) {
            setShowConfirmation(true);
        } else {
            setShowInterviewModal(true);
        }
    };

    const handleReEvaluate = async () => {
        if (!localResult.user_id) return;
        
        setIsReEvaluating(true);
        setIsProcessing(true);
        
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-score-rescore/${localResult.user_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewer_id: interviewerId }),
            });

            if (res.status === 404) {
                const errorData = await res.json();
                if (errorData.detail?.includes('履歴書テキストが見つかりません')) {
                    setIsReEvaluating(false);
                    setShowReuploadModal(true);
                    return;
                }
            }

            if (!res.ok) throw new Error(`評価失敗: ${res.status}`);

            const refreshed = await fetch(
                `${appConfig.API_BASE_URL}/resume-result/${localResult.user_id}`,
                { cache: 'no-store' }
            );
            
            if (refreshed.ok) {
                const updatedResult = await refreshed.json();
                setLocalResult(updatedResult);
                onResultUpdate?.(updatedResult);
                alert('AI評価が完了しました');
            }
        } catch (err: any) {
            alert(`評価エラー: ${err.message || err.toString()}`);
        } finally {
            setIsReEvaluating(false);
            setIsProcessing(false);
        }
    };

    const handleFileReupload = async () => {
        if (reuploadFiles.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        setIsReuploading(true);

        try {
            const formData = new FormData();
            reuploadFiles.forEach(file => formData.append('files', file));
            formData.append('candidate_id', localResult.user_id);
            formData.append('uploader_id', interviewerId);
            if (localResult.preferred_div) {
                formData.append('desired_division', localResult.preferred_div);
            }

            const res = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('アップロード失敗');

            alert('再アップロード完了。AI評価を開始します...');
            
            setShowReuploadModal(false);
            setReuploadFiles([]);
            
            setTimeout(() => handleReEvaluate(), 1000);

        } catch (err: any) {
            alert(`アップロードエラー: ${err.message}`);
        } finally {
            setIsReuploading(false);
        }
    };
    
    async function refreshChecksheet(stage: string) {
        const url = new URL(`${appConfig.API_BASE_URL}/checksheet/one`, window.location.origin);
        url.searchParams.set('interviewer_id', interviewerId);
        url.searchParams.set('candidate_id', localResult.user_id);
        url.searchParams.set('stage', stage);

        const r = await fetch(url.toString(), { cache: 'no-store' });
        if (!r.ok) return;
        const block = await r.json();

        setInterviewPrepData(prev => ({ ...prev, [stage]: block }));
    }

    return (
        <>
        <div className="result-d-modal-overlay" onClick={onClose}></div>
        <div className="result-d-modal">

            <div className="result-d-fixed-header">
                <div className="result-d-header-row">
                    <div className="result-d-header-info-inline">
                        <div className="icon">
                            👤 <span className="label">候補者:</span> {localResult.user_name || localResult.user_id}
                        </div>
                        {/* ✅ 性別表示を修正 */}
                        <div className="icon gender-display">
                            {(localResult.gender === 'その他' || localResult.gender === '不明' || !localResult.gender) ? (
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
                                        <button onClick={handleSaveGender} className="gender-save-btn">✓</button>
                                        <button 
                                            onClick={() => {
                                                setIsEditingGender(false);
                                                setGenderDraft(localResult.gender || 'その他');
                                            }} 
                                            className="gender-cancel-btn"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <span 
                                        className="gender-clickable" 
                                        onClick={() => setIsEditingGender(true)}
                                        title="クリックして性別を変更"
                                    >
                                        ⚧️ <span className="label">性別:</span> 
                                        <span className="gender-unknown">{localResult.gender || '不明'}</span>
                                    </span>
                                )
                            ) : (
                                <span>
                                    {localResult.gender === '男性' ? '👨' : '👩'} 
                                    <span className="label">性別:</span> {localResult.gender}
                                </span>
                            )}
                        </div>
                        <div className="icon">
                            📌 <span className="label">推奨部門:</span> 
                            {prefixToName[localResult.recommended_division] || localResult.recommended_division}
                        </div>

                        <div className="candidate-hr_decision-chip">
                            <HrDecisionEditor
                                value={hrDecisionDraft}
                                isEditing={isEditingHrDecision}
                                setIsEditing={setIsEditingHrDecision}
                                onChange={setHrDecisionDraft}
                                onSave={async () => {
                                    await handleSaveHrDecision();
                                    setIsEditingHrDecision(false);
                                }}
                                onCancel={() => {
                                    setIsEditingHrDecision(false);
                                    setHrDecisionDraft(localResult.hr_decision || '');
                                }}
                                hiringDecisions={configData.hiringDecisions}
                            />
                        </div>

                        {/* ✅ 日付とスコアの両方がない場合のみ表示 */}
                        {(!localResult.timestamp && !localResult.preferred_div_score && !localResult.recommended_div_score) && (
                            <button 
                                onClick={handleReEvaluate}
                                className="re-evaluate-button"
                                disabled={isReEvaluating}
                            >
                                {isReEvaluating ? '再評価中...' : '🔄 AI評価を再実行'}
                            </button>
                        )}
                    </div>
                    
                    <button onClick={onClose} className="result-d-close-button-absolute">✖ 閉じる</button>
                </div>

                <StatusBar
                    localResult={localResult}
                    interviewerId={interviewerId}
                    onStatusUpdate={async () => {
                        const refreshed = await fetch(
                            `${appConfig.API_BASE_URL}/resume-result/${localResult.user_id}`,
                            { cache: 'no-store' }
                        );
                        if (refreshed.ok) {
                            const updated = await refreshed.json();
                            setLocalResult(updated);
                            onResultUpdate?.(updated);
                            
                            // ✅ 不合格（内定辞退）なら画面を閉じる
                            if (updated.status === '内定辞退') {
                                setTimeout(() => {
                                    onClose();
                                }, 1000); // 1秒後に自動で閉じる
                            }
                        }
                    }}
                    onOpenReupload={() => setShowReuploadModal(true)}
                    onOpenInterviewFlow={openInterviewFlow}
                    onOpenInterviewPrep={(stage) => {
                        setInterviewStage(stage);
                        setShowInterviewPrepModal(true);
                        setIsPrepLoading(true);

                        setTimeout(() => {
                            refreshChecksheet(stage)
                                .catch((err) => console.warn("checksheet fetch error", err))
                                .finally(() => setIsPrepLoading(false));
                        }, 0);
                    }}
                />
            </div>

            <div className="result-d-detail-split">
                <ScoreDetail localResult={localResult} prefixToName={prefixToName} />

                <ScoreReviewChat
                    chatLog={chatLog}
                    chatInput={chatInput}
                    chatStage={chatStage}
                    isSending={isSending}
                    hasMustCheckFailure={hasMustCheckFailure()}
                    onInputChange={setChatInput}
                    onStageChange={setChatStage}
                    onSend={handleSend}
                />
            </div>
        </div>

        {showInterviewModal && interviewStage && (
            <InterviewSetupSlidePanel
            candidateId={localResult.user_id}
            stage={interviewStage}
            isOpen={showInterviewModal}
            onClose={() => setShowInterviewModal(false)}
            onSubmit={async (data) => {
                try {
                    const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            candidate: localResult.user_id,
                            interviewer: data.interviewer,
                            interviewDate: data.interviewDate,
                            todo: data.todo,
                            candidateMail: data.candidateMail,
                            interviewerMail: data.interviewerMail,
                            stage: interviewStage
                        }),
                    });

                    if (!res.ok) throw new Error(`送信エラー: ${res.status}`);
                    alert("面談メールを送信しました");

                    if (onResultUpdate) {
                        const updatedRes = await fetch(`${appConfig.API_BASE_URL}/resume-result/${localResult.user_id}`, { cache: 'no-store' });
                        const updatedResult = await updatedRes.json();
                        setLocalResult(updatedResult);
                        onResultUpdate(updatedResult);
                    }

                } catch (err: any) {
                    alert(`送信エラー: ${err.message || err.toString()}`);
                } finally {
                    setShowInterviewModal(false);
                }
            }}
            />
        )}

        {showConfirmation && (
            <div className="result-d-confirmation-modal">
            <div className="result-d-confirmation-box">
                <p>このステータスはすでに調整済みです。</p>
                <p>再度日程を調整しますか？</p>
                <div className="result-d-modal-actions">
                <button onClick={() => {
                    setShowConfirmation(false);
                    setShowInterviewModal(true);
                }}>再調整する</button>
                <button onClick={() => setShowConfirmation(false)}>閉じる</button>
                </div>
            </div>
            </div>
        )}

        {showInterviewPrepModal && interviewStage && (
        <InterviewCheckSheetSlidePanel
            key={`${interviewerId}:${localResult.user_id}:${interviewStage}`}
            interviewerId={interviewerId} 
            candidateId={localResult.user_id}
            stage={interviewStage}
            isOpen={showInterviewPrepModal}
            onClose={() => setShowInterviewPrepModal(false)}
            initialData={interviewPrepData[interviewStage] || {}}
            loadingInitial={isPrepLoading}
            onSubmit={async (data) => {
            try {
                const res = await fetch(`${appConfig.API_BASE_URL}/checksheet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interviewer_id: interviewerId,
                    candidate_id: localResult.user_id,
                    stage: stageMap[interviewStage] ?? interviewStage,
                    ...data
                })
                });

                if (!res.ok) throw new Error(`保存に失敗: ${res.status}`);

                setInterviewPrepData((prev: Record<string, any>) => ({
                ...prev,
                [interviewStage]: data,
                }));

                await refreshChecksheet(interviewStage!);
                
                alert("面談シートを保存しました");
            } catch (err: any) {
                alert(err.message || "エラーが発生しました");
            } finally {
                setShowInterviewPrepModal(false);
            }
            }}

            onAiReviewed={(updated: any) => {
            const stage = interviewStage!;

            setLocalResult((prev: Record<string, any>) => ({
                ...prev,
                ...updated,
                [`chat_review_${stage}_at`]: updated[`chat_review_${stage}_at`] ?? new Date().toISOString(),
                [`chat_reviewer_${stage}`]: updated[`chat_reviewer_${stage}`] ?? interviewerId,
            }));

            onResultUpdate?.({
                ...(localResult || {}),
                ...updated,
                [`chat_review_${stage}_at`]: updated[`chat_review_${stage}_at`] ?? new Date().toISOString(),
                [`chat_reviewer_${stage}`]: updated[`chat_reviewer_${stage}`] ?? interviewerId,
            });
            }}
            prefixToName={prefixToName}
        />
        )}

        {showReuploadModal && (
            <div className="reupload-modal-overlay" onClick={() => setShowReuploadModal(false)}>
                <div className="reupload-modal-box" onClick={(e) => e.stopPropagation()}>
                    <h3>📄 履歴書を再アップロードします</h3>
                    <p>履歴書・職務経歴書を再度アップロードしてください</p>
                    
                    <div 
                        className="file-drop-zone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const files = Array.from(e.dataTransfer.files);
                            setReuploadFiles(files);
                        }}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx"
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setReuploadFiles(files);
                            }}
                            style={{ display: 'none' }}
                            id="reupload-input"
                        />
                        <label htmlFor="reupload-input" className="file-drop-label">
                            {reuploadFiles.length > 0 ? (
                                <div>
                                    <p>✅ {reuploadFiles.length}件選択済み</p>
                                    {reuploadFiles.map((f, i) => (
                                        <div key={i} className="file-item">{f.name}</div>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <p>📁 ここにファイルをドロップ</p>
                                    <p>または クリックして選択</p>
                                </div>
                            )}
                        </label>
                    </div>

                    <div className="reupload-modal-actions">
                        <button 
                            onClick={handleFileReupload}
                            disabled={isReuploading || reuploadFiles.length === 0}
                            className="reupload-submit-btn"
                        >
                            {isReuploading ? 'アップロード中...' : 'アップロードして評価'}
                        </button>
                        <button 
                            onClick={() => setShowReuploadModal(false)}
                            className="reupload-cancel-btn"
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isProcessing && (
            <div className="processing-overlay">
                <div className="processing-spinner">
                    <div className="spinner"></div>
                    <p>AI評価を実行中...</p>
                    <p className="warning">⚠️ ページを閉じないでください</p>
                </div>
            </div>
        )}

        </>
    );
};

export default CandidateResultDetail;