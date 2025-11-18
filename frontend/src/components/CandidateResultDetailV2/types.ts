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
    birth_date?: string;
    status?: string;
    notes?: string;
    score_notes?: string;
    score_work?: string;
    work_summary?: string;
    summarized_motivation?: string;
    summarized_work?: string;
    experience?: number;
    timestamp: string;
    uploader_id?: string;
    updated_at?: string;
    updated_by?: string;
    preferred_div?: string;
    preferred_div_score?: number;
    preferred_div_reason?: string;
    recommended_div?: string;
    recommended_div_score?: number;
    recommended_div_reason?: string;
    hr_decision?: string;
    hr_division?: string;
    hr_title?: string;
    hr_income?: number;
    hr_employment_type?: string; // ✅ 追加
    hr_pay_type?: string; // ✅ 追加
    must_check: Record<string, MustCheckItem>;
    must_check_by_division?: DivisionMustCheck;
    scores: Score[];
    ai_score?: number;
    ai_score_percentile?: number;
    ai_score_recommended?: number;  
    ai_score_recommended_percentile?: number;
    division_scores?: Record<string, number>;

    // ✅ 書類選考関連を追加
    document_review_date?: string;
    document_review_reviewer?: string;
    document_review_result?: string;
    
    // ✅ 面接日程関連を追加
    interview_1_date?: string;
    interview_1_interviewer?: string;
    interview_1_result?: string;
    interview_2_date?: string;
    interview_2_interviewer?: string;
    interview_2_result?: string;
    interview_final_date?: string;
    interview_final_interviewer?: string;
    interview_final_result?: string;
    
    llm_scoring?: {
        scores?: Score[];
        recommended_division?: string;
    };
}