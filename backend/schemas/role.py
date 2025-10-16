from pydantic import BaseModel

class RoleTitleOut(BaseModel):
    id: int
    value: str
    label: str
    order: int

    class Config:
        orm_mode = True