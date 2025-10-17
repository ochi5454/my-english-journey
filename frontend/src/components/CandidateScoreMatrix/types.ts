export interface Score {
    division: string;
    score: number;
    reason: string;
}

export interface MustCheckItem {
    result: boolean;
    reason: string;
}

export type DivisionMustCheck = {
    [division: string]: {
        [item_name: string]: {
        result: boolean;
        reason: string;
        };
    };
};

export interface Result {
    user_id: string;
    user_name?: string;
    gender?: string;
    status?: string;
    notes?: string;
    score_notes?: string;
    score_work?: string;
    work_summary?: string;
    experience?: number;
    timestamp: string;
    uploader_id?: string;
    updated_at?: string;
    updated_by?: string;
    preferred_div?: string;
    preferred_div_score?: number;
    recommended_div?: string;
    recommended_div_score?: number;
    hr_decision?: string;
    hr_division: string;
    hr_title: string;
    hr_income: number;
    must_check: Record<string, MustCheckItem>;
    division_must_check?: DivisionMustCheck;
    scores: Score[];
    ai_score?: number;
    ai_score_percentile?: number;
}