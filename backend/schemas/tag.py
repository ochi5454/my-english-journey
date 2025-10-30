from pydantic import BaseModel
from typing import Optional

class InterviewerRoleFocusBase(BaseModel):
    division: str
    division_prefix: Optional[str] = None
    role: str
    focus_id: str
    focus_label: str

class InterviewerRoleFocusCreate(InterviewerRoleFocusBase):
    pass

class InterviewerRoleFocusUpdate(BaseModel):
    division: Optional[str]
    division_prefix: Optional[str]
    role: Optional[str]
    focus_id: Optional[str]
    focus_label: Optional[str]

class InterviewerRoleFocusOut(InterviewerRoleFocusBase):
    id: int

    class Config:
        from_attributes = True