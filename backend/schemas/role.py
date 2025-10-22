from pydantic import BaseModel, ConfigDict
from typing import Optional

class RoleTitleOut(BaseModel):
    id: int
    value: str
    label: str
    order: int
    model_config = ConfigDict(from_attributes=True)

class RoleTitleCreate(BaseModel):
    value: str
    label: str
    order: Optional[int] = None

class RoleTitleUpdate(BaseModel):
    value: Optional[str] = None
    label: Optional[str] = None
    order: Optional[int] = None