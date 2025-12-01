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
                console.log('[DEBUG VerticalStatusBar] raw rows:', rows);
                const ordered = [...rows].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
                console.log('[DEBUG VerticalStatusBar] ordered:', ordered);
                setStatusMaster(ordered);

                // 全ステージ順番
                setStatusSteps(ordered.map((r: any) => r.label));

                // レビュー対象
                setReviewStages(
                    ordered.filter((r: any) => r.is_review_target).map((r: any) => r.label)
                );

                // 面談ステージ（DBの is_interview）
                const iStages = ordered
                    .filter((r: any) => r.is_interview)
                    .map((r: any) => r.label);
                setInterviewStages(iStages);

                // 面談ステージ → key のマッピング
                const map: Record<string, string> = {};
                ordered.filter((r: any) => r.is_interview).forEach((r: any) => {
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
    // 🔽 面談結果が存在するか？
    // ---------------------------
    const hasInterviewResult = (step: string): boolean => {
        const backendKey = interviewStageMap[step];
        if (!backendKey) return false;

        if (localResult[`${backendKey}_result`]) return true;

        return (localResult.interview_results || []).some(
            (r: any) => r.stage === backendKey
        );
    };

    // ---------------------------
    // 🔽 各ステージの情報取得
    // ---------------------------
    const getStageInfo = (step: string): StageInfo => {
        const row = statusMaster.find(r => r.label === step);
        if (!row) return { date: null, reviewer: null, result: null };

        // アップロード(＊CandidateStatusから取得)
        if (row.key === "upload") {
            const info = localResult.status_map?.["アップロード"];

            return {
                date: info?.date || null,
                reviewer: info?.reviewer || null,
                result: null
            };
        }

        // 書類選考(＊Candidateから取得)
        if (row.key === "screening") {
            return {
                date: localResult.document_review_date || null,
                reviewer: localResult.document_review_reviewer || null,
                result: localResult.document_review_result
            };
        }

        // 待遇検討(＊Candidateから取得)
        if (row.key === "treatment") {
            const raw = localResult.hr_decision;
            const label = decisionMap[raw] || raw;
            return {
                date: localResult.hr_saved_at || null,
                reviewer: localResult.hr_saved_by || null,
                result: label || null
            };
        }

        // 面談ステージは特別な形式：interview_x_date(＊InterviewSchedule、ResultByInterviewから取得)
        if (row.is_interview) {
            const dateField = `${row.key}_date`;
            const rawResult = localResult[`${row.key}_result`];
            const resultFromList = (localResult.interview_results || []).find(
                (r: any) => r.stage === row.key
            )?.decision;
            const decision = rawResult ?? resultFromList;
            const decisionLabel = decisionMap[decision] || decision || null;
            return {
                date: localResult[dateField] || null,
                reviewer: getInterviewInterviewer(step),
                result: decisionLabel
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

                {statusSteps.filter(s => s !== '一括アップロード').map((step, idx) => {
                    const stageInfo = getStageInfo(step);
                    const row = statusMaster.find(r => r.label === step);

                    // 「一括アップロード」も「アップロード」として扱う
                    const normalizedStatus = (localResult.status || '').includes('アップロード')
                        ? 'アップロード'
                        : localResult.status;
                    const isActive = normalizedStatus === step;
                    const isSelected = selectedStage === step;

                    const isStepDone =
                        (step === "アップロード" && !!localResult.timestamp) ||
                        (reviewStages.includes(step) && !!stageInfo.date) ||
                        (step === "待遇検討" && (!!localResult.hr_saved_at || !!localResult.hr_review?.updated_at));

                    const finalInterviewDate = localResult.interview_final_date;
                    const currentStatusIndex = statusSteps.indexOf(localResult.status);
                    const stepIndex = statusSteps.indexOf(step);
                    const isPastStage =
                        currentStatusIndex !== -1 &&
                        stepIndex !== -1 &&
                        stepIndex < currentStatusIndex;

                    const isSkipped =
                        isPastStage &&
                        row?.is_interview &&
                        !hasInterviewResult(step);

                    const isScheduled =
                        (interviewStages.includes(step) &&
                            isInterviewScheduled(step) &&
                            !stageInfo.date &&
                            !isSkipped) ||
                        (step === "待遇検討" &&
                            finalInterviewDate &&
                            !localResult.hr_saved_at &&
                            !localResult.hr_review?.updated_at);

                    return (
                        <div
                            key={idx}
                            className={`vertical-status-item
                                ${isActive ? "active" : ""}
                                ${isSelected ? "selected" : ""}
                                ${isStepDone ? "done" : ""}
                                ${isScheduled ? "scheduled" : ""}
                                ${isSkipped ? "skipped" : ""}`}
                            onClick={() => onStageSelect(step)}
                        >
                            <div className="status-bookmark">
                                <div className="bookmark-label">
                                    {step}
                                    {isSkipped && <span className="bookmark-skip-label">（省略）</span>}
                                </div>
                                <div className="bookmark-triangle"></div>
                            </div>

                            {(stageInfo.date || stageInfo.reviewer || stageInfo.result || isSkipped) && (
                                <div className={`status-info ${isSkipped ? "skipped-info" : ""}`}>
                                    {(stageInfo.date || isSkipped) && (
                                        <div className="info-line">
                                            <span className="info-icon">🗓️</span>
                                            <span className="info-text">
                                                {isSkipped
                                                    ? "-"
                                                    : stageInfo.date
                                                        ? new Date(stageInfo.date).toLocaleDateString('ja-JP')
                                                        : "-"}
                                            </span>
                                        </div>
                                    )}
                                    {(stageInfo.reviewer || interviewStages.includes(step)) && (
                                        <div className="info-line">
                                            <span className="info-icon">🧑</span>
                                            <span className="info-text">
                                                {interviewStages.includes(step)
                                                    ? getInterviewInterviewer(step) || "-"
                                                    : stageInfo.reviewer || "-"
                                                }
                                            </span>
                                        </div>
                                    )}
                                    {stageInfo.result && (
                                        <div className="info-line">
                                            <span className="info-icon">📋</span>
                                            <span className="info-text">{stageInfo.result}</span>
                                        </div>
                                    )}
                                    {isSkipped && (
                                        <div className="info-line">
                                            <span className="info-icon">⏭️</span>
                                            <span className="info-text">面談を省略しました</span>
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
