from fastapi import HTTPException, APIRouter
from fastapi.exceptions import HTTPException
from pydantic import ValidationError
from backend.schemas.interview_schedule import InterviewSetupRequest
from backend.services.interview_schedule.config_loader import load_interview_config
from backend.services.interview_schedule.email_sender import send_interview_emails
from backend.services.interview_schedule.schedule_saver import save_interview_schedule

router = APIRouter()

#  ============================================
#  📮 面談日程調整
#  ============================================

@router.get("/interview/config")
def get_config():
    try:
        return load_interview_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/interview/setup")
def post_setup(req: InterviewSetupRequest):
    try:

        req_for_lib: InterviewSetupRequest = InterviewSetupRequest.model_validate(req.model_dump())

        send_interview_emails(req_for_lib)
        result = save_interview_schedule(req_for_lib)

        return {
            "message": "面談設定・送信成功",
            **result,
        }

    except ValidationError as ve:
        # スキーマ差異がある場合は内容を返して調整しやすく
        raise HTTPException(status_code=400, detail=f"リクエスト変換に失敗しました: {ve.errors()}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"処理エラー: {str(e)}")

