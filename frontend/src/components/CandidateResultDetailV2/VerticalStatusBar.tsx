import React from "react";
import "./VerticalStatusBar.css";
import appConfig from '../../config';

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

    const interviewStageMap: Record<string, string> = {
        "web面談": "interview_1",
        "1次面談": "interview_2",
        "2次面談": "interview_final",
    };
    const [decisionMap, setDecisionMap] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
            .then(res => res.json())
            .then(data => {
                if (data.hiringDecisions) {
                    const map: Record<string, string> = {};
                    data.hiringDecisions.forEach((d: any) => {
                        map[d.id] = d.value;  // hire_ok → 採用しても良い
                    });
                    setDecisionMap(map);
                }
            })
            .catch(err => console.error("待遇検討マスタ取得エラー:", err));
    }, []);

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

        // アップロードは固定
        if (step === "アップロード") {
            return {
                date: localResult.timestamp,
                reviewer: localResult.uploader_id,
                result: null
            };
        }

        // 書類選考（Candidateテーブルより取得）
        if (step === "書類選考") {
            return {
                date: localResult.document_review_date || null,
                reviewer: localResult.document_review_reviewer || null,
                result: localResult.document_review_result
            };
        }

        // 待遇検討（Candidateテーブルより取得）
        if (step === "待遇検討") {
            const raw = localResult.hr_decision;
            const label = decisionMap[raw] || raw;  // ← 日本語変換！
            return {
                date: localResult.hr_saved_at || null,
                reviewer: localResult.hr_saved_by || null,
                result: label || null
            };
        }

        // ---------------------------
        // それ以外は動的キーで処理
        // ---------------------------
        const dateKey = `chat_review_${step}_at`;
        const reviewerKey = `chat_reviewer_${step}`;

        return {
            date: localResult[dateKey] || null,
            reviewer: localResult[reviewerKey] || null,
            result: null
        };
    };

    const getInterviewInterviewer = (step: string): string | null => {
        if (!localResult.interview_results) return null;

        const backendStage = interviewStageMap[step];
        if (!backendStage) return null;

        const match = localResult.interview_results.find(
            (res: any) => res.stage === backendStage
        );
        return match?.interviewer ?? null;
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
                                        <span className="info-text">
                                            {interviewStages.includes(step)
                                                ? getInterviewInterviewer(step) || "-"
                                                : stageInfo.reviewer || "-"
                                            }
                                        </span>
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
