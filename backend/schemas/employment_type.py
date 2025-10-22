from pydantic import BaseModel, ConfigDict
from typing import Optional

class EmploymentTypeOut(BaseModel):
    id: int
    value: str
    label: str
    pay_type: str
    pay_type_label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)