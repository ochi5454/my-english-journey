import os
from pydantic import SecretStr
from pathlib import Path
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv()

# APIキーの取得と検証
api_key_str = os.getenv("OPENAI_API_KEY")
if not api_key_str:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

# SecretStrに変換
OPENAI_API_KEY = SecretStr(api_key_str)

# ディレクトリの設定
# プロジェクトのルートディレクトリを取得
PROJECT_ROOT = Path(__file__).parent.parent  # MemoryPersistenceMaruyamaフォルダー（backendの親）
DATA_DIR = PROJECT_ROOT / "data"

# 候補者判定
## 履歴書
RESUME_PATH = DATA_DIR / "resume_candidate_resume_files" 
RESUME_MASKED_PATH = DATA_DIR / "resume_structured.db" 
## 必要なスキル
SKILLS_PATH = DATA_DIR / "resume_candidate_mustskills_files"
## スコアシート
RESULT_PATH = DATA_DIR / "resume_candidate_result_files"
## 面談調整関連
INTERVIEWDATE_PATH = DATA_DIR / "resume_interviewdate_files"
INTERVIEWDATE_EACH_CANDIDATE_PATH = INTERVIEWDATE_PATH / "interviewdate_files"
TEMPLATE_EMAIL_CANDIDATE_PATH = INTERVIEWDATE_PATH / "mailtemplate_to_candidate.json"
TEMPLATE_EMAIL_INTERVIEWER_PATH = INTERVIEWDATE_PATH / "mailtemplate_to_interviewer.json"
TEMPLATE_INTERVIEWER_PATH = INTERVIEWDATE_PATH / "template_interviewer.json"
TEMPLATE_TODO_PATH = INTERVIEWDATE_PATH / "template_todo.json"
## 面談シート関連
INTERVIEWCHECKSHEET_PATH = DATA_DIR / "resume_interviewchecksheet_files"
TEMPLATE_HIRIING_PATH = INTERVIEWCHECKSHEET_PATH / "template_hiringDecisions.json"
TEMPLATE_QUALITATIVE_PATH = INTERVIEWCHECKSHEET_PATH / "template_qualitativeitems.json"
TEMPLATE_QUANTITATIVE_PATH = INTERVIEWCHECKSHEET_PATH / "template_quantitativeItems.json"
TEMPLATE_ROLETITLE_PATH = INTERVIEWCHECKSHEET_PATH / "template_roletitle.json"

## 面談者評価関連
INTERVIEWER_PATH = DATA_DIR / "resume_interviewer_files"
INTERVIEWER_CHECKSHEET_PATH = INTERVIEWER_PATH / "interviewer_checksheet_files"
INTERVIEWER_EVALS_PATH = INTERVIEWER_PATH / "interviewer_evals_files"
INTERVIEWER_META_PATH = INTERVIEWER_PATH / "interviewer_roletitle.json"
### 必要なスキル
INTERVIEWER_SKILLS_PATH = DATA_DIR / "resume_interviewer_mustskills_files"
INTERVIEWER_COMMONSKILLS_PATH = INTERVIEWER_SKILLS_PATH / "common.json"

BASE_DIR = Path(__file__).parent  # backendフォルダー
SAVE_DIR = BASE_DIR / "savecontext"
SAVE_DIR.mkdir(exist_ok=True)

# ベクトルストアのディレクトリとカウンターファイルの設定
VECTORSTORE_DIR = BASE_DIR / "vectorstore"
COUNTER_FILE = BASE_DIR / "session_counter.txt"
VECTORSTORE_DIR.mkdir(exist_ok=True)

# 初期メッセージの定義
INITIAL_MESSAGES = {
    "システムの初期化メッセージです。これは新しい会話の開始地点となります。",
    "ここから会話の履歴が蓄積されていきます。",
    "過去の会話内容はベクトルストアに保存され、必要に応じて参照されます。"
}