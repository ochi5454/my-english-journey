from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Callable, Coroutine
import httpx
import openai
import os
import inspect
from dotenv import load_dotenv
from backend.config import api_key_str  # llm_client の設定を想定
from fastapi.routing import APIRoute

# 環境変数ロード＆クライアント初期化
load_dotenv()

app = FastAPI(
    docs_url=os.getenv("DOCS_URL", "/docs"),
    redoc_url=os.getenv("REDOC_URL", "/redoc"),
    openapi_url=os.getenv("OPENAPI_URL", "/openapi.json")
)

llm_client = openai.OpenAI(api_key=api_key_str)

# --- アクション関数の定義 ---
async def summarize_text(text: str) -> str:
    resp = openai.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "あなたは会話履歴全体を要約するアシスタントです。"},
            {"role": "user", "content": f"Summarize: {text}"}
        ],
        max_tokens=100, temperature=0.7
    )
    return resp.choices[0].message.content or "サマリーの生成に失敗しました。"

async def translate_text(text: str) -> str:
    resp = openai.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "あなたは会話を日本語に翻訳するアシスタントです。"},
            {"role": "user", "content": f"日本語に翻訳: {text}"}
        ],
        max_tokens=100, temperature=0.7
    )
    return resp.choices[0].message.content or "翻訳に失敗しました。"

class AlertService:
    async def notify(self, message: str) -> None:
        # 実際の通知処理に置き換えてください
        print(f"Alert: {message}")

alert_service = AlertService()

async def send_alert(text: str) -> str:
    await alert_service.notify(text)
    return "Alert sent"

from hashtag_config import load_hashtag_map

hashtag_map = load_hashtag_map()

async def call_recommend_endpoint(text: str, user_id: str) -> str:
    # 現在のハッシュタグに対応するアクション名を取得
    action_name = None
    endpoint_path = None

    # ハッシュタグマップからアクション名を取得
    for tag, details in hashtag_map.items():
        action_name = details.get("name")
        if action_name:
            from backend.main import app as main_app # main.pyのFastAPIアプリをインポート
            # main.pyの登録済みエンドポイントと比較
            for route in main_app.routes:
                if isinstance(route, APIRoute) and route.name == action_name:
                    endpoint_path = route.path
                    break
            if endpoint_path:
                break

    if not endpoint_path:
        raise ValueError(f"main.pyで関連するエンドポイントを見つけられませんでした: {action_name}")

    base_url = os.getenv("API_SERVER_URL", "http://localhost:8000")
    url = f"{base_url}{endpoint_path}"  # 動的にエンドポイントを構築

    payload = {"query": text, "session_id": user_id}
    async with httpx.AsyncClient() as client:
        res = await client.post(url, json=payload, timeout=10)
    if res.status_code == 200:
        return res.json().get("recommendations", "No recommendations found.")
    raise HTTPException(status_code=res.status_code, detail=res.text)

# --- ハッシュタグ→アクションマッピング ---
ACTION_MAP: dict[str, Callable[..., Coroutine[Any, Any, str]]] = {
    "summarize_text": summarize_text,
    "translate_text": translate_text,
    "send_alert": send_alert,
    "recommend": call_recommend_endpoint,
}

async def handle_action(action_name: str, *args: Any) -> str:
    action = ACTION_MAP.get(action_name)
    if not action:
        raise ValueError(f"Unknown action: {action_name}")
    sig = inspect.signature(action)
    expected = len(sig.parameters)
    if len(args) != expected:
        raise ValueError(
            f"Action {action_name} expects {expected} args, but {len(args)} provided"
        )
    return await action(*args)

# --- Pydanticモデル ---
class RequestBody(BaseModel):
    text: str
    user_id: str

# --- FastAPIアプリ初期化 ---
app = FastAPI()

# OpenAPI スキーマのカスタマイズ
from backend.openai_config import create_custom_openapi
app.openapi = lambda: create_custom_openapi(app)