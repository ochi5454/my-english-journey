import React, { useState, useEffect } from 'react';
import './CandidateResultDetail.css';
import InterviewSetupSlidePanel from './InterviewSetupSlidePanel.tsx';
import InterviewCheckSheetSlidePanel from './InterviewCheckSheetSlidePanel.tsx';
import appConfig from '../config.ts';

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
    "アップロード",
    "書類選考",
    "面談・1次",
    "面談・2次",
    "最終面談",
    "待遇検討",
    "内定通知",
    "内定受諾",
    "内定辞退"
];

const reviewStages = [
    "アップロード", 
    "書類選考",
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
    interviewerId: string; 
}

const CandidateResultDetail: React.FC<Props> = ({ result, onClose, onResultUpdate, interviewerId }) => {
    const [chatInput, setChatInput] = useState('');
    const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
    const [localResult, setLocalResult] = useState<any>(result);
    const [isSending, setIsSending] = useState(false);
    const [chatStage, setChatStage] = useState<string>('アップロード');
    const [interviewStage, setInterviewStage] = useState<string | null>(null);
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showInterviewPrepModal, setShowInterviewPrepModal] = useState(false);
    const [interviewPrepData, setInterviewPrepData] = useState<Record<string, any>>({});
    const [isPrepLoading, setIsPrepLoading] = useState(false);
    
    useEffect(() => {
        setLocalResult(result);
    }, [result]);

    useEffect(() => {
        if (!interviewStage || !interviewerId || !result?.user_id) return;

        const url = `${appConfig.API_BASE_URL}/checksheet/one?` +
        new URLSearchParams({
            interviewer_id: interviewerId,
            candidate_id: result.user_id,
            stage: interviewStage,
        }).toString();

        fetch(encodeURI(url))
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(block => {
            // 画面ではステージごとに使いたいのでステージ→ブロックの形に寄せる
            setInterviewPrepData(prev => ({ ...prev, [interviewStage]: block })); // ← 変数キーを使う
        })
        .catch(err => console.warn('面談準備取得失敗:', err));
    }, [interviewStage, interviewerId, result?.user_id]); 

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
        const scoreChanges = data.adjusted_score;

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


        if (Array.isArray(scoreChanges) && scoreChanges.length > 0) {
            const updateRes = await fetch(`${appConfig.API_BASE_URL}/update-score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    reviewer_id: interviewerId,
                    stage: chatStage,
                    adjustments: scoreChanges
                }),
            });

            if (updateRes.ok) {
                const updatedResult = await updateRes.json();
                // 既存の localResult に差分を上書き（面談日程など既存フィールドを保護）
                setLocalResult((prev: any) => ({ ...prev, ...updatedResult }));
                onResultUpdate?.({ ...(localResult || {}), ...updatedResult });
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
        setInterviewStage(stage);
        if (isInterviewScheduled(stage)) {
            setShowConfirmation(true);
        } else {
            setShowInterviewModal(true);
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
            <div className="result-d-header-info-inline">
                <div className="icon">
                    👤 <span className="label">候補者:</span> {localResult.user_id}
                </div>
                <div className="icon">
                    📌 <span className="label">推奨部門:</span> {localResult.recommended_division}
                </div>
            </div>
                <button onClick={onClose} className="result-d-close-button-absolute">✖ 閉じる</button>
            <div className="result-d-header">
            </div>

            <div className="result-d-status-header">
            <h3>選考ステータス</h3>
            <div className="status-bar-horizontal-with-info">
            {statusSteps.map((step, idx) => {
                const isActive = localResult.status === step;
                // 完全にステップ完了している状態（＝緑にしたい条件）
                const isStepDone = (
                    (step === 'アップロード' && !!localResult.timestamp) ||
                    (step === '書類選考' && !!localResult.updated_at) || 
                    (reviewStages.includes(step) && !!localResult[`chat_review_${step}_at`]) ||
                    (step === '待遇検討' && !!localResult.hr_review?.updated_at)
                );
                // 日程調整だけ済んでいる状態, 最終面談まで完了し待遇検討待ちの状態（＝青にしたい条件）
                const isScheduled = 
                    (interviewStages.includes(step) && 
                    isInterviewScheduled(step) &&
                    !localResult[`chat_review_${step}_at`]) ||

                    (step === '待遇検討' &&
                        !!localResult.chat_review_最終面談_at &&
                        !localResult.hr_review?.updated_at);

                const handleClick = () => {
                    if (interviewStages.includes(step)) {
                        openInterviewFlow(step);
                    } else if (step === "待遇検討" && !!localResult.chat_review_最終面談_at) {
                        // HRダッシュボードに遷移（候補者IDをクエリで渡す）
                        window.open(`/hr-final-review?filter=${localResult.user_id}`, '_blank');
                    }
                };

                // 🔧 各ステップに対応する reviewer / date 情報をここで取得
                const reviewerKey = `chat_reviewer_${step}`;
                const reviewDateKey = `chat_review_${step}_at`;
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

                        {/* ✅ 面談日程が設定されていれば常に表示 */}
                        {interviewStages.includes(step) && isInterviewScheduled(step) && (
                        <button
                        className="interview-prep-check-button"
                        title="面談シート"
                            onClick={(e) => {
                            e.stopPropagation();
                            const stage = step;
                            setInterviewStage(stage);

                            // 1) 先に開く＆スピナーON（まず描画を優先）
                            setShowInterviewPrepModal(true);
                            setIsPrepLoading(true);

                            // 2) 取得は親だけが行う（子の自動フェッチはさせない）
                            //    ペイントを先に発生させるために次フレームで実行
                            setTimeout(() => {
                                refreshChecksheet(stage)
                                .catch(err => console.warn('checksheet fetch error', err))
                                .finally(() => setIsPrepLoading(false));
                            }, 0);
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
                            {step === "待遇検討" && localResult.hr_review && (
                            <>
                                <div className="line">
                                <span className="label">🗓️</span>
                                <span className="value">{formatDate(localResult.hr_review.updated_at)}</span>
                                </div>
                                <div className="line">
                                <span className="label">🧑</span>
                                <span className="value">{localResult.hr_review.updated_by}</span>
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

            <div className="result-d-detail-split">
            <div className="result-d-detail-left">
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
                    {localResult.scores?.map((s: any) => {
                        if (!Array.isArray(s.score_history)) return (
                            <div key={s.division} className="result-d-score-item">
                                <p><strong>{s.division}</strong>: {s.score}点</p>
                                <p style={{ fontSize: '0.9em', color: '#666' }}>{s.reason}</p>
                            </div>
                        );

                        // 最新スコアに対応する履歴を特定
                        const latestEntry = [...s.score_history].reverse().find(entry => {
                            return (
                                entry.score === s.score &&
                                entry.reason === s.reason
                            );
                        });

                        return (
                            <div key={s.division} className="result-d-score-item">
                                <p><strong>{s.division}</strong>:</p>

                                {/* ✅ 最新スコア */}
                                <div style={{ marginBottom: '10px' }}>
                                    <span>最新スコア: {s.score}点</span><br />
                                    <span style={{ fontSize: '0.9em', color: '#666' }}>理由: {s.reason}</span><br />
                                    {latestEntry && (
                                        <span style={{ fontSize: '0.8em', color: '#999' }}>
                                            by {latestEntry.reviewer || latestEntry.updated_by} at {formatDate(latestEntry.reviewed_at || latestEntry.updated_at)}
                                        </span>
                                    )}
                                </div>

                                {/* ✅ スコア履歴（最新を除く） */}
                                <div>
                                    <h5 style={{ marginBottom: '4px' }}>📜 スコア履歴:</h5>
                                    {[...s.score_history].reverse()
                                        .filter(entry => {
                                            return !(
                                                entry.score === latestEntry?.score &&
                                                entry.reason === latestEntry?.reason &&
                                                (entry.reviewed_at === latestEntry?.reviewed_at || entry.updated_at === latestEntry?.updated_at)
                                            );
                                        })
                                        .map((entry: any, idx: number) => (
                                            <div key={idx} style={{ paddingLeft: '10px', borderLeft: '2px solid #ccc', marginBottom: '5px' }}>
                                                <p style={{ margin: 0 }}>
                                                    <span style={{ textDecoration: 'line-through', color: 'gray' }}>{entry.score}点</span><br />
                                                    <span style={{ fontSize: '0.9em' }}>理由: {entry.reason}</span><br />
                                                    <span style={{ fontSize: '0.8em', color: '#999' }}>
                                                        by {entry.reviewer || entry.updated_by} at {formatDate(entry.reviewed_at || entry.updated_at)}
                                                    </span>
                                                </p>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        );
                    })}
            </div>

            <div className="result-d-detail-right">
                <div className="result-d-chat-header">
                <h4>AIとのスコア精査チャット</h4>
                </div>

                <div className="result-d-chat-box">
                {chatLog.map((msg, i) => (
                    <div key={i} className={`result-d-chat-msg ${msg.role}`}>
                    <strong>{msg.role === 'user' ? '👤' : '🤖'}:</strong> {msg.content}
                    </div>
                ))}
                </div>

                <select
                value={chatStage}
                onChange={(e) => setChatStage(e.target.value)}
                className="result-d-chat-stage-selector"
                >
                {reviewStages.map((stage) => (
                    <option key={stage} value={stage}>
                    {stage}
                    </option>
                ))}
                </select>

                <textarea
                className="result-d-chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="質問・修正依頼を入力..."
                />
                <button onClick={handleSend} disabled={isSending} className="result-d-submit">
                {isSending ? '送信中...' : '送信'}
                </button>
            </div>
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

                    // 🔽 ここで最新の候補者データを取得
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
            // ❗ 常に「空オブジェクト or 実データ」を渡す（undefined は渡さない）
            initialData={interviewPrepData[interviewStage] || {}}
            // スピナーは親が明示
            loadingInitial={isPrepLoading}
            onSubmit={async (data) => {
            try {
                // 保存用API呼び出し
                const res = await fetch(`${appConfig.API_BASE_URL}/checksheet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interviewer_id: interviewerId,
                    candidate_id: localResult.user_id,
                    stage: interviewStage,
                    ...data
                })
                });

                if (!res.ok) throw new Error(`保存に失敗: ${res.status}`);

                // ローカルにも反映
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
                ...updated, // 差分を上書き
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
        />
        )}

        </>
    );
};

export default CandidateResultDetail;