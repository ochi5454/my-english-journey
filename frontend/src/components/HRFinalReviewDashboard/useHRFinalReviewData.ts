import { useEffect, useState } from "react";
import appConfig from "../../config.ts";
import type { AIRawResult, InterviewEval, ConfigResponse, LabeledOption } from "./hrReviewTypes";

export const useHRFinalReviewData = (interviewerId: string) => {
    const [aiRawResults, setAiRawResults] = useState<AIRawResult[]>([]);
    const [interviewEvals, setInterviewEvals] = useState<InterviewEval[]>([]);
    const [configData, setConfigData] = useState<{
        qualitativeItems: ConfigResponse["qualitativeItems"];
        quantitativeItems: ConfigResponse["quantitativeItems"];
        titleOptions: LabeledOption[];
        divisionOptions: LabeledOption[];
    }>({
        qualitativeItems: [],
        quantitativeItems: [],
        titleOptions: [],
        divisionOptions: [],
    });
    const [hrEvaluations, setHrEvaluations] = useState<
        Record<
        string,
        {
            decision?: string;
            division?: string;
            title?: string;
            annualIncome?: string;
            savedAt?: string;
            savedBy?: string;
        }
        >
    >({});

    useEffect(() => {
        // --- ① AIスコア一覧取得 ---
        fetch(`${appConfig.API_BASE_URL}/resume-results`)
        .then((res) => res.json())
        .then((data: AIRawResult[]) => {
            const latestMap = new Map<string, AIRawResult>();
            const hrMap: typeof hrEvaluations = {};

            data.forEach((item) => {
            const existing = latestMap.get(item.user_id);
            if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                latestMap.set(item.user_id, item);
            }

            if ((item as any).hr_review) {
                const hr = (item as any).hr_review;
                hrMap[item.user_id] = {
                decision: hr.decision,
                division: hr.division,
                title: hr.title,
                annualIncome: hr.annual_income,
                savedAt: hr.updated_at,
                savedBy: hr.updated_by,
                };
            }
            });

            setAiRawResults(Array.from(latestMap.values()));
            setHrEvaluations(hrMap);
        })
        .catch((err) => console.error("AIスコアの取得に失敗:", err));

        // --- ② 面接評価チェックシート取得 ---
        fetch(`${appConfig.API_BASE_URL}/checksheet/all`)
        .then((res) => res.json())
        .then((data: InterviewEval[]) => {
            console.log("チェックシートAPI結果:", data);
            setInterviewEvals(data);
        })
        .catch((err) => console.error("面接官評価の取得に失敗:", err));

        // --- ③ 設定情報取得 ---
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
        .then((res) => res.json())
        .then(
            (
            config: ConfigResponse & {
                hiringDecisions: LabeledOption[];
                titleOptions: LabeledOption[];
                divisions: (string | LabeledOption)[];
            }
            ) => {
            setConfigData({
                qualitativeItems: config.qualitativeItems,
                quantitativeItems: config.quantitativeItems,
                titleOptions: config.titleOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
                })),
                divisionOptions: Array.isArray(config.divisions)
                ? config.divisions.map((value) =>
                    typeof value === "string"
                        ? { value, label: value }
                        : { value: value.value, label: value.label }
                    )
                : [],
            });
            }
        )
        .catch((err) => console.error("定性/定量・選択肢の取得に失敗:", err));
    }, [interviewerId]);

    return {
        aiRawResults,
        interviewEvals,
        configData,
        hrEvaluations,
        setHrEvaluations, // 外部で更新するためにエクスポート
    };
};