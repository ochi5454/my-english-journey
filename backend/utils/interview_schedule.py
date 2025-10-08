import json
from backend.core.config import TEMPLATE_INTERVIEWER_PATH, TEMPLATE_TODO_PATH, TEMPLATE_EMAIL_INTERVIEWER_PATH, TEMPLATE_EMAIL_CANDIDATE_PATH

# ============================================
# 🧠 面談日程テンプレートの読み込み
# ============================================

def load_interview_config() -> dict:
    """UI用：設定取得"""
    try:
        with open(TEMPLATE_INTERVIEWER_PATH, "r", encoding="utf-8") as f:
            interviewers = json.load(f)
        with open(TEMPLATE_TODO_PATH, "r", encoding="utf-8") as f:
            todos = json.load(f)
        with open(TEMPLATE_EMAIL_INTERVIEWER_PATH, "r", encoding="utf-8") as f:
            template_interviewer = json.load(f)
        with open(TEMPLATE_EMAIL_CANDIDATE_PATH, "r", encoding="utf-8") as f:
            template_candidate = json.load(f)

        return {
            "interviewers": interviewers,
            "todos": todos,
            "email_templates": {
                "to_interviewer": template_interviewer,
                "to_candidate": template_candidate
            }
        }

    except Exception as e:
        raise RuntimeError(f"設定ファイルの読み込みに失敗: {str(e)}")