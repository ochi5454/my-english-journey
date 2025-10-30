# backend/services/interview_schedule/email.py

import re
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate
from backend.schemas.interviewsheet import InterviewSetupRequest

def send_interview_emails(req: InterviewSetupRequest):
    """
    面談メール送信
    """
    # ✅ 候補者IDから実名を取得
    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=req.candidate).first()
        candidate_name = candidate.name if candidate and candidate.name else req.candidate
    
    # テンプレート変数
    template_vars = {
        "candidate_name": candidate_name,
        "interviewer_name": req.interviewer,
        "interview_date": req.interviewDate,
        "company_name": "株式会社サンプル",  # TODO: 設定ファイルから取得
    }
    
    # テンプレート置換
    candidate_mail_body = replace_template_vars(req.candidateMail, template_vars)
    interviewer_mail_body = replace_template_vars(req.interviewerMail, template_vars)
    
    print(f"📧 候補者向けメール:\n{candidate_mail_body}")
    print(f"📧 面談担当者向けメール:\n{interviewer_mail_body}")
    
    # TODO: 実際のメール送信処理
    # send_email(to=candidate.email, subject="...", body=candidate_mail_body)
    # send_email(to=interviewer_email, subject="...", body=interviewer_mail_body)


def replace_template_vars(template: str, vars: dict) -> str:
    """
    {{variable_name}} 形式の変数を置換
    """
    def replacer(match):
        key = match.group(1).strip()
        return str(vars.get(key, match.group(0)))
    
    return re.sub(r'{{\s*(\w+)\s*}}', replacer, template)