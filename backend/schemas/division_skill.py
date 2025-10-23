from typing import Optional, List, Literal
from pydantic import BaseModel, HttpUrl, Field

# ============================================
# 📊 部門・スキル管理
# ============================================

TraitType = Literal["must_requirement", "desired_trait"]


class CandidateExpectationBase(BaseModel):
    division: Optional[str] = None
    division_prefix: Optional[str] = None
    trait_type: TraitType
    trait_label: str


class CandidateExpectationCreate(CandidateExpectationBase):
    pass


class CandidateExpectationOut(CandidateExpectationBase):
    id: int

    class Config:
        from_attributes = True  # ✅ pydantic v2: orm_mode の代替


class SkillUpdateSchema(BaseModel):
    trait_label: str


# ============================================
# ✨ AIスキル抽出API用
# ============================================

class SuggestSkillsRequest(BaseModel):
    # いまは job_text 中心ですが、将来URL復活に備えて残しておく
    job_url: Optional[HttpUrl] = None
    job_text: Optional[str] = None
    division: Optional[str] = None
    division_prefix: Optional[str] = None


class SuggestedSkills(BaseModel):
    # ✅ 2配列で受ける（フロントの初期値にそのまま使える）
    must_requirement: List[str] = Field(default_factory=list)
    desired_trait: List[str] = Field(default_factory=list)


class SuggestSkillsResponse(BaseModel):
    division: Optional[str] = None
    division_prefix: Optional[str] = None
    # 元テキストから抽出した推定結果（フロントの初期値に利用）
    suggested: SuggestedSkills
    # 既存DBとの重複除去後（今回は同一でもOK。将来ここで差分化）
    deduped_against_existing: SuggestedSkills