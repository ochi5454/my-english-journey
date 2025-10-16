from typing import Optional
from pydantic import BaseModel

class RoleTitleOut(BaseModel):
    id: int
    value: str
    label: str
    order: int

    class Config:
        orm_mode = True

class RoleTitleCreate(BaseModel):
    value: str
    label: str
    order: Optional[int] = None

class RoleTitleUpdate(BaseModel):
    value: Optional[str] = None
    label: Optional[str] = None
    order: Optional[int] = None