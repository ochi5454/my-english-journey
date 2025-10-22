from pydantic import BaseModel
from typing import List, TypedDict

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