from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
from backend.schemas.checksheet import PrepItem

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