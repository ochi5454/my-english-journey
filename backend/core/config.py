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

# --- 履歴書 ---
RESUME_PATH = DATA_DIR / "resume_candidate_resume_files"
DB_PATH = DATA_DIR / "resume_structured.db"
NG_COMPANY_PATH = DATA_DIR / "ng_company_names.txt"

# --- スキル・スコア ---
RESULT_PATH = DATA_DIR / "resume_candidate_result_files"

# --- 面談日程 ---
INTERVIEWDATE_PATH = DATA_DIR / "resume_interviewdate_files"
INTERVIEWDATE_EACH_CANDIDATE_PATH = INTERVIEWDATE_PATH / "interviewdate_files"
TEMPLATE_EMAIL_CANDIDATE_PATH = INTERVIEWDATE_PATH / "mailtemplate_to_candidate.json"
TEMPLATE_EMAIL_INTERVIEWER_PATH = INTERVIEWDATE_PATH / "mailtemplate_to_interviewer.json"
TEMPLATE_INTERVIEWER_PATH = INTERVIEWDATE_PATH / "template_interviewer.json"
TEMPLATE_TODO_PATH = INTERVIEWDATE_PATH / "template_todo.json"

# --- 面談シート ---
INTERVIEWCHECKSHEET_PATH = DATA_DIR / "resume_interviewchecksheet_files"
TEMPLATE_QUALITATIVE_PATH = INTERVIEWCHECKSHEET_PATH / "template_qualitativeitems.json"
TEMPLATE_QUANTITATIVE_PATH = INTERVIEWCHECKSHEET_PATH / "template_quantitativeItems.json"
TEMPLATE_ROLETITLE_PATH = INTERVIEWCHECKSHEET_PATH / "template_roletitle.json"

# --- 面接官関連 ---
INTERVIEWER_PATH = DATA_DIR / "resume_interviewer_files"
INTERVIEWER_CHECKSHEET_PATH = INTERVIEWER_PATH / "interviewer_checksheet_files"
INTERVIEWER_EVALS_PATH = INTERVIEWER_PATH / "interviewer_evals_files"
INTERVIEWER_META_PATH = INTERVIEWER_PATH / "interviewer_roletitle.json"
INTERVIEWER_SKILLS_PATH = DATA_DIR / "resume_interviewer_mustskills_files"
INTERVIEWER_COMMONSKILLS_PATH = INTERVIEWER_SKILLS_PATH / "common.json"

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