from pydantic import BaseModel
from typing import Optional

class InterviewerRoleFocusBase(BaseModel):
    division: str
    role: str
    focus_id: str
    focus_label: str

class InterviewerRoleFocusCreate(InterviewerRoleFocusBase):
    pass

class InterviewerRoleFocusUpdate(BaseModel):
    division: Optional[str]
    role: Optional[str]
    focus_id: Optional[str]
    focus_label: Optional[str]

class InterviewerRoleFocusOut(InterviewerRoleFocusBase):
    id: int

    class Config:
        orm_mode = True