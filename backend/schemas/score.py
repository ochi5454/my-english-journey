from pydantic import BaseModel, Field
from typing import List

# ============================================
# 📦 Pydanticモデル定義（構造化出力用）
# ============================================

class MustCheckResult(BaseModel):
    """マストチェック結果"""
    result: bool = Field(description="条件を満たしているか")
    reason: str = Field(description="判定理由")

class DivisionScore(BaseModel):
    """部門スコア"""
    division: str = Field(description="部門名")
    score: int = Field(ge=0, le=100, description="適合度スコア（0-100）")
    reason: str = Field(description="評価理由")

class DivisionScoreList(BaseModel):
    """部門スコアのリスト（Listをラップ）"""
    scores: List[DivisionScore] = Field(description="各部門のスコアリスト")

class MotivationScore(BaseModel):
    """志望動機スコア"""
    理念共感度: int = Field(ge=0, le=25, description="企業理念への共感度（25点満点）")
    経験接続度: int = Field(ge=0, le=25, description="経験との接続度（25点満点）")
    具体性: int = Field(ge=0, le=25, description="具体性（25点満点）")
    成長貢献意欲: int = Field(ge=0, le=25, description="成長・貢献意欲（25点満点）")
    合計スコア: int = Field(ge=0, le=100, description="合計スコア（100点満点）")

class WorkExperienceScore(BaseModel):
    """職務経歴スコア"""
    経験の深さ: int = Field(ge=0, le=25, description="経験の深さ（25点満点）")
    スキルの幅: int = Field(ge=0, le=25, description="スキルの幅（25点満点）")
    成果の具体性: int = Field(ge=0, le=25, description="成果の具体性（25点満点）")
    一貫性成長性: int = Field(ge=0, le=25, description="一貫性・成長性（25点満点）")
    合計スコア: int = Field(ge=0, le=100, description="合計スコア（100点満点）")
