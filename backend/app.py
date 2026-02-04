import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend.core.database import init_db
from backend.core.config import Settings
from backend.core.logging import setup_logging, get_logger, log_request
from backend.routers import excel, tournament, datasets, export_cursor, jobs, auth, export, notifications, api_keys

# 設定読み込み
settings = Settings()

# ログ設定初期化
env = os.getenv("ENV", "development")
setup_logging(env=env, log_level=os.getenv("LOG_LEVEL", "INFO"))
logger = get_logger(__name__)

# レート制限設定
limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled)

app = FastAPI(
    title="Tournament Ops MVP",
    description="勤怠管理・残業時間追跡システム API",
    version="1.0.0",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# レート制限をアプリに追加
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS設定（環境変数から読み込み）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    """リクエストログミドルウェア"""
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    # ヘルスチェックはログを省略（ノイズ軽減）
    if request.url.path != "/health":
        log_request(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            client_ip=request.client.host if request.client else None,
        )

    return response


@app.on_event("startup")
def startup_event():
    logger.info("application_startup", env=env)
    init_db()


@app.on_event("shutdown")
def shutdown_event():
    logger.info("application_shutdown")


@app.get("/health", tags=["system"])
def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "version": "1.0.0"}


app.include_router(excel.router)
app.include_router(tournament.router)
app.include_router(datasets.router)
app.include_router(export_cursor.router)
app.include_router(export.router)
app.include_router(jobs.router)
app.include_router(auth.router)
app.include_router(notifications.router)
app.include_router(api_keys.router)
