from pydantic import BaseModel
from typing import Optional

# ============================================
# 📊 HR評価
# ============================================

class HRReview(BaseModel):
    decision: Optional[str] = None
    division: Optional[str] = None
    title: Optional[str] = None
    annual_income: Optional[int] = None

class HRReviewUpdate(BaseModel):
    candidate_id: str
    review: HRReview