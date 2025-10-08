from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any, TypedDict

# ============================================
# 📊 AIとのチャット
# ============================================

class ChatTurn(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ScoreChatRequest(BaseModel):
    candidate_id: str
    reviewer_id: str
    phase: Optional[str] = "2nd_review"
    messages: List[ChatTurn]

class ScoreAdjustment(BaseModel):
    division: str
    score: int
    reason: str

class ScoreUpdateRequest(BaseModel):
    candidate_id: str
    reviewer_id: str
    stage: Optional[str]
    adjustments: List[ScoreAdjustment]

# ============================================
# 📊 面接シート
# ============================================

class PrepItem(BaseModel):
    question: str
    answer: str
    tags: List[str]

class PrepItemDict(TypedDict):
    question: str
    answer: str
    tags: List[str]

# ============================================
# 📊 面接日程調整
# ============================================

class InterviewPrepByInterviewerRequest(BaseModel):
    interviewer_id: str
    candidate_id: str
    stage: str
    prepItems: List[PrepItem] = Field(default_factory=list)
    reviewedResume: bool = False
    qualitative: Optional[Dict[str, Any]] = None
    quantitative: Optional[Dict[str, Any]] = None

class InterviewSetupRequest(BaseModel):
    interviewDate: datetime
    interviewer: str 
    candidate: str 
    todo: str
    candidateMail: str
    interviewerMail: str
    stage: str 

# ============================================
# 📊 HR評価
# ============================================

class HRReview(BaseModel):
    decision: Optional[str]
    division: Optional[str]
    title: Optional[str]
    annual_income: Optional[int]

class HRReviewUpdate(BaseModel):
    candidate_id: str
    review: HRReview