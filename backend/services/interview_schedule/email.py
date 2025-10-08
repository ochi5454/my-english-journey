from backend.schemas.interview_schedule import InterviewSetupRequest

# ============================================
# 🧠 面談日程メールの送付
# ============================================

def send_interview_emails(req: InterviewSetupRequest):
    send_email({
        "to": req.interviewer,
        "subject": "【面談のご案内】",
        "body": req.interviewerMail
    })

    send_email({
        "to": req.candidate,
        "subject": "【面談のご案内】",
        "body": req.candidateMail
    })

def send_email(email: dict):
    """
    email = {
        "to": "example@example.com",
        "subject": "件名",
        "body": "本文"
    }
    """
    print(f"📧 Sending email to: {email['to']}")
    print(f"📨 Subject: {email['subject']}")
    print(f"📝 Body:\n{email['body']}")
    # 実際の送信処理（SMTPなど）はここに追加