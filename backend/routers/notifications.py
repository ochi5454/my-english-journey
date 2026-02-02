from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import get_db
from backend.services.mail_service import send_overtime_emails

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/overtime-email")
def send_overtime_email(db: Session = Depends(get_db), settings: Settings = Depends()):
    """
    person_progress にメールアドレスがある従業員へ、
    所属名称6ごとの残業明細Excelを添付して送信する。
    """
    try:
        result = send_overtime_emails(db, settings)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
