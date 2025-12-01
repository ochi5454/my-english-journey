export interface Score {
    division: string;
    score: number;
    reason: string;
}

export interface MustCheckItem {
    result: boolean;
    reason: string;
}

export interface AIRawResult {
    user_id: string;
    user_name?: string;
    gender?: string;
    status?: string;
    timestamp: string;
    recommended_division: string;
    must_check: Record<string, MustCheckItem>;
    scores: Score[];
}

export interface InterviewEval {
    candidate_id: string;
    interviewer_id: string;
    stage: string;
    qualitative?: Record<string, string>;
    quantitative?: Record<string, { level: number; comment: string }>;
    prepItems?: { question: string; answer: string; tags?: string[] }[];
    ai_score_reviewed?: boolean;
    timestamp?: string;

    payType?: string;
    employmentType?: string;

    hiringDecision?: string;
    recommendedDivision?: string;
    recommendedTitle?: string;
}

export interface ConfigResponse {
    qualitativeItems: { key: string; label: string }[];
    quantitativeItems: { key: string; label: string }[];
    titleOptions: { value: string; label: string }[];
    hiringDecisions: { id: string; value: string; label?: string }[];
    divisions?: (string | { value: string; label: string })[];

    employmentTypes?: {
        value: string;
        label: string;
        pay_type: string;
        pay_type_label: string;
    }[];
}

export interface LabeledOption {
    value: string;
    label: string;
}
