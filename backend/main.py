from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import (
    score_resume,
    score_adjustment,
    interview_schedule, 
    checksheet, 
    score_byinterview,
    score_ofinterviewer,
    hr,
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

app.include_router(score_resume.router)
app.include_router(score_adjustment.router)
app.include_router(interview_schedule.router)
app.include_router(checksheet.router)
app.include_router(score_byinterview.router)
app.include_router(score_ofinterviewer.router)
app.include_router(hr.router)