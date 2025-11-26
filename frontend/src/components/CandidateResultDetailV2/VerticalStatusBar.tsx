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

const VerticalStatusBar: React.FC<Props> = ({
    localResult,
    selectedStage,
    onStageSelect,
}) => {

    // ---------------------------
    // 🔽 DB から取得したマスタ
    // ---------------------------
    const [statusMaster, setStatusMaster] = React.useState<any[]>([]);
    const [statusSteps, setStatusSteps] = React.useState<string[]>([]);
    const [reviewStages, setReviewStages] = React.useState<string[]>([]);
    const [interviewStages, setInterviewStages] = React.useState<string[]>([]);
    const [interviewStageMap, setInterviewStageMap] =
        React.useState<Record<string, string>>({});
    const finalInterviewLabel = interviewStages[interviewStages.length - 1];
    const finalInterviewKey = interviewStageMap[finalInterviewLabel]; // e.g. "interview_final"

    const [decisionMap, setDecisionMap] = React.useState<Record<string, string>>({});

    // ---------------------------
    // 🔽 ステータスマスタの取得
    // ---------------------------
    React.useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
            .then(res => res.json())
            .then(rows => {
                setStatusMaster(rows);

                // 全ステージ順番
                setStatusSteps(rows.map((r: any) => r.label));

                // レビュー対象
                setReviewStages(
                    rows.filter((r: any) => r.is_review_target).map((r: any) => r.label)
                );

                // 面談ステージ（DBの is_interview）
                const iStages = rows
                    .filter((r: any) => r.is_interview)
                    .map((r: any) => r.label);
                setInterviewStages(iStages);

                // 面談ステージ → key のマッピング
                const map: Record<string, string> = {};
                rows.filter((r: any) => r.is_interview).forEach((r: any) => {
                    map[r.label] = r.key;
                });
                setInterviewStageMap(map);
            })
            .catch(err => console.error("StatusMaster取得エラー:", err));
    }, []);

    // ---------------------------
    // 🔽 待遇検討マスタ取得
    // ---------------------------
    React.useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
            .then(res => res.json())
            .then(data => {
                if (data.hiringDecisions) {
                    const map: Record<string, string> = {};
                    data.hiringDecisions.forEach((d: any) => {
                        map[d.id] = d.value;
                    });
                    setDecisionMap(map);
                }
            })
            .catch(err => console.error("待遇検討マスタ取得エラー:", err));
    }, []);

    // ---------------------------
    // 🔽 面談日程が入っているか？
    // ---------------------------
    const isInterviewScheduled = (step: string): boolean => {
        const backendKey = interviewStageMap[step];
        if (!backendKey) return false;

        const dateField = `${backendKey}_date`; // interview_1_date など
        return !!localResult[dateField];
    };

    // ---------------------------
    // 🔽 各ステージの情報取得
    // ---------------------------
    const getStageInfo = (step: string): StageInfo => {
        const row = statusMaster.find(r => r.label === step);
        if (!row) return { date: null, reviewer: null, result: null };

        // アップロード
        if (row.key === "upload") {
            return {
                date: localResult.timestamp,
                reviewer: localResult.uploader_id,
                result: null
            };
        }

        // 書類選考
        if (row.key === "screening") {
            return {
                date: localResult.document_review_date || null,
                reviewer: localResult.document_review_reviewer || null,
                result: localResult.document_review_result
            };
        }

        // 待遇検討
        if (row.key === "treatment") {
            const raw = localResult.hr_decision;
            const label = decisionMap[raw] || raw;
            return {
                date: localResult.hr_saved_at || null,
                reviewer: localResult.hr_saved_by || null,
                result: label || null
            };
        }

        // 面談ステージは特別な形式：interview_x_date
        if (row.is_interview) {
            const dateField = `${row.key}_date`;
            return {
                date: localResult[dateField] || null,
                reviewer: getInterviewInterviewer(step),
                result: null
            };
        }

        // それ以外はデータなし
        return { date: null, reviewer: null, result: null };
    };

    // ---------------------------
    // 🔽 面談の担当者取得
    // ---------------------------
    const getInterviewInterviewer = (step: string): string | null => {
        if (!localResult.interview_results) return null;

        const backendKey = interviewStageMap[step];
        if (!backendKey) return null;

        const match = localResult.interview_results.find(
            (res: any) => res.stage === backendKey
        );
        return match?.interviewer ?? null;
    };

    // ===============================
    // 🔽 レンダリング
    // ===============================
    return (
        <div className="vertical-status-bar">
            <h3 className="vertical-status-title">選考ステータス</h3>
            <div className="vertical-status-steps">

                {statusSteps.map((step, idx) => {
                    const stageInfo = getStageInfo(step);

                    const isActive = localResult.status === step;
                    const isSelected = selectedStage === step;

                    const isStepDone =
                        (step === "アップロード" && !!localResult.timestamp) ||
                        (reviewStages.includes(step) && !!stageInfo.date) ||
                        (step === "待遇検討" && !!localResult.hr_review?.updated_at);

                    const finalInterviewDate = localResult.interview_final_date;

                    const isScheduled =
                        (interviewStages.includes(step) &&
                            isInterviewScheduled(step) &&
                            !stageInfo.date) ||
                        (step === "待遇検討" &&
                            finalInterviewDate &&
                            !localResult.hr_saved_at);

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
                                <div className="bookmark-label">{step}</div>
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