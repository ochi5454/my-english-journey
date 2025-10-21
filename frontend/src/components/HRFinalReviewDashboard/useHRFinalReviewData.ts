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
        hiringDecisions: { id: string; value: string }[];
    }>({
        qualitativeItems: [],
        quantitativeItems: [],
        titleOptions: [],
        hiringDecisions: [],
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
    const [prefixToName, setPrefixToName] = useState<Record<string, string>>({});

    useEffect(() => {
        // --- ① AIスコア一覧取得 ---
        fetch(`${appConfig.API_BASE_URL}/resume-results`)
        .then((res) => res.json())
        .then((data: AIRawResult[]) => {
            const latestMap = new Map<string, AIRawResult>();
            const hrMap: typeof hrEvaluations = {};

            data.forEach((item) => {
                const key = (item as any).candidate_id || item.user_id;
                const existing = latestMap.get(key);
                if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                    latestMap.set(key, item);
                }

                if ((item as any).hr_decision || (item as any).hr_division || 
                    (item as any).hr_title || (item as any).hr_income) {
                    hrMap[key] = {
                        decision: (item as any).hr_decision,
                        division: (item as any).hr_division || null,
                        title: (item as any).hr_title || null,
                        annualIncome: (item as any).hr_income != null ? (item as any).hr_income.toString() : '',
                        savedAt: (item as any).hr_saved_at || null,
                        savedBy: (item as any).hr_saved_by || null,
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
            setInterviewEvals(data);
        })
        .catch((err) => console.error("面接官評価の取得に失敗:", err));

        // --- ③ 設定情報取得 ---
        fetch(`${appConfig.API_BASE_URL}/checksheet/config`)
        .then((res) => res.json())
        .then(
            (
            config: ConfigResponse & {
                hiringDecisions: { id: string; value: string; label?: string }[];
                titleOptions: LabeledOption[];
                divisions: (string | LabeledOption)[];
            }
            ) => {
                setConfigData({
                    qualitativeItems: config.qualitativeItems,
                    quantitativeItems: config.quantitativeItems,
                    titleOptions: config.titleOptions.map(opt => ({
                        value: opt.value,
                        label: opt.label,
                    })),
                    hiringDecisions: config.hiringDecisions.map(opt => ({
                        id: opt.id,
                        value: opt.value,
                    })),
                });
            }
        )
        .catch((err) => console.error("定性/定量・選択肢の取得に失敗:", err));

    // --- ④ skills（部門マスター）取得 ---
    fetch(`${appConfig.API_BASE_URL}/admin/skills`)
        .then(res => res.json())
        .then((list: { division_prefix: string; division: string }[]) => {
            const map: Record<string, string> = {};
            list.forEach((item: { division_prefix: string; division: string }) => {
                map[item.division_prefix] = item.division;
            });
            setPrefixToName(map);
        })
        .catch(err => console.error("skills取得失敗:", err));
            
    }, [interviewerId]);

    return {
        aiRawResults,
        interviewEvals,
        configData,
        hrEvaluations,
        setHrEvaluations,
        prefixToName,
    };
};