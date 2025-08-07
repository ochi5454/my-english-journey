import React, { useState, useEffect } from 'react';
import ResumeInterviewSetupSlidePanel from './ResumeInterviewSetupSlidePanel';

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
    const [showInterviewModal, setShowInterviewModal] = useState(false);

    useEffect(() => {
        setLocalResult(result);
    }, [result]);

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
                    reviewer_id: 'user123',
                    messages: apiMessages,
                }),
            });

            if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
            const data = await res.json();
            const aiReply = data.reply || 'AI応答なし';
            const scoreChange = data.adjusted_score;

            setChatLog(prev => [...prev, { role: 'assistant', content: aiReply }]);

            if (scoreChange) {
                const updateRes = await fetch('/update-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        candidate_id: localResult.user_id,
                        division: scoreChange.division,
                        score: scoreChange.score,
                        reason: scoreChange.reason,
                        reviewer_id: 'user123',
                    }),
                });

                if (updateRes.ok) {
                    const updatedResult = await updateRes.json();
                    if (onResultUpdate) onResultUpdate(updatedResult);
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

    const isDocumentReview2Done = !!localResult.updated_at;

    return (
        <>
            <div className="resume-modal-overlay" onClick={onClose}></div>
            <div className="resume-modal">
                <div className="resume-fixed-header">
                    <button onClick={onClose} className="resume-close-button-absolute">✖ 閉じる</button>
                    <div className="resume-header">
                        <div className="resume-header-info">
                            <h3>候補者: {localResult.user_id}</h3>
                            <p>推奨部門: {localResult.recommended_division}</p>
                        </div>
                    </div>

                    <div className="resume-status-header">
                        <h3>選考ステータス</h3>
                        <div className="status-bar-horizontal">
                            {statusSteps.map((step, idx) => {
                                const isActive = localResult.status === step;
                                const isStepDone =
                                    (step === '書類選考・1次' && !!localResult.timestamp) ||
                                    (step === '書類選考・2次' && !!localResult.updated_at);

                                const handleClick = () => {
                                    if (step === '面談・1次' && isDocumentReview2Done) {
                                        setShowInterviewModal(true);
                                    }
                                };

                                return (
                                    <div
                                        key={idx}
                                        className={`status-step-horizontal ${isActive ? 'active' : ''} ${isStepDone ? 'status-done' : ''}`}
                                        onClick={handleClick}
                                    >
                                        {step}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="status-extra-info-box">
                            {localResult.timestamp && (
                                <div className="status-extra-info-item">
                                    <div className="line">
                                        <span className="label">📅</span>
                                        <span className="value">{formatDate(localResult.timestamp)}</span>
                                    </div>
                                    <div className="line">
                                        <span className="label">👤</span>
                                        <span className="value">{localResult.uploader_id || '不明'}</span>
                                    </div>
                                </div>
                            )}
                            {localResult.updated_at && (
                                <div className="status-extra-info-item">
                                    <div className="line">
                                        <span className="label">📅</span>
                                        <span className="value">{formatDate(localResult.updated_at)}</span>
                                    </div>
                                    <div className="line">
                                        <span className="label">👤</span>
                                        <span className="value">{localResult.updated_by || '不明'}</span>
                                    </div>
                                </div>
                            )}
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
                        {Array.isArray(localResult.scores) && localResult.scores.map((s: any) => {
                            const hasSecondReview = s.second_reviewer && s.second_reviewed_at;
                            const originalScore = s.original_score ?? s.score;
                            const originalReason = s.original_reason ?? s.reason;
                            const isChanged = hasSecondReview && s.score !== originalScore;

                            return (
                                <div key={s.division} className="resume-score-item">
                                    <p><strong>{s.division}</strong>:</p>
                                    <p>
                                        <span>1次スコア: {originalScore}点</span><br />
                                        <span style={{ fontSize: '0.9em', color: '#666' }}>理由: {originalReason}</span>
                                    </p>
                                    {isChanged && (
                                        <div style={{ marginTop: '4px', paddingLeft: '10px', borderLeft: '2px solid #ccc' }}>
                                            <p>
                                                <span style={{ textDecoration: 'line-through', color: 'gray' }}>{originalScore}点</span>
                                                → <span style={{ color: 'blue' }}>{s.score}点</span>
                                            </p>
                                            <p style={{ fontSize: '0.9em', color: '#333' }}>
                                                修正理由: {s.reason}
                                            </p>
                                            <p style={{ fontSize: '0.85em', color: '#888' }}>
                                                修正担当: {s.second_reviewer}（{formatDate(s.second_reviewed_at)}）
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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

            {showInterviewModal && (
                <ResumeInterviewSetupSlidePanel
                candidateId={localResult.user_id}
                isOpen={showInterviewModal}
                onClose={() => setShowInterviewModal(false)}
                onSubmit={async (data) => {
                    try {
                    const res = await fetch('/interview/setup', {
                        method: 'POST',
                        headers: {
                        'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                        candidate: localResult.user_id,
                        interviewer: data.interviewer,
                        interviewDate: data.interviewDate,
                        todo: data.todo,
                        candidateMail: data.candidateMail,
                        interviewerMail: data.interviewerMail
                        })
                    });

                    if (!res.ok) throw new Error(`送信エラー: ${res.status}`);

                    const result = await res.json();
                    console.log('✅ メール送信成功:', result.message);

                    alert("面談メールを送信しました");

                    } catch (err: any) {
                    console.error("⚠ 面談送信失敗:", err);
                    alert(`送信エラー: ${err.message || err.toString()}`);
                    } finally {
                    setShowInterviewModal(false);
                    }
                }}
                />
            )}
        </>
    );
};

export default ResumeResultDetail;