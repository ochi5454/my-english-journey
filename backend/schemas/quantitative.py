from pydantic import BaseModel, ConfigDict
from typing import List, Optional

class QuantitativeLevelOut(BaseModel):
    value: int
    label: str

    model_config = ConfigDict(from_attributes=True)


class QuantitativeItemOut(BaseModel):
    key: str
    label: str
    hint: Optional[str] = None
    comment_placeholder: Optional[str] = None
    order: Optional[int] = None
    levels: List[QuantitativeLevelOut]
    rubrics: List[str]

    model_config = ConfigDict(from_attributes=True)