import React, { useState, useEffect } from 'react';
import ResumeInterviewSetupSlidePanel from './ResumeInterviewSetupSlidePanel';
import ResumeInterviewPreparationSlidePanel from './ResumeInterviewPreparationSlidePanel';

const formatDate = (isoStr: string): string => {
    if (!isoStr) return '日時不明';
    const date = new Date(isoStr);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const statusSteps = [
    "書類選考・1次",
    "書類選考・2次",
    "面談・1次",
    "面談・2次",
    "最終面談",
    "待遇検討",
    "内定通知",
    "内定受諾",
    "内定辞退"
];

const reviewStages = [
    "書類選考・1次", 
    "書類選考・2次",
    "面談・1次",
    "面談・2次",
    "最終面談"
];

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

interface Props {
    result: any;
    onClose: () => void;
    onResultUpdate?: (updatedResult: any) => void;
}

const ResumeResultDetail: React.FC<Props> = ({ result, onClose, onResultUpdate }) => {
    const [chatInput, setChatInput] = useState('');
    const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
    const [localResult, setLocalResult] = useState<any>(result);
    const [isSending, setIsSending] = useState(false);
    const [chatStage, setChatStage] = useState<string>('書類選考・1次');
    const [interviewStage, setInterviewStage] = useState<string | null>(null);
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showInterviewPrepModal, setShowInterviewPrepModal] = useState(false);
    const [interviewPrepData, setInterviewPrepData] = useState<Record<string, any>>({});

    useEffect(() => {
        setLocalResult(result);
    }, [result]);

    useEffect(() => {
    if (result?.user_id) {
        fetch(`/interview/prep/${result.user_id}`)
        .then(res => res.json())
        .then(data => {
            if (data && typeof data === 'object') {
            setInterviewPrepData(data);
            }
        })
        .catch(err => {
            console.warn("面談準備データの取得に失敗:", err);
        });
    }
    }, [result?.user_id]);

    const generateContextualMessage = (scores: any[], comment: string): string => {
        const scoreLines = scores.map(s =>
        `【${s.division}】現在スコア: ${s.score}点, 理由: ${s.reason}`
        ).join('\n');
        return `${scoreLines}\n【ユーザーコメント】: ${comment}`;
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
        const res = await fetch('/chat-score-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            candidate_id: localResult.user_id,
            reviewer_id: 'user123', // 動的になるよう後で修正
            messages: apiMessages,
            }),
        });

        if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
        const data = await res.json();
        const aiReply = data.reply || 'AI応答なし';
        const scoreChanges = data.adjusted_score;

        setChatLog(prev => [...prev, { role: 'assistant', content: aiReply }]);

        const now = new Date().toISOString();

        const newChatReviewKey = `chat_review_${chatStage}_at`;
        const newChatReviewerKey = `chat_reviewer_${chatStage}`;

        const updatedLocalResult = {
        ...localResult,
        [newChatReviewKey]: now,
        [newChatReviewerKey]: 'user123'
        };

        setLocalResult(updatedLocalResult);
        if (onResultUpdate) onResultUpdate(updatedLocalResult);


        if (Array.isArray(scoreChanges) && scoreChanges.length > 0) {
            const updateRes = await fetch('/update-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    reviewer_id: 'user123',
                    stage: chatStage,
                    adjustments: scoreChanges  // ← まとめて送る
                }),
            });

            if (updateRes.ok) {
                const updatedResult = await updateRes.json();
                if (onResultUpdate) onResultUpdate(updatedResult);
                setLocalResult(updatedResult);
            } else {
                console.error("複数スコア更新に失敗");
            }
        }

        } catch (err: any) {
        setChatLog(prev => [...prev, {
            role: 'assistant',
            content: `⚠ エラーが発生しました: ${err.message || err.toString()}`
        }]);
        } finally {
        setIsSending(false);
        }
    };

    const interviewStages = ['面談・1次', '面談・2次', '最終面談'];

    const isInterviewScheduled = (stage: string): boolean => {
        const keyMap: Record<string, string> = {
        '面談・1次': 'interview_1_date',
        '面談・2次': 'interview_2_date',
        '最終面談': 'interview_final_date',
        };
        const key = keyMap[stage];
        if (!key) return false;
        return !!localResult[key];
    };

    const openInterviewFlow = (stage: string) => {
        if (!localResult.updated_at) return;
        setInterviewStage(stage);
        if (isInterviewScheduled(stage)) {
        setShowConfirmation(true);
        } else {
        setShowInterviewModal(true);
        }
    };

    const isDocumentReview2Done = !!localResult.updated_at;

    return (
        <>
        <div className="resume-modal-overlay" onClick={onClose}></div>
        <div className="resume-modal">

            <div className="resume-fixed-header">
            <div className="resume-header-info-inline">
                <div className="icon">
                    👤 <span className="label">候補者:</span> {localResult.user_id}
                </div>
                <div className="icon">
                    📌 <span className="label">推奨部門:</span> {localResult.recommended_division}
                </div>
            </div>
                <button onClick={onClose} className="resume-close-button-absolute">✖ 閉じる</button>
            <div className="resume-header">
            </div>

            <div className="resume-status-header">
            <h3>選考ステータス</h3>
            <div className="status-bar-horizontal-with-info">
            {statusSteps.map((step, idx) => {
                const isActive = localResult.status === step;
                // 完全にステップ完了している状態（＝緑にしたい条件）
                const isStepDone = (step === '書類選考・1次' && !!localResult.timestamp) ||
                                (step === '書類選考・2次' && !!localResult.updated_at) || 
                                (reviewStages.includes(step) && !!localResult[`chat_review_${step}_at`]);
                // 日程調整だけ済んでいる状態（＝青にしたい条件）
                const isScheduled = interviewStages.includes(step) && 
                                    isInterviewScheduled(step) &&
                                    !localResult[`chat_review_${step}_at`];

                const handleClick = () => {
                    if (interviewStages.includes(step) && isDocumentReview2Done) {
                        openInterviewFlow(step);
                    }
                };

                // 🔧 各ステップに対応する reviewer / date 情報をここで取得
                const reviewDateKey = step === "書類選考・1次"
                    ? "timestamp"
                    : `chat_review_${step}_at`;
                const reviewerKey = step === "書類選考・1次"
                    ? "uploader_id"
                    : `chat_reviewer_${step}`;
                const reviewDate = localResult[reviewDateKey];
                const reviewer = localResult[reviewerKey];

                return (
                    <div key={idx} className="status-step-container">
                        <div
                            className={`status-step-horizontal 
                                ${isActive ? 'active' : ''} 
                                ${isStepDone ? 'status-done' : ''} 
                                ${isScheduled ? 'interview-scheduled' : ''}`}
                            onClick={handleClick}
                            style={{ position: 'relative' }}
                        >
                            {step}

                            {/* ✅ アイコン表示（青色ステータスのみ） */}
                            {interviewStages.includes(step) && isInterviewScheduled(step) && (
                            <button
                                className="interview-prep-check-button"
                                title="面談準備メモ"
                                onClick={(e) => {
                                    e.stopPropagation();  // ✅ バブリング防止
                                    setInterviewStage(step);
                                    setShowInterviewPrepModal(true);
                                }}
                            >
                                ✅
                            </button>
                            )}

                        </div>

                        {/* 🧩 レビュー情報がなくても空白ボックスで整列 */}
                        <div className="status-extra-info-item-inline">
                            {reviewStages.includes(step) && (
                                <>
                                    <div className="line">
                                        <span className="label">🗓️</span>
                                        <span className="value">{reviewDate ? formatDate(reviewDate) : '-'}</span>
                                    </div>
                                    <div className="line">
                                        <span className="label">🧑</span>
                                        <span className="value">{reviewer || '-'}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
            </div>
            </div>
            </div>

            <div className="resume-detail-split">
            <div className="resume-detail-left">
                <h3>スコア</h3>
                <h4>マスト要件チェック:</h4>
                <ul>
                {localResult.must_check && Object.entries(localResult.must_check).map(([key, val]: any) => (
                    <li key={key} style={{ color: val.result ? 'green' : 'red' }}>
                    {key}: {val.result ? '✅' : '❌'} - {val.reason}
                    </li>
                ))}
                </ul>

                <h4>スコア評価:</h4>
                {localResult.scores?.map((s: any) => (
                    Array.isArray(s.score_history) ? (
                        <div key={s.division} className="resume-score-item">
                            <p><strong>{s.division}</strong>:</p>

                            {/* 最新スコア */}
                            {(() => {
                                const history = [...s.score_history].sort((a: any, b: any) =>
                                    new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime()
                                );
                                const latest = history[0];
                                return (
                                    <div style={{ marginBottom: '10px' }}>
                                        <span>最新スコア: {latest.score}点</span><br />
                                        <span style={{ fontSize: '0.9em', color: '#666' }}>理由: {latest.reason}</span><br />
                                        <span style={{ fontSize: '0.8em', color: '#999' }}>by {latest.reviewer} at {formatDate(latest.reviewed_at)}</span>
                                    </div>
                                );
                            })()}

                            {/* 履歴表示 */}
                            <div className="score-history-log">
                                <h5 style={{ marginBottom: '4px' }}>📜 スコア履歴:</h5>
                                {s.score_history.slice(0, -1).reverse().map((entry: any, idx: number) => (
                                    <div key={idx} style={{ paddingLeft: '10px', borderLeft: '2px solid #ccc', marginBottom: '5px' }}>
                                        <p style={{ margin: 0 }}>
                                            <span style={{ textDecoration: 'line-through', color: 'gray' }}>{entry.score}点</span><br />
                                            <span style={{ fontSize: '0.9em' }}>理由: {entry.reason}</span><br />
                                            <span style={{ fontSize: '0.8em', color: '#999' }}>by {entry.reviewer} at {formatDate(entry.reviewed_at)}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div key={s.division} className="resume-score-item">
                            <p><strong>{s.division}</strong>: {s.score}点</p>
                            <p style={{ fontSize: '0.9em', color: '#666' }}>{s.reason}</p>
                        </div>
                    )
                ))}
            </div>

            <div className="resume-detail-right">
                <div className="resume-chat-header">
                <h4>AIとのスコア精査チャット</h4>
                </div>

                <div className="resume-chat-box">
                {chatLog.map((msg, i) => (
                    <div key={i} className={`resume-chat-msg ${msg.role}`}>
                    <strong>{msg.role === 'user' ? '👤' : '🤖'}:</strong> {msg.content}
                    </div>
                ))}
                </div>

                <select
                value={chatStage}
                onChange={(e) => setChatStage(e.target.value)}
                className="resume-chat-stage-selector"
                >
                {reviewStages.map((stage) => (
                    <option key={stage} value={stage}>
                    {stage}
                    </option>
                ))}
                </select>

                <textarea
                className="resume-chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="質問・修正依頼を入力..."
                />
                <button onClick={handleSend} disabled={isSending} className="resume-submit">
                {isSending ? '送信中...' : '送信'}
                </button>
            </div>
            </div>
        </div>

        {showInterviewModal && interviewStage && (
            <ResumeInterviewSetupSlidePanel
            candidateId={localResult.user_id}
            stage={interviewStage}
            isOpen={showInterviewModal}
            onClose={() => setShowInterviewModal(false)}
            onSubmit={async (data) => {
                try {
                    const res = await fetch('/interview/setup', {
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

                    // 🔽 ここで最新の候補者データを取得
                    if (onResultUpdate) {
                        const updatedRes = await fetch(`/resume-result/${localResult.user_id}`);
                        const updatedResult = await updatedRes.json();
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
            <div className="resume-confirmation-modal">
            <div className="resume-confirmation-box">
                <p>このステータスはすでに調整済みです。</p>
                <p>再度日程を調整しますか？</p>
                <div className="resume-modal-actions">
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
        <ResumeInterviewPreparationSlidePanel
            candidateId={localResult.user_id}
            stage={interviewStage}
            isOpen={showInterviewPrepModal}
            onClose={() => setShowInterviewPrepModal(false)}
            initialData={interviewPrepData[interviewStage]}
            onSubmit={async (data) => {
            try {
                // 保存用API呼び出し
                const res = await fetch('/interview/prep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interviewer_id: 'user123', // 動的になるよう後で修正
                    candidate_id: localResult.user_id,
                    stage: interviewStage,
                    ...data
                })
                });

                if (!res.ok) throw new Error(`保存に失敗: ${res.status}`);

                // ローカルにも反映
                setInterviewPrepData(prev => ({
                ...prev,
                [interviewStage]: data
                }));

                alert("面談準備を保存しました");
            } catch (err: any) {
                alert(err.message || "エラーが発生しました");
            } finally {
                setShowInterviewPrepModal(false);
            }
            }}
            // 2025.8.12 Add（candidate score update after interview）START
            onAiReviewed={(updated: any) => {
                // もしバックエンドが stamp を返していない場合に備えて保険をかける
                const stage = interviewStage!;
                const patched = {
                    ...updated,
                    [`chat_review_${stage}_at`]: updated[`chat_review_${stage}_at`] ?? new Date().toISOString(),
                    [`chat_reviewer_${stage}`]: updated[`chat_reviewer_${stage}`] ?? 'user123',
                };
                setLocalResult(patched);
                onResultUpdate?.(patched);
            }}
            // 2025.8.12 Add（candidate score update after interview）END
        />
        )}

        </>
    );
};

export default ResumeResultDetail;