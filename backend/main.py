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
    resume_batch,
)
from backend.routers.admin import (
    skills,
    role,
    qualitative,
    tag,
    ai_formula,
    candidates,
    status,
)

from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.core.database import init_db, init_userrole_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ✅ 起動時の処理
    print("🚀 アプリケーション起動中...")
    init_db()  # メインDB初期化
    init_userrole_db()  # UserRole DB初期化
    print("✅ データベース初期化完了")
    
    yield  # アプリケーション実行中
    
    # ✅ 終了時の処理（必要なら）
    print("🛑 アプリケーション終了")

app = FastAPI(lifespan=lifespan)

# ============================================
# ✅ CORS ミドルウェア設定
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://prothentia.ngrok.app"],  # フロントエンドのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)

# ============================================
# ✅ 各ルーターを定義
# ============================================

app.include_router(score_resume.router)
app.include_router(resume_batch.router)
app.include_router(score_adjustment.router)
app.include_router(interview_schedule.router)
app.include_router(checksheet.router)
app.include_router(score_byinterview.router)
app.include_router(score_ofinterviewer.router)
app.include_router(hr.router)
# 以下admin関連
app.include_router(skills.router)
app.include_router(role.router)
app.include_router(qualitative.router)
app.include_router(tag.router)
app.include_router(ai_formula.router)
app.include_router(candidates.router)
app.include_router(status.router)