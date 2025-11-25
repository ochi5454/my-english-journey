import React, { useState, useEffect, useRef } from "react";
import appConfig from "../../config";
import DivisionSelect from "./DivisionSelect";
import ResumeReuploadModal from "./ResumeReuploadModal";
import InterviewPrepPanelV2 from "./InterviewPrepPanelV2";
import ScoreReviewChatV2 from "./ScoreReviewChatV2";
import { statusSteps } from "./VerticalStatusBar";
import "./StatusContentPanel.css";

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

interface Props {
    selectedStage: string;
    localResult: any;
    interviewerId: string;
    onResultUpdate: () => void;
    onOpenInterviewFlow: (stage: string) => void;
    onOpenInterviewPrep: (stage: string) => void;
    onOpenReupload: () => void;
    chatLogByCandidate: Record<string, ChatMessage[]>;
    onChatLogChange: (candidateId: string, newLog: ChatMessage[]) => void;
    uploadDivision: string;
    onUploadDivisionChange: (newDiv: string) => void;
}

const StatusContentPanel: React.FC<Props> = ({
    selectedStage,
    localResult,
    interviewerId,
    onResultUpdate,
    onOpenInterviewFlow,
    onOpenInterviewPrep,
    onOpenReupload,
    chatLogByCandidate,
    onChatLogChange,
    uploadDivision,
    onUploadDivisionChange,
}) => {
    const [chatInput, setChatInput] = useState("");
    const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [processingStage, setProcessingStage] = useState<string | null>(null);
    const [selectedDivision, setSelectedDivision] = useState<string>("");
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [showReuploadModal, setShowReuploadModal] = useState(false);

    // フローティングチャット関連のstate
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const [chatPosition, setChatPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    // 部門マッピング (prefix -> 日本語名)
    const [divisionMap, setDivisionMap] = useState<Record<string, string>>({});

    // 面接準備データ
    const [interviewPrepData, setInterviewPrepData] = useState<any>(null);
    const [isLoadingInterviewData, setIsLoadingInterviewData] = useState(false);

    // 面接設定フォームデータ
    const [interviewDate, setInterviewDate] = useState('');
    const [interviewerList, setInterviewerList] = useState<Array<{name: string; email: string}>>([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState('');
    const [todoList, setTodoList] = useState<Array<{id: string; label: string}>>([]);
    const [selectedTodos, setSelectedTodos] = useState<string[]>([]);
    const [candidateMail, setCandidateMail] = useState('');
    const [interviewerMail, setInterviewerMail] = useState('');
    const [candidateName, setCandidateName] = useState('');

    // 待遇検討フォームデータ
    const [compensationConfig, setCompensationConfig] = useState<any>(null);
    const [hrDecision, setHrDecision] = useState('');
    const [recommendedDivision, setRecommendedDivision] = useState('');
    const [recommendedTitle, setRecommendedTitle] = useState('');
    const [payType, setPayType] = useState('');
    const [employmentType, setEmploymentType] = useState('');

    // 最後にロードした候補者IDを追跡（useRefで管理して再レンダリングを防ぐ）
    const lastLoadedCandidateIdRef = useRef<string | null>(null);

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

    // チャットログを候補者IDに基づいて初期化（候補者が変わった時のみ1回だけ）
    useEffect(() => {
        const candidateId = localResult?.user_id;

        // 候補者が変わった時のみ実行（親のchatLogByCandidateの変更は無視）
        if (candidateId && candidateId !== lastLoadedCandidateIdRef.current) {
            console.log(`✅ チャットログ初期化: ${candidateId}`);
            const existingLog = chatLogByCandidate[candidateId] || [];
            console.log(`📥 チャットログをロード (${existingLog.length}件)`);
            setChatLog(existingLog);
            lastLoadedCandidateIdRef.current = candidateId;
        }
    }, [localResult?.user_id]);

    // チャットログ更新時に自動スクロール
    useEffect(() => {
        if (chatEndRef.current && !isChatMinimized) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatLog, isChatMinimized]);

    // prefixを日本語部門名に変換
    const getDivisionName = (prefix: string): string => {
        return divisionMap[prefix] || prefix;
    };

    const interviewStages = ["web面談", "1次面談", "2次面談"];

    // 面接設定の設定データを取得
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/interview/config`)
            .then(res => res.json())
            .then(data => {
                setInterviewerList(data.interviewers || []);
                setTodoList(data.todos || []);
                setCandidateMail(data.email_templates?.to_candidate?.body || '');
                setInterviewerMail(data.email_templates?.to_interviewer?.body || '');
            })
            .catch(err => console.error('面接設定取得エラー:', err));
    }, []);

    // 待遇検討の設定データを取得
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`, {
            headers: { 'x-user-id': interviewerId }
        })
            .then(res => res.json())
            .then(data => {
                setCompensationConfig(data);
            })
            .catch(err => console.error('待遇検討設定取得エラー:', err));
    }, [interviewerId]);

    // 待遇検討フォームの初期化
    useEffect(() => {
        if (!localResult) return;

        setHrDecision(localResult.hr_decision || "");
        setRecommendedDivision(localResult.hr_division || "");
        setRecommendedTitle(localResult.hr_title || "");
        setPayType(localResult.hr_pay_type || "");
        setEmploymentType(localResult.hr_employment_type || "");

    }, [localResult]);

    // 候補者名を取得
    useEffect(() => {
        if (localResult?.user_id) {
            const name = localResult.user_name || localResult.name || localResult.user_id;
            setCandidateName(name);
        }
    }, [localResult]);

    // 候補者が変わったら、そのIDに対応するチャットログを復元
    useEffect(() => {
        if (localResult?.user_id) {
            const savedLog = chatLogByCandidate[localResult.user_id] || [];
            setChatLog(savedLog);
        }
    }, [localResult?.user_id, chatLogByCandidate]);

    // 選択部門とアップロード部門を同期
    useEffect(() => {
        setSelectedDivision(uploadDivision);
    }, [uploadDivision]);

    // 選択部門が変わったら親に通知（3箇所連動）
    const handleDivisionChange = (newDiv: string) => {
        setSelectedDivision(newDiv);
        onUploadDivisionChange(newDiv);
    };

    // 面接ステージが選択された時に面接データを取得
    useEffect(() => {
        if (interviewStages.includes(selectedStage) && localResult?.user_id) {
            fetchInterviewData(selectedStage);
        } else {
            setInterviewPrepData(null);
        }
    }, [selectedStage, localResult?.user_id]);

    // 面接準備データの取得
    const fetchInterviewData = async (stage: string) => {
        setIsLoadingInterviewData(true);

        // 日本語ステージ → API用ステージへ変換
        const stageMap: Record<string, string> = {
            "web面談": "interview_1",
            "1次面談": "interview_2",
            "2次面談": "interview_final",
        };
        const apiStage = stageMap[stage] || stage;

        try {
            const res = await fetch(
                `${appConfig.API_BASE_URL}/checksheet/one?interviewer_id=${interviewerId}&candidate_id=${localResult.user_id}&stage=${apiStage}`
            );
            if (res.ok) {
                const data = await res.json();
                setInterviewPrepData(data);
            } else {
                setInterviewPrepData({});
            }
        } catch (err) {
            console.error("面接データ取得エラー:", err);
            setInterviewPrepData({});
        } finally {
            setIsLoadingInterviewData(false);
        }
    };

    // 面接準備データの保存
    const handleInterviewPrepSubmit = async (data: any) => {
        try {
            const payload = {
                interviewer_id: interviewerId,
                candidate_id: localResult.user_id,
                stage: selectedStage,
                ...data,
            };

            const res = await fetch(`${appConfig.API_BASE_URL}/checksheet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('保存に失敗しました');

            alert('面接シートを保存しました');
            // データを再取得
            await fetchInterviewData(selectedStage);
            onResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    // テンプレートのレンダリング
    const renderTemplate = (template: string): string => {
        const mapping: Record<string, string> = {
            candidate_name: candidateName,
            interview_date: interviewDate || '',
            interviewer_name: selectedInterviewer || '',
        };
        return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => mapping[key] || '');
    };

    // 面接設定の送信
    const handleInterviewSkip = async () => {
        if (!confirm(`${selectedStage}を省略して次のステージに進みますか？`)) {
            return;
        }

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/interview/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    stage: selectedStage,
                }),
            });

            if (!res.ok) throw new Error('面談省略に失敗しました');

            const data = await res.json();
            alert(`${selectedStage}を省略しました。次のステージ: ${data.next_stage}`);
            onResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    const handleInterviewSetupSubmit = async () => {
        if (!interviewDate || !selectedInterviewer) {
            alert('日程と担当者は必須です');
            return;
        }

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate: localResult.user_id,
                    candidateName: candidateName,
                    interviewDate,
                    interviewer: selectedInterviewer,
                    todo: selectedTodos.join(', '),
                    candidateMail: renderTemplate(candidateMail),
                    interviewerMail: renderTemplate(interviewerMail),
                    stage: selectedStage,
                }),
            });

            if (!res.ok) throw new Error('面談設定の保存に失敗しました');

            console.log('面談設定を保存しました');

            // ---- 面談シートを表示させる処理 ----
            await fetchInterviewData(selectedStage);
            onResultUpdate();

            // ---- フォーム初期化 ----
            setInterviewDate('');
            setSelectedInterviewer('');
            setSelectedTodos([]);

        } catch (err) {
            console.error(err);

            // 🔥 テストモードのため保存失敗しても面談準備画面へ進める
            alert("メール送信は未実装のため保存できませんが、面談準備画面に進みます。");

            // モックとして localResult に面談日時を差し込む
            const key =
                selectedStage === "web面談"
                    ? "interview_1_date"
                    : selectedStage === "1次面談"
                    ? "interview_2_date"
                    : "interview_final_date";

            localResult[key] = interviewDate || "mock";

            await fetchInterviewData(selectedStage);
            onResultUpdate();
        }
    };

    // 待遇検討の送信
    const handleCompensationSubmit = async () => {
        if (!hrDecision) {
            alert('採用可否を選択してください');
            return;
        }

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
                        decision: hrDecision,
                        division: recommendedDivision, 
                        title: recommendedTitle,
                        pay_type: payType,
                        employment_type: employmentType,
                    }
                }),
            });

            if (!res.ok) throw new Error('待遇検討の保存に失敗しました');

            alert('待遇検討を保存しました');
            onResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    const hasMustCheckFailure = (): boolean => {
        const mustCheck = localResult.must_check || {};
        return Object.values(mustCheck).some((item: any) => item.result === false);
    };

    const isInterviewScheduled = (stage: string): boolean => {
        const keyMap: Record<string, string> = {
            "web面談": "interview_1_date",
            "1次面談": "interview_2_date",
            "2次面談": "interview_final_date",
        };
        const key = keyMap[stage];
        if (!key) return false;
        return !!localResult[key];
    };

    const handleAIEvaluation = async () => {
        if (!selectedDivision) {
            alert('希望部門を選択してください');
            return;
        }

        setIsEvaluating(true);
        try {
            // AI評価を実行（新規エンドポイントを使用）
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-ai-evaluation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    preferred_division: selectedDivision,
                    reviewer_id: interviewerId,
                }),
            });

            const data = await res.json();

            // 履歴書が見つからない場合は再アップロードモーダルを表示
            if (data.needs_reupload) {
                setShowReuploadModal(true);
                setIsEvaluating(false);
                return;
            }

            if (!res.ok) {
                throw new Error(data.detail || 'AI評価に失敗しました');
            }

            alert('AI評価が完了しました');
            onResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        } finally {
            setIsEvaluating(false);
        }
    };

    const handleReuploadSuccess = () => {
        setShowReuploadModal(false);
        onResultUpdate();
    };

    const handleDocumentReview = async (isPassed: boolean) => {
        setProcessingStage('書類選考');

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-document-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    reviewer_id: interviewerId,
                    is_passed: isPassed,
                }),
            });

            if (!res.ok) throw new Error('書類選考の更新に失敗しました');

            alert(isPassed ? '書類選考を合格にしました' : '書類選考を不合格にしました');
            onResultUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        } finally {
            setProcessingStage(null);
        }
    };

    const generateContextualMessage = (scores: any[], comment: string): string => {
        const scoreLines = scores.map(s =>
            `【${s.division}】現在スコア: ${s.score}点, 理由: ${s.reason}`
        ).join('\n');
        return `${scoreLines}\n【ユーザーコメント】: ${comment}`;
    };

    // ドラッグ開始
    const handleDragStart = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - chatPosition.x,
            y: e.clientY - chatPosition.y
        });
    };

    // ドラッグ中
    const handleDragMove = (e: MouseEvent) => {
        if (isDragging) {
            setChatPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    // ドラッグ終了
    const handleDragEnd = () => {
        setIsDragging(false);
    };

    // グローバルイベントリスナー
    React.useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            return () => {
                window.removeEventListener('mousemove', handleDragMove);
                window.removeEventListener('mouseup', handleDragEnd);
            };
        }
    }, [isDragging, dragOffset]);

    const handleSendChat = async () => {
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
            const recommendedDivision = data.recommended_division;
            const decision = data.decision;

            setChatLog(prev => [...prev, { role: 'assistant', content: aiReply }]);

            // 永続化
            if (localResult?.user_id) {
                onChatLogChange(localResult.user_id, [...updatedChatLog, { role: 'assistant', content: aiReply }]);
            }

            // 合格・不合格の判定処理
            if (decision && localResult?.user_id) {

                // 🌟 書類選考だけは専用の candidate-document-review を呼ぶ
                if (selectedStage === "書類選考") {
                    try {
                        const res = await fetch(`${appConfig.API_BASE_URL}/candidate-document-review`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                candidate_id: localResult.user_id,
                                reviewer_id: interviewerId,
                                is_passed: decision === '合格'
                            })
                        });

                        if (!res.ok) throw new Error('書類選考の更新に失敗しました');

                        console.log(`📄 書類選考: ${decision} を反映しました`);
                        onResultUpdate();
                    } catch (err) {
                        console.error('⚠ 書類選考のステータス更新失敗:', err);
                    }

                    return; // ← 書類選考はここで終わり。他の処理を続けない
                }

                // 🌟 ここから先は書類選考以外 → /update-status を使う
                let newStage: string;

                if (decision === '不合格') {
                    newStage = '不合格';
                } else {
                    const currentStageIndex = statusSteps.indexOf(selectedStage);
                    if (currentStageIndex !== -1 && currentStageIndex + 1 < statusSteps.length) {
                        newStage = statusSteps[currentStageIndex + 1];
                    } else {
                        newStage = '待遇検討'; // デフォルト
                    }
                }

                try {
                    await fetch(`${appConfig.API_BASE_URL}/update-status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: localResult.user_id,
                            stage: newStage,
                            reviewer_id: interviewerId,
                        }),
                    });
                    console.log(`✅ ${decision}処理完了: ${newStage}に更新`);
                } catch (err) {
                    console.error('⚠ ステータス更新失敗:', err);
                }
            }

            // スコア更新 or 推奨部門更新（どちらかがあれば実行）
            if ((shouldUpdate && scoreChangesArray.length > 0) || recommendedDivision) {
                const updatePayload: any = {
                    candidate_id: localResult.user_id,
                    reviewer_id: interviewerId,
                    stage: '書類選考',
                    adjustments: scoreChangesArray.length > 0 ? scoreChangesArray : [],
                };

                if (recommendedDivision) {
                    updatePayload.recommended_division = recommendedDivision;
                }

                const updateRes = await fetch(`${appConfig.API_BASE_URL}/update-score`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload),
                });

                if (updateRes.ok) {
                    // DB更新が確実に反映されるように少し待ってから再取得
                    await new Promise(resolve => setTimeout(resolve, 300));
                    onResultUpdate();
                    console.log('✅ 更新完了:', { スコア: scoreChangesArray.length, 推奨部門: recommendedDivision });
                } else {
                    const errorText = await updateRes.text();
                    console.error('⚠ 更新失敗:', errorText);
                }
            } else if (decision) {
                // 判定のみの場合も再取得
                await new Promise(resolve => setTimeout(resolve, 300));
                onResultUpdate();
            }
        } catch (err: any) {
            const errorChatLog = [
                ...updatedChatLog,
                { role: 'assistant' as const, content: `⚠ エラーが発生しました: ${err.message || err.toString()}` },
            ];
            setChatLog(errorChatLog);

            // 永続化
            if (localResult?.user_id) {
                onChatLogChange(localResult.user_id, errorChatLog);
            }
        } finally {
            setIsSending(false);
        }
    };

    // 各ステージごとのコンテンツをレンダリング
    const renderContent = () => {
        // アップロード
        if (selectedStage === "アップロード") {
            return (
                <div className="stage-content">
                    <h3>📄 アップロード情報</h3>
                    <div className="info-section">
                        <div className="info-row">
                            <span className="label">アップロード日時:</span>
                            <span className="value">
                                {localResult.timestamp
                                    ? new Date(localResult.timestamp).toLocaleString('ja-JP')
                                    : '未設定'}
                            </span>
                        </div>
                        <div className="info-row">
                            <span className="label">アップロード者:</span>
                            <span className="value">{localResult.uploader_id || '-'}</span>
                        </div>
                    </div>
                    <button
                        className="action-button primary"
                        onClick={onOpenReupload}
                    >
                        📤 ファイルを再アップロード
                    </button>
                </div>
            );
        }

        // 書類選考
        if (selectedStage === "書類選考") {
            // スコアがあるかどうか
            const hasScores = localResult.scores && localResult.scores.length > 0;

            // 書類選考が完了しているかどうか（ステータスが「書類選考」以外、または合格・不合格の判定がある）
            const isDocumentReviewCompleted =
                (localResult.status && localResult.status !== "アップロード" && localResult.status !== "書類選考") ||
                !!localResult.document_review_date;

            return (
                <div className="stage-content-split-container">
                    <div className="stage-content-left">
                    <h3>📋 書類選考</h3>

                    {/* AI評価前：AIスコアがない場合 */}
                    {!hasScores && !isDocumentReviewCompleted && (
                        <div className="action-section">
                            <p>希望部門を選択してAI評価を実施してください:</p>
                            <div className="division-select-group">
                                <DivisionSelect
                                    value={selectedDivision}
                                    onChange={handleDivisionChange}
                                    disabled={isEvaluating}
                                    className="division-select"
                                    placeholder="希望部門を選択"
                                />
                                <button
                                    onClick={handleAIEvaluation}
                                    disabled={!selectedDivision || isEvaluating}
                                    className="action-button primary"
                                >
                                    {isEvaluating ? '評価中...' : '🤖 AI評価を実行'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AI評価後、合格・不合格未選択：スコアがあり、まだ判定していない場合 */}
                    {hasScores && !isDocumentReviewCompleted && (
                        <div className="action-section">
                            <p>AI評価が完了しました。書類選考の結果を選択してください:</p>
                            <div className="button-group">
                                <button
                                    onClick={() => handleDocumentReview(true)}
                                    disabled={processingStage === '書類選考'}
                                    className="action-button success"
                                >
                                    ✅ 合格
                                </button>
                                <button
                                    onClick={() => handleDocumentReview(false)}
                                    disabled={processingStage === '書類選考'}
                                    className="action-button danger"
                                >
                                    ❌ 不合格
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 審査完了：合格または不合格が選択された場合 */}
                    {isDocumentReviewCompleted && (
                        <div className="info-section">
                            <div className="info-row">
                                <span className="label">審査日:</span>
                                <span className="value">
                                    {localResult.document_review_date
                                        ? new Date(localResult.document_review_date).toLocaleString('ja-JP')
                                        : '-'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="label">審査者:</span>
                                <span className="value">
                                    {localResult.document_review_reviewer || '-'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="label">結果:</span>
                                <span className="value" style={{
                                    fontWeight: 600,
                                    color: localResult.status === '不合格' ? '#dc3545' : '#28a745'
                                }}>
                                    {localResult.status === '不合格' ? '❌ 不合格' : '✅ 合格'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* スコア結果表示 */}
                    {hasScores && (
                        <div className="score-results-section">
                            <h4>📊 AI評価結果</h4>

                            {/* 推薦部門（一番上に表示） */}
                            {localResult.recommended_division && (
                                <div className="recommended-section">
                                    <span className="label">🏆 推薦部門:</span>
                                    <span className="value recommended">{getDivisionName(localResult.recommended_division)}</span>
                                </div>
                            )}

                            {/* 志望動機サマリ */}
                            <div className="summary-section">
                                <h5>🧭 志望動機サマリ</h5>
                                <div className="summary-content">
                                    <p className="summary-text">
                                        {localResult.notes || '（志望動機サマリは登録されていません）'}
                                    </p>
                                    {localResult.score_notes && (
                                        <div className="summary-score">
                                            <span className="score-label">評価:</span>
                                            <span className="score-value">{localResult.score_notes}点</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 職務経歴サマリ */}
                            <div className="summary-section">
                                <h5>💼 職務経歴サマリ</h5>
                                <div className="summary-content">
                                    <p className="summary-text">
                                        {localResult.work_summary || '（職務経歴サマリは登録されていません）'}
                                    </p>
                                    {localResult.score_work && (
                                        <div className="summary-score">
                                            <span className="score-label">評価:</span>
                                            <span className="score-value">{localResult.score_work}点</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 必須チェック項目 */}
                            {localResult.must_check && Object.keys(localResult.must_check).length > 0 && (
                                <div className="must-check-section">
                                    <h5>☑️ 必須要件</h5>
                                    {Object.entries(localResult.must_check).map(([item, data]: [string, any]) => (
                                        <div key={item} className={`check-item ${data.result ? 'pass' : 'fail'}`}>
                                            <span className="check-icon">{data.result ? '✅' : '❌'}</span>
                                            <div className="check-content">
                                                <div className="check-name">{item}</div>
                                                <div className="check-reason">{data.reason}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 部門別スコア（履歴付き） */}
                            <div className="division-scores-section">
                                <h5>🎯 部門別スコア</h5>
                                {localResult.scores.map((score: any) => {
                                    const divisionName = getDivisionName(score.division);
                                    const hasHistory = Array.isArray(score.score_history) && score.score_history.length > 0;

                                    // 最新スコアに対応する履歴を特定
                                    let latestEntry = null;
                                    if (hasHistory) {
                                        latestEntry = [...score.score_history].reverse().find(
                                            (entry: any) => entry.score === score.score && entry.reason === score.reason
                                        );
                                    }

                                    return (
                                        <div key={score.division} className="score-card">
                                            <div className="score-header">
                                                <span className="division-name">{divisionName}</span>
                                                <span className="score-value">{score.score}点</span>
                                            </div>
                                            <div className="score-reason">{score.reason}</div>

                                            {latestEntry && (
                                                <div className="score-metadata">
                                                    <span className="score-reviewer">
                                                        by {latestEntry.reviewer || latestEntry.updated_by}
                                                    </span>
                                                    <span className="score-date">
                                                        {new Date(latestEntry.reviewed_at || latestEntry.updated_at).toLocaleString('ja-JP')}
                                                    </span>
                                                </div>
                                            )}

                                            {/* スコア履歴 */}
                                            {hasHistory && score.score_history.length > 1 && (
                                                <div className="score-history">
                                                    <h6>📜 スコア履歴:</h6>
                                                    {[...score.score_history]
                                                        .reverse()
                                                        .filter((entry: any) =>
                                                            !(
                                                                entry.score === latestEntry?.score &&
                                                                entry.reason === latestEntry?.reason &&
                                                                (entry.reviewed_at === latestEntry?.reviewed_at ||
                                                                 entry.updated_at === latestEntry?.updated_at)
                                                            )
                                                        )
                                                        .map((entry: any, idx: number) => (
                                                            <div key={idx} className="history-item">
                                                                <div className="history-score">{entry.score}点</div>
                                                                <div className="history-reason">{entry.reason}</div>
                                                                <div className="history-metadata">
                                                                    <span>by {entry.reviewer || entry.updated_by}</span>
                                                                    <span>{new Date(entry.reviewed_at || entry.updated_at).toLocaleString('ja-JP')}</span>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>

                    {/* 右側ペイン: AIスコア精査チャット */}
                    <div className="stage-content-right">
                        <ScoreReviewChatV2
                            chatLog={chatLog}
                            chatInput={chatInput}
                            isSending={isSending}
                            hasMustCheckFailure={hasMustCheckFailure()}
                            onInputChange={setChatInput}
                            onSend={handleSendChat}
                        />
                    </div>
                </div>
            );
        }

        // 面談ステージ (web面談、1次面談、2次面談)
        if (interviewStages.includes(selectedStage)) {
            const scheduled = isInterviewScheduled(selectedStage);

            return (
                <div className="stage-content interview-stage">
                    {/* 面談未セットアップ時：面接設定フォームをインライン表示 */}
                    {!scheduled && (
                        <div className="interview-setup-inline">
                            <h3>🎤 {selectedStage} の面談設定</h3>

                            <div className="interview-setup-form">
                                <div className="interview-setup-field">
                                    <label>面談日時:</label>
                                    <input
                                        type="datetime-local"
                                        value={interviewDate}
                                        onChange={(e) => setInterviewDate(e.target.value)}
                                    />
                                </div>

                                <div className="interview-setup-field">
                                    <label>面談担当者:</label>
                                    <select
                                        value={selectedInterviewer}
                                        onChange={(e) => setSelectedInterviewer(e.target.value)}
                                    >
                                        <option value="">選択してください</option>
                                        {interviewerList.map(i => (
                                            <option key={`${i.email}_${i.name}`} value={i.name}>
                                                {i.name}（{i.email}）
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="interview-setup-field">
                                    <label>面談前TODO:</label>
                                    <div className="setup-todo-list">
                                        {todoList.map(item => (
                                            <div key={item.id} className="setup-todo-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTodos.includes(item.label)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedTodos([...selectedTodos, item.label]);
                                                        } else {
                                                            setSelectedTodos(selectedTodos.filter(t => t !== item.label));
                                                        }
                                                    }}
                                                />
                                                <span>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="interview-setup-field">
                                    <label>候補者宛メールテンプレート:</label>
                                    <textarea
                                        rows={4}
                                        value={candidateMail}
                                        onChange={(e) => setCandidateMail(e.target.value)}
                                    />
                                    <p className="template-preview-label">📧 プレビュー:</p>
                                    <div className="template-preview">{renderTemplate(candidateMail)}</div>
                                </div>

                                <div className="interview-setup-field">
                                    <label>担当者宛メールテンプレート:</label>
                                    <textarea
                                        rows={4}
                                        value={interviewerMail}
                                        onChange={(e) => setInterviewerMail(e.target.value)}
                                    />
                                    <p className="template-preview-label">📧 プレビュー:</p>
                                    <div className="template-preview">{renderTemplate(interviewerMail)}</div>
                                </div>

                                <div className="interview-setup-actions">
                                    <button
                                        onClick={handleInterviewSetupSubmit}
                                        className="action-button primary"
                                    >
                                        送信
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 面談がセットアップ済みの場合、面接準備パネルを表示 */}
                    {scheduled && (
                        <>
                            {isLoadingInterviewData ? (
                                <div className="loading-section">
                                    <p>面接データを読み込み中...</p>
                                </div>
                            ) : (
                                <InterviewPrepPanelV2
                                    interviewerId={interviewerId}
                                    candidateId={localResult.user_id}
                                    stage={selectedStage}
                                    onSubmit={handleInterviewPrepSubmit}
                                    initialData={interviewPrepData}
                                    prefixToName={divisionMap}
                                    onSkip={handleInterviewSkip}
                                    onAiReviewed={(updatedResult) => {
                                        console.log('AI精査完了:', updatedResult);
                                        fetchInterviewData(selectedStage);
                                        onResultUpdate();
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            );
        }

        // 待遇検討
        if (selectedStage === "待遇検討") {
            if (!compensationConfig) {
                return (
                    <div className="stage-content">
                        <div className="loading-section">
                            <p>設定を読み込み中...</p>
                        </div>
                    </div>
                );
            }

            // 給与体系のアイテムを生成
            const payTypeItems = compensationConfig.employmentTypes
                ? Array.from(new Map(
                    compensationConfig.employmentTypes.map((et: any) => [et.pay_type, et.pay_type_label])
                ).entries()).map(([value, label]) => ({ value, label }))
                : [];

            // 選択された給与体系に応じて従業員区分をフィルタ
            const filteredEmploymentTypes = compensationConfig.employmentTypes
                ? payType
                    ? compensationConfig.employmentTypes.filter((et: any) => et.pay_type === payType)
                    : compensationConfig.employmentTypes
                : [];

            // 部門アイテムを生成
            const divisionItems = Object.entries(divisionMap)
                .filter(([_, name]) => name !== divisionMap['common'])
                .map(([code, name]) => ({ value: code, label: name }));

            return (
                <div className="stage-content compensation-stage">
                    <h3>💼 待遇検討</h3>

                    <div className="compensation-form">
                        <div className="compensation-field">
                            <label>採用可否 *</label>
                            <select
                                value={hrDecision}
                                onChange={(e) => setHrDecision(e.target.value)}
                            >
                                <option value="">選択してください</option>
                                {compensationConfig.hiringDecisions?.map((opt: any) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.value}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="compensation-field">
                            <label>推薦部門</label>
                            <select
                                value={recommendedDivision}
                                onChange={(e) => setRecommendedDivision(e.target.value)}
                            >
                                <option value="">選択してください</option>
                                {divisionItems.map((div) => (
                                    <option key={div.value} value={div.value}>
                                        {div.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="compensation-field">
                            <label>給与体系</label>
                            <select
                                value={payType}
                                onChange={(e) => {
                                    setPayType(e.target.value);
                                    // 給与体系変更時に従業員区分をクリア
                                    if (employmentType) {
                                        const validValues = new Set(
                                            compensationConfig.employmentTypes
                                                .filter((et: any) => et.pay_type === e.target.value)
                                                .map((et: any) => et.value)
                                        );
                                        if (!validValues.has(employmentType)) {
                                            setEmploymentType('');
                                        }
                                    }
                                }}
                            >
                                <option value="">選択してください</option>
                                {payTypeItems.map((item: any) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="compensation-field">
                            <label>従業員区分</label>
                            {payType ? (
                                <select
                                    value={employmentType}
                                    onChange={(e) => setEmploymentType(e.target.value)}
                                >
                                    <option value="">選択してください</option>
                                    {filteredEmploymentTypes.map((et: any) => (
                                        <option key={et.value} value={et.value}>
                                            {et.label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="hint-text">← 給与体系を先に選択してください</div>
                            )}
                        </div>

                        <div className="compensation-field">
                            <label>タイトル</label>
                            <select
                                value={recommendedTitle}
                                onChange={(e) => setRecommendedTitle(e.target.value)}
                            >
                                <option value="">選択してください</option>
                                {compensationConfig.titleOptions?.map((opt: any) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="compensation-actions">
                            <button
                                onClick={handleCompensationSubmit}
                                className="action-button primary"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        // 内定通知
        if (selectedStage === "内定通知") {
            return (
                <div className="stage-content">
                    <h3>📩 内定通知</h3>
                    <div className="info-section">
                        <p>候補者への内定通知を準備・送付します。</p>
                    </div>
                </div>
            );
        }

        // 内定受諾
        if (selectedStage === "内定受諾") {
            return (
                <div className="stage-content">
                    <h3>✅ 内定受諾</h3>
                    <div className="info-section">
                        <p>候補者が内定を受諾しました。</p>
                    </div>
                </div>
            );
        }

        // 内定辞退
        if (selectedStage === "内定辞退") {
            return (
                <div className="stage-content">
                    <h3>❌ 内定辞退</h3>
                    <div className="info-section">
                        <p>候補者が内定を辞退しました。</p>
                    </div>
                </div>
            );
        }

        // 不合格
        if (selectedStage === "不合格") {
            return (
                <div className="stage-content">
                    <h3>⛔ 不合格</h3>
                    <div className="info-section">
                        <p style={{ color: '#dc3545', fontWeight: '600' }}>
                            この候補者は不合格となりました。データは閲覧のみ可能です。
                        </p>
                        {localResult.document_review_date && (
                            <div className="info-row">
                                <span className="label">不合格日時:</span>
                                <span className="value">
                                    {new Date(localResult.document_review_date).toLocaleString('ja-JP')}
                                </span>
                            </div>
                        )}
                        {localResult.document_review_reviewer && (
                            <div className="info-row">
                                <span className="label">審査者:</span>
                                <span className="value">{localResult.document_review_reviewer}</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="stage-content">
                <h3>ℹ️ 情報なし</h3>
                <p>このステージの情報はありません。</p>
            </div>
        );
    };

    return (
        <>
            <div className="status-content-panel">
                {renderContent()}
            </div>

            {/* AI評価処理中モーダル */}
            {isEvaluating && (
                <div className="processing-modal-overlay">
                    <div className="processing-modal-content">
                        <div className="processing-spinner"></div>
                        <h3>AI評価を実行中...</h3>
                        <p>処理が完了するまでお待ちください。</p>
                        <p className="warning-text">⚠️ この画面を閉じないでください</p>
                    </div>
                </div>
            )}

            {/* 再アップロードモーダル */}
            {showReuploadModal && (
                <ResumeReuploadModal
                    candidateId={localResult.user_id}
                    preferredDivision={selectedDivision}
                    reviewerId={interviewerId}
                    onClose={() => setShowReuploadModal(false)}
                    onSuccess={handleReuploadSuccess}
                />
            )}
        </>
    );
};

export default StatusContentPanel;
