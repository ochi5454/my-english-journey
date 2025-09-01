from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import (
    resume, 
    interview_schedule, 
    interview_review,
    checksheet, 
    interviewer_eval, 
    hr_review
)

app = FastAPI()

# ============================================
# ✅ CORS ミドルウェア設定
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # フロントエンドのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# ✅ 各ルーターを定義
# ============================================

app.include_router(resume.router)
app.include_router(interview_schedule.router)
app.include_router(interview_review.router)
app.include_router(checksheet.router)
app.include_router(interviewer_eval.router)
app.include_router(hr_review.router)