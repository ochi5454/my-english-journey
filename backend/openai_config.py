from fastapi.openapi.utils import get_openapi
from typing import Any, Dict
import os
from dotenv import load_dotenv

# 環境変数をロード
load_dotenv()

def create_custom_openapi(app: Any) -> Dict[str, Any]:
    """
    共通のOpenAPIスキーマを生成する関数
    
    Args:
        app: FastAPIアプリケーションインスタンス
        
    Returns:
        Dict[str, Any]: カスタマイズされたOpenAPIスキーマ
    """
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=os.getenv("API_TITLE", "Rag Testing API"),
        version=os.getenv("API_VERSION", "1.0.0"),
        description=os.getenv("API_DESCRIPTION", "Conversation and memory management API with LangChain integration"),
        routes=app.routes,
    )

    # カスタムサーバー情報を追加
    openapi_schema["servers"] = [
        {
            "url": os.getenv("API_SERVER_URL", "http://localhost:8000"),
            "description": "ngrok tunnel to local FastAPI"
        }
    ]

    # セキュリティスキーマの追加
    openapi_schema["components"]["securitySchemes"] = {
        "APIKeyHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key"
        }
    }

    return openapi_schema