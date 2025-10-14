import React, { useState, useEffect } from 'react';
import './CandidateResultDetail.css';
import InterviewSetupSlidePanel from '../InterviewSetupSlidePanel/InterviewSetupSlidePanel.tsx';
import InterviewCheckSheetSlidePanel from '../InterviewCheckSheetSlidePanel/InterviewCheckSheetSlidePanel.tsx';
import appConfig from '../../config.ts';
import HrDecisionEditor from './HrDecisionEditor';
import StatusBar from './StatusBar';
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
}

const CandidateResultDetail: React.FC<Props> = ({ result, onClose, onResultUpdate, interviewerId }) => {
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
    const hasMustCheckFailure = (): boolean => {
        const mustCheck = localResult.must_check || {};
        return Object.values(mustCheck).some((item: any) => item.result === false);
    };
    const [hrDecisionDraft, setHrDecisionDraft] = useState(localResult.hr_decision || '');
    const [isEditingHrDecision, setIsEditingHrDecision] = useState(false);
    
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

    const handleSaveHrDecision = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': interviewerId,  // 認証や更新者記録用
            },
            body: JSON.stringify({
                candidate_id: localResult.user_id,
                review: {
                    decision: hrDecisionDraft,
                    division: localResult.hr_division,
                    title: localResult.hr_title,
                    annual_income: localResult.hr_income,
                }
            }),
            });

            if (!res.ok) throw new Error('保存に失敗しました');

            // 保存後にローカルstateに反映
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
                <div className="result-d-header-row">
                    <div className="result-d-header-info-inline">
                        <div className="icon">
                            👤 <span className="label">候補者:</span> {localResult.user_id}
                        </div>
                        <div className="icon">
                            📌 <span className="label">推奨部門:</span> {localResult.recommended_division}
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
                            />
                        </div>
                    </div>
                    <button onClick={onClose} className="result-d-close-button-absolute">✖ 閉じる</button>
                </div>

                <StatusBar
                    localResult={localResult}
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
                <ScoreDetail localResult={localResult} />

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