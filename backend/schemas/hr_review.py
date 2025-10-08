from pydantic import BaseModel
from typing import Optional

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