import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from pydantic import SecretStr

# ============================================
# ✅ OpenMP ライブラリ設定（副作用コードは先頭に）
# ============================================
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# ============================================
# ✅ ベースディレクトリ設定
# ============================================
CORE_DIR = Path(__file__).parent
BACKEND_DIR = CORE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# ============================================
# ✅ 環境変数の読み込み
# ============================================
DOTENV_PATH = BACKEND_DIR / ".env"
if DOTENV_PATH.exists():
    load_dotenv(dotenv_path=DOTENV_PATH)

api_key_str = os.getenv("OPENAI_API_KEY")
if not api_key_str:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

OPENAI_API_KEY = SecretStr(api_key_str)

# ============================================
# ✅ ログ設定
# ============================================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================
# ✅ データディレクトリ定義
# ============================================

DB_PATH = DATA_DIR / "resume_structured.db"

# --- 履歴書ファイル（→外部dbとの接続により削除予定） ---
RESUME_PATH = DATA_DIR / "candidate_resume_files"

# --- 面談日程関連テンプレ ---
TEMPLATE_EMAIL_CANDIDATE_PATH = DATA_DIR / "mailtemplate_to_candidate.json"
TEMPLATE_EMAIL_INTERVIEWER_PATH = DATA_DIR / "mailtemplate_to_interviewer.json"
TEMPLATE_INTERVIEWER_PATH = DATA_DIR / "template_interviewer.json"
TEMPLATE_TODO_PATH = DATA_DIR / "template_todo.json"

# --- 面接官情報（→外部dbとの接続により削除予定）---
INTERVIEWER_META_PATH = DATA_DIR / "interviewer_roletitle.json"

# --- マスク対象会社データ ---
NG_COMPANY_PATH = DATA_DIR / "ng_company_names.txt"

# ============================================
# ✅ MIMEタイプマッピング
# ============================================
MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
}