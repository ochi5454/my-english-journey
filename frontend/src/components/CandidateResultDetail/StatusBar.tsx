import React, { useState } from "react";
import appConfig from "../../config";

interface Props {
    localResult: any;
    interviewerId: string;
    onStatusUpdate: () => void;
    onOpenInterviewFlow: (stage: string) => void;
    onOpenInterviewPrep: (stage: string) => void;
    onOpenReupload: () => void;
}

const statusSteps = [
    "アップロード",
    "書類選考",
    "web面談",
    "1次面談",
    "2次面談",
    "待遇検討",
    "内定通知",
    "内定受諾",
    "内定辞退"
];

const reviewStages = [
    "書類選考",
    "web面談",
    "1次面談",
    "2次面談"
];

const StatusBar: React.FC<Props> = ({
    localResult,
    interviewerId,
    onStatusUpdate,
    onOpenInterviewFlow,
    onOpenInterviewPrep,
    onOpenReupload,
}) => {
    const interviewStages = ["web面談", "1次面談", "2次面談"];
    const [processingStage, setProcessingStage] = useState<string | null>(null);

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
            onStatusUpdate();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        } finally {
            setProcessingStage(null);
        }
    };

    // ✅ 各ステージの情報を取得する関数
    const getStageInfo = (step: string) => {
        if (step === "アップロード") {
            return {
                date: localResult.timestamp,
                reviewer: localResult.uploader_id,
                result: null
            };
        }
        
        if (step === "書類選考") {
            return {
                date: localResult.document_review_date || localResult.chat_review_書類選考_at,
                reviewer: localResult.document_review_reviewer || localResult.chat_reviewer_書類選考,
                result: localResult.document_review_result
            };
        }
        
        if (step === "web面談") {
            return {
                date: localResult.interview_1_date || localResult.chat_review_面談・1次_at,
                reviewer: localResult.interview_1_interviewer || localResult.chat_reviewer_面談・1次,
                result: localResult.interview_1_result
            };
        }
        
        if (step === "1次面談") {
            return {
                date: localResult.interview_2_date || localResult.chat_review_面談・2次_at,
                reviewer: localResult.interview_2_interviewer || localResult.chat_reviewer_面談・2次,
                result: localResult.interview_2_result
            };
        }
        
        if (step === "2次面談") {
            return {
                date: localResult.interview_final_date || localResult.chat_review_最終面談_at,
                reviewer: localResult.interview_final_interviewer || localResult.chat_reviewer_最終面談,
                result: localResult.interview_final_result
            };
        }
        
        if (step === "待遇検討") {
            return {
                date: localResult.hr_review?.updated_at,
                reviewer: localResult.hr_review?.updated_by,
                result: null
            };
        }
        
        return { date: null, reviewer: null, result: null };
    };

    return (
        <div className="result-d-status-header">
            <h3>選考ステータス</h3>
            <div className="status-bar-horizontal-with-info">
                {statusSteps.map((step, idx) => {
                    const isActive = localResult.status === step;
                    const stageInfo = getStageInfo(step);

                    const isStepDone =
                        (step === "アップロード" && !!localResult.timestamp) ||
                        (reviewStages.includes(step) && !!stageInfo.date) ||
                        (step === "待遇検討" && !!localResult.hr_review?.updated_at);

                    const isScheduled =
                        (interviewStages.includes(step) &&
                            isInterviewScheduled(step) &&
                            !stageInfo.date) ||
                        (step === "待遇検討" &&
                            !!localResult.chat_review_最終面談_at &&
                            !localResult.hr_review?.updated_at);

                    const showDocumentButtons = step === "書類選考" && !stageInfo.date;

                    const handleClick = () => {
                        if (step === "アップロード") {
                            onOpenReupload();
                            return;
                        }
                        
                        if (interviewStages.includes(step)) {
                            onOpenInterviewFlow(step);
                        } else if (step === "待遇検討" && !!localResult.chat_review_最終面談_at) {
                            window.open(`/hr-final-review?filter=${localResult.user_id}`, "_blank");
                        }
                    };

                    return (
                        <div key={idx} className="status-step-container">
                            {showDocumentButtons && (
                                <div style={{
                                    display: 'flex',
                                    gap: '6px',
                                    marginBottom: '4px',
                                    justifyContent: 'center',
                                }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDocumentReview(true);
                                        }}
                                        disabled={processingStage === '書類選考'}
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '12px',
                                            backgroundColor: '#4caf50',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                        }}
                                    >
                                        ✅ 合格
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDocumentReview(false);
                                        }}
                                        disabled={processingStage === '書類選考'}
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '12px',
                                            backgroundColor: '#f44336',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                        }}
                                    >
                                        ❌ 不合格
                                    </button>
                                </div>
                            )}

                            <div
                                className={`status-step-horizontal 
                                    ${isActive ? "active" : ""} 
                                    ${isStepDone ? "status-done" : ""} 
                                    ${isScheduled ? "interview-scheduled" : ""}`}
                                onClick={handleClick}
                                style={{ 
                                    position: "relative",
                                    cursor: step === "アップロード" || interviewStages.includes(step) || (step === "待遇検討" && localResult.chat_review_最終面談_at) ? "pointer" : "default"
                                }}
                                title={step === "アップロード" ? "クリックして再アップロード" : ""}
                            >
                                {step}

                                {interviewStages.includes(step) && isInterviewScheduled(step) && (
                                    <button
                                        className="interview-prep-check-button"
                                        title="面談シート"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenInterviewPrep(step);
                                        }}
                                    >
                                        ✅
                                    </button>
                                )}
                            </div>

                            <div className="status-extra-info-item-inline">
                                {stageInfo.date && (
                                    <>
                                        <div className="line">
                                            <span className="label">🗓️</span>
                                            <span className="value">
                                                {new Date(stageInfo.date).toLocaleDateString('ja-JP')}
                                            </span>
                                        </div>
                                        <div className="line">
                                            <span className="label">🧑</span>
                                            <span className="value">{stageInfo.reviewer || "-"}</span>
                                        </div>
                                        {stageInfo.result && (
                                            <div className="line">
                                                <span className="label">📋</span>
                                                <span className="value">{stageInfo.result}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default StatusBar;