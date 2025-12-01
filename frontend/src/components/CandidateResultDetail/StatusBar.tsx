import React, { useState, useEffect } from "react";
import appConfig from "../../config";

interface Props {
    localResult: any;
    interviewerId: string;
    onStatusUpdate: () => void;
    onOpenInterviewFlow: (stage: string) => void;
    onOpenInterviewPrep: (stage: string) => void;
    onOpenReupload: () => void;
}

export　interface StatusMasterRow {
    key: string;
    label: string;
    order: number;
    next_key: string | null;
    is_skippable: boolean;
    is_interview: boolean;
    is_review_target: boolean;
}

const StatusBar: React.FC<Props> = ({
    localResult,
    interviewerId,
    onStatusUpdate,
    onOpenInterviewFlow,
    onOpenInterviewPrep,
    onOpenReupload,
}) => {

    // 🔽 DB のステータスマスタ
    const [statusMaster, setStatusMaster] = useState<any[]>([]);
    const [statusSteps, setStatusSteps] = useState<string[]>([]);
    const [reviewStages, setReviewStages] = useState<string[]>([]);
    const [interviewStages, setInterviewStages] = useState<string[]>([]);
    const [interviewMap, setInterviewMap] = useState<Record<string, string>>({});
    const usedInterviewStages = interviewStages;        // ← そのまま DB の値
    const usedInterviewStageMap = interviewMap;         // ← そのまま DB の値

    const [decisionMap, setDecisionMap] = useState<Record<string, string>>({});
    const [processingStage, setProcessingStage] = useState<string | null>(null);

    // ---------------------------------------------
    // 🔽 StatusMaster を DB から取得
    // ---------------------------------------------
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
            .then(res => res.json())
            .then((rows: StatusMasterRow[]) => {
                setStatusMaster(rows);

                // 1) 全ステップ（順番通り）
                setStatusSteps(rows.map(r => r.label));

                // 2) レビュー対象（書類/Web/1次/最終）
                setReviewStages(rows.filter(r => r.is_review_target).map(r => r.label));

                // 3) 面談ステージ
                const interviews = rows.filter(r => r.is_interview);
                setInterviewStages(interviews.map(r => r.label));

                // 4) 日本語 → backend key（interview_1 など）
                const map: Record<string, string> = {};
                interviews.forEach(r => {
                    map[r.label] = r.key;
                });
                setInterviewMap(map);
            });
    }, []);

    // ---------------------------------------------
    // 🔽 待遇検討マスタ
    // ---------------------------------------------
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
            .then(res => res.json())
            .then(data => {
                const map: Record<string, string> = {};
                (data.hiringDecisions || []).forEach((d: any) => {
                    map[d.id] = d.value;
                });
                setDecisionMap(map);
            });
    }, []);

    // ---------------------------------------------
    // 🔽 不採用判定
    // ---------------------------------------------
    const isRejected =
        localResult.status === "内定辞退" ||
        localResult.hr_decision === "不採用";

    // ---------------------------------------------
    // 🔽 面談の日程が入っているか？
    // ---------------------------------------------
    const isInterviewScheduled = (label: string): boolean => {
        const backendKey = interviewMap[label];
        if (!backendKey) return false;
        return !!localResult[`${backendKey}_date`];
    };

    // ---------------------------------------------
    // 🔽 面談担当者を取得
    // ---------------------------------------------
    const getInterviewInterviewer = (label: string): string | null => {
        if (!localResult.interview_results) return null;

        const backendKey = interviewMap[label];
        if (!backendKey) return null;

        const res = localResult.interview_results.find((r: any) => r.stage === backendKey);
        return res?.interviewer ?? null;
    };

    // ---------------------------------------------
    // 🔽 ステージ情報（date, reviewer, result）
    // ---------------------------------------------
    const getStageInfo = (label: string) => {
        const row = statusMaster.find(r => r.label === label);
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
                date: localResult.document_review_date,
                reviewer: localResult.document_review_reviewer,
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
                result: label
            };
        }

        // 面談ステージは特別な形式：interview_x_date(＊InterviewSchedule、ResultByInterviewから取得)
        if (row.is_interview) {
            return {
                date: localResult[`${row.key}_date`] || null,
                reviewer: getInterviewInterviewer(label),
                result: localResult[`${row.key}_result`] || null
            };
        }

        // それ以外はデータなし
        return { date: null, reviewer: null, result: null };
    };

    // ---------------------------------------------
    // 🔽 書類選考の更新
    // ---------------------------------------------
    const handleDocumentReview = async (isPassed: boolean) => {
        setProcessingStage("書類選考");

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-document-review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    reviewer_id: interviewerId,
                    is_passed: isPassed
                })
            });

            if (!res.ok) throw new Error("書類選考の更新に失敗しました");

            alert(isPassed ? "書類選考を合格にしました" : "書類選考を不合格にしました");
            onStatusUpdate();
        } finally {
            setProcessingStage(null);
        }
    };

    // ---------------------------------------------
    // 🔽 レンダリング
    // ---------------------------------------------
    return (
        <div className="result-d-status-header">
            <h3>選考ステータス</h3>

            {isRejected && (
                <div style={{
                    padding: "12px",
                    backgroundColor: "#ffebee",
                    border: "1px solid #f44336",
                    color: "#c62828",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    textAlign: "center",
                    marginBottom: "12px"
                }}>
                    ⚠️ この候補者は不採用として処理されています
                </div>
            )}

            <div className="status-bar-horizontal-with-info">
                {statusSteps.map((label) => {
                    const info = getStageInfo(label);
                    const isActive = localResult.status === label;

                    const isStepDone =
                        (label === "アップロード" && !!localResult.timestamp) ||
                        (reviewStages.includes(label) && !!info.date) ||
                        (label === "待遇検討" && (!!localResult.hr_saved_at || !!localResult.hr_review?.updated_at));

                    const finalInterviewDate =
                        localResult.interview_final_date ||
                        localResult["interview_final_date"]; // 念のため両方

                    const isScheduled =
                        (interviewStages.includes(label) &&
                            isInterviewScheduled(label) &&
                            !info.date) ||

                        // 待遇検討の scheduled 条件を復活
                        (label === "待遇検討" &&
                            finalInterviewDate &&
                            !localResult.hr_saved_at);

                    // 書類選考ボタン
                    const showDocumentButtons =
                        label === "書類選考" &&
                        !info.date &&
                        !isRejected;

                    const handleClick = () => {
                        if (isRejected) return;

                        // アップロード → 再アップ
                        if (label === "アップロード") {
                            onOpenReupload();
                            return;
                        }

                        // 面談フロー
                        if (interviewStages.includes(label)) {
                            onOpenInterviewFlow(label);
                            return;
                        }

                        // 待遇検討
                        if (label === "待遇検討") {
                            window.open(`/hr-final-review?filter=${localResult.user_id}`, "_blank");
                        }
                    };

                    return (
                        <div key={label} className="status-step-container">
                            {showDocumentButtons && (
                                <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDocumentReview(true);
                                        }}
                                        disabled={processingStage === "書類選考"}
                                        style={{ background: "#4caf50", color: "white" }}
                                    >
                                        合格
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDocumentReview(false);
                                        }}
                                        disabled={processingStage === "書類選考"}
                                        style={{ background: "#f44336", color: "white" }}
                                    >
                                        不合格
                                    </button>
                                </div>
                            )}

                            <div
                                className={`status-step-horizontal
                                    ${isActive ? "active" : ""}
                                    ${isStepDone ? "status-done" : ""}
                                    ${isScheduled ? "interview-scheduled" : ""}
                                `}
                                onClick={handleClick}
                            >
                                {label}

                                {usedInterviewStages.includes(label) &&
                                isInterviewScheduled(label) &&
                                !isRejected && (
                                    <button
                                        className="interview-prep-check-button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenInterviewPrep(label);
                                        }}
                                    >
                                        ✅
                                    </button>
                                )}
                            </div>

                            {/* 日付 + 担当者 + 結果 */}
                            {info.date && (
                                <div className="status-extra-info-item-inline">
                                    <div className="line">
                                        <span>🗓️</span>
                                        {new Date(info.date).toLocaleDateString("ja-JP")}
                                    </div>
                                    <div className="line">
                                        <span>🧑</span>
                                        {info.reviewer || "-"}
                                    </div>
                                    {info.result && (
                                        <div className="line">
                                            <span>📋</span>
                                            {info.result}
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

export default StatusBar;
