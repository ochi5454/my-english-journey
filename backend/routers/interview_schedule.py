from fastapi import HTTPException, APIRouter
from fastapi.exceptions import HTTPException
from pydantic import ValidationError
from backend.schemas.interviewsheet import InterviewSetupRequest
from backend.utils.interview_schedule import load_interview_config
from backend.services.interview_schedule.email import send_interview_emails
from backend.services.interview_schedule.save import save_interview_schedule

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
    print("\n======================================")
    print("🟦  POST /interview/setup  受信")
    print("🟦  受信 req:", req)
    print("🟦  req.model_dump():", req.model_dump())
    print("======================================\n")

    try:
        # まずはバリデーションを試す
        try:
            req_for_lib = InterviewSetupRequest.model_validate(req.model_dump())
            print("🟢 Validation OK:", req_for_lib)
        except Exception as ve:
            print("⚠️ ValidationError → モックモードで続行:", ve)
            req_for_lib = req

        # candidate_id or candidate の中身確認
        print("🟣 req_for_lib.candidate:", getattr(req_for_lib, "candidate", None))
        print("🟣 req_for_lib.stage:", getattr(req_for_lib, "stage", None))
        print("🟣 req_for_lib.interviewDate:", getattr(req_for_lib, "interviewDate", None))

        print(f"📧 [TEST MODE] メール送信をスキップ: candidate={getattr(req_for_lib, 'candidate', None)}")

        # DB 保存処理
        result = save_interview_schedule(req_for_lib)

        print("🟩 保存成功 result:", result)

        return {
            "message": "面談設定（モック）成功",
            **result,
        }

    except Exception as e:
        print("🔥 post_setup 内例外:", e)
        raise HTTPException(status_code=500, detail=f"処理エラー: {str(e)}")