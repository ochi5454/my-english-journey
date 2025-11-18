from pydantic import BaseModel
from typing import Optional, List

# ============================================
# 📊 AIによるスコアリングチャット
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
    recommended_division: Optional[str] = None