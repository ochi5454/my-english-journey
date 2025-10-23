from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
from backend.schemas.custom_qa import PrepItem

# ============================================
# 📊 面接シート
# ============================================

class InterviewPrepByInterviewerRequest(BaseModel):
    interviewer_id: str
    candidate_id: str
    stage: str
    prepItems: List[PrepItem] = Field(default_factory=list)
    reviewedResume: bool = False
    qualitative: Optional[Dict[str, Any]] = None
    quantitative: Optional[Dict[str, Any]] = None
    hiringDecision: Optional[str] = None
    recommendedDivision: Optional[str] = None
    recommendedTitle: Optional[str] = None
    payType: Optional[str] = None
    employmentType: Optional[str] = None

# ============================================
# 📊 面接日程調整
# ============================================

class InterviewSetupRequest(BaseModel):
    interviewDate: datetime
    interviewer: str 
    candidate: str 
    todo: str
    candidateMail: str
    interviewerMail: str
    stage: str