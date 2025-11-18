import React from "react";
import "./VerticalStatusBar.css";

interface StageInfo {
    date: string | null;
    reviewer: string | null;
    result: string | null;
}

interface Props {
    localResult: any;
    selectedStage: string;
    onStageSelect: (stage: string) => void;
}

export const statusSteps = [
    "アップロード",
    "書類選考",
    "web面談",
    "1次面談",
    "2次面談",
    "待遇検討",
    "内定通知",
    "内定受諾",
    "内定辞退",
    "不合格"
];

export const reviewStages = [
    "書類選考",
    "web面談",
    "1次面談",
    "2次面談"
];

const VerticalStatusBar: React.FC<Props> = ({
    localResult,
    selectedStage,
    onStageSelect,
}) => {
    const interviewStages = ["web面談", "1次面談", "2次面談"];

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

    // ✅ 各ステージの情報を取得する関数
    const getStageInfo = (step: string): StageInfo => {
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
        <div className="vertical-status-bar">
            <h3 className="vertical-status-title">選考ステータス</h3>
            <div className="vertical-status-steps">
                {statusSteps.map((step, idx) => {
                    const isActive = localResult.status === step;
                    const isSelected = selectedStage === step;
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

                    return (
                        <div
                            key={idx}
                            className={`vertical-status-item
                                ${isActive ? "active" : ""}
                                ${isSelected ? "selected" : ""}
                                ${isStepDone ? "done" : ""}
                                ${isScheduled ? "scheduled" : ""}`}
                            onClick={() => onStageSelect(step)}
                        >
                            <div className="status-bookmark">
                                <div className="bookmark-label">
                                    {step}
                                </div>
                                <div className="bookmark-triangle"></div>
                            </div>

                            {stageInfo.date && (
                                <div className="status-info">
                                    <div className="info-line">
                                        <span className="info-icon">🗓️</span>
                                        <span className="info-text">
                                            {new Date(stageInfo.date).toLocaleDateString('ja-JP')}
                                        </span>
                                    </div>
                                    <div className="info-line">
                                        <span className="info-icon">🧑</span>
                                        <span className="info-text">{stageInfo.reviewer || "-"}</span>
                                    </div>
                                    {stageInfo.result && (
                                        <div className="info-line">
                                            <span className="info-icon">📋</span>
                                            <span className="info-text">{stageInfo.result}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default VerticalStatusBar;
