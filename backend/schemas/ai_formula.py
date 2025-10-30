from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

# ============================================
# 📊 推薦度の数式の操作
# ============================================

class AIFormulaConfigBase(BaseModel):
    formula: str
    enabled_fields: List[str]
    weights: Optional[Dict[str, float]] = {}
    updated_by: Optional[str] = None

class AIFormulaConfigCreate(AIFormulaConfigBase):
    pass

class AIFormulaConfigResponse(AIFormulaConfigBase):
    key: str
    division: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True