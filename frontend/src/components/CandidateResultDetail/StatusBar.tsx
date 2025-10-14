import React from "react";
import { formatDate } from "../Utils/format";
import { statusSteps, reviewStages } from "../Utils/candidateStatus";

interface Props {
    localResult: any;
    onOpenInterviewFlow: (stage: string) => void;
    onOpenInterviewPrep: (stage: string) => void;
}

const StatusBar: React.FC<Props> = ({
    localResult,
    onOpenInterviewFlow,
    onOpenInterviewPrep,
}) => {
    const interviewStages = ["面談・1次", "面談・2次", "最終面談"];

    const isInterviewScheduled = (stage: string): boolean => {
        const keyMap: Record<string, string> = {
        "面談・1次": "interview_1_date",
        "面談・2次": "interview_2_date",
        "最終面談": "interview_final_date",
        };
        const key = keyMap[stage];
        if (!key) return false;
        return !!localResult[key];
    };

    return (
        <div className="result-d-status-header">
        <h3>選考ステータス</h3>
        <div className="status-bar-horizontal-with-info">
            {statusSteps.map((step, idx) => {
            const isActive = localResult.status === step;

            const isStepDone =
                (step === "アップロード" && !!localResult.timestamp) ||
                (step === "書類選考" && !!localResult.updated_at) ||
                (reviewStages.includes(step) &&
                !!localResult[`chat_review_${step}_at`]) ||
                (step === "待遇検討" && !!localResult.hr_review?.updated_at);

            const isScheduled =
                (interviewStages.includes(step) &&
                isInterviewScheduled(step) &&
                !localResult[`chat_review_${step}_at`]) ||
                (step === "待遇検討" &&
                !!localResult.chat_review_最終面談_at &&
                !localResult.hr_review?.updated_at);

            const handleClick = () => {
                if (interviewStages.includes(step)) {
                onOpenInterviewFlow(step);
                } else if (
                step === "待遇検討" &&
                !!localResult.chat_review_最終面談_at
                ) {
                window.open(
                    `/hr-final-review?filter=${localResult.user_id}`,
                    "_blank"
                );
                }
            };

            const reviewerKey = `chat_reviewer_${step}`;
            const reviewDateKey = `chat_review_${step}_at`;
            const reviewDate = localResult[reviewDateKey];
            const reviewer = localResult[reviewerKey];

            return (
                <div key={idx} className="status-step-container">
                <div
                    className={`status-step-horizontal 
                        ${isActive ? "active" : ""} 
                        ${isStepDone ? "status-done" : ""} 
                        ${isScheduled ? "interview-scheduled" : ""}`}
                    onClick={handleClick}
                    style={{ position: "relative" }}
                >
                    {step}

                    {interviewStages.includes(step) &&
                    isInterviewScheduled(step) && (
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
                    {reviewStages.includes(step) && (
                    <>
                        <div className="line">
                        <span className="label">🗓️</span>
                        <span className="value">
                            {reviewDate ? formatDate(reviewDate) : "-"}
                        </span>
                        </div>
                        <div className="line">
                        <span className="label">🧑</span>
                        <span className="value">{reviewer || "-"}</span>
                        </div>
                    </>
                    )}

                    {step === "待遇検討" && localResult.hr_review && (
                    <>
                        <div className="line">
                        <span className="label">🗓️</span>
                        <span className="value">
                            {formatDate(localResult.hr_review.updated_at)}
                        </span>
                        </div>
                        <div className="line">
                        <span className="label">🧑</span>
                        <span className="value">
                            {localResult.hr_review.updated_by}
                        </span>
                        </div>
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