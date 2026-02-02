from typing import List, Optional
from datetime import date
from pydantic import BaseModel


class TournamentCreate(BaseModel):
    name: str
    category: str
    scale: str = "small"
    start_date: date
    end_date: date
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    organizer_contact: Optional[str] = None
    staff_roles: Optional[str] = None


class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    assignee: Optional[str]
    due_date: Optional[date]
    status: str
    priority: Optional[str]
    dependency: Optional[str]
    generated: bool

    class Config:
        orm_mode = True


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    dependency: Optional[str] = None


class DocumentOut(BaseModel):
    id: int
    doc_type: str
    content: str

    class Config:
        orm_mode = True


class AlertOut(BaseModel):
    id: int
    message: str
    created_at: date

    class Config:
        orm_mode = True


class TournamentOut(BaseModel):
    id: int
    name: str
    category: str
    scale: str
    start_date: date
    end_date: date
    venue_name: Optional[str]
    venue_address: Optional[str]
    organizer_contact: Optional[str]
    staff_roles: Optional[str]
    tasks: List[TaskOut] = []
    documents: List[DocumentOut] = []
    alerts: List[AlertOut] = []

    class Config:
        orm_mode = True


class SeedRequest(BaseModel):
    name: str = "ジュニアカップ"
    category: str = "Youth"
    scale: str = "small"
    start_date: date = date(2025, 2, 15)
    end_date: date = date(2025, 2, 16)
    venue_name: str = "味の素スタジアム"
    venue_address: str = "東京都調布市"
    organizer_contact: str = "ops@example.com"
    staff_roles: str = "運営責任者:山田/会場:佐藤/審判:鈴木"
