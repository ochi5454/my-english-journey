from pydantic import BaseModel, ConfigDict
from typing import Optional

class HiringDecisionOut(BaseModel):
    id: str
    value: str
    label: str
    order: Optional[int] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)