from pydantic import BaseModel, ConfigDict
from typing import Optional

class ChecksheetQualitativeItemBase(BaseModel):
    key: str
    label: str
    placeholder: Optional[str] = None
    order: Optional[int] = None
    pay_type: Optional[str] = "daily_monthly"
    is_active: Optional[bool] = True


class ChecksheetQualitativeItemCreate(ChecksheetQualitativeItemBase):
    pass


class ChecksheetQualitativeItemUpdate(BaseModel):
    label: Optional[str] = None
    placeholder: Optional[str] = None
    order: Optional[int] = None
    pay_type: Optional[str] = None
    is_active: Optional[bool] = None


class ChecksheetQualitativeItemOut(ChecksheetQualitativeItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)