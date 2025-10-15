from pydantic import BaseModel
from typing import Optional

# ============================================
# 📊 部門・マストスキル・歓迎スキルの操作
# ============================================

class CandidateExpectationBase(BaseModel):
    division: Optional[str]
    trait_type: str  # "must_requirement" or "desired_trait"
    trait_label: str

class CandidateExpectationCreate(CandidateExpectationBase):
    pass

class CandidateExpectationOut(CandidateExpectationBase):
    id: int

    class Config:
        orm_mode = True

class SkillUpdateSchema(BaseModel):
    trait_label: str