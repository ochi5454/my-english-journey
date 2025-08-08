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
# 商品推薦
FEEDBACK_DIR = DATA_DIR / "feedback"
# PPTX検索
FILESUMMARY_PATH = DATA_DIR /  "file_summary.db"
PPTXUPLOAD_DIR = DATA_DIR / "pptx_files"  
PDFUPLOAD_DIR = DATA_DIR / "pdf_files" 
IMGUPLOAD_DIR = DATA_DIR / "image_files" 
PPTX_INDEX_PATH = DATA_DIR / "pptx_index.json" 
# 候補者判定
RESUME_PATH = DATA_DIR / "candidate_resume_files"
SKILLS_PATH = DATA_DIR / "candidate_mustskills_files"
RESULT_PATH = DATA_DIR / "candidate_result_files"
INTERVIEW_PATH = DATA_DIR / "candidate_interview_db"
INTERVIEWER_PATH = INTERVIEW_PATH / "interviewer.json"
INTERVIEW_TODO_PATH = INTERVIEW_PATH / "todo.json"
INTERVIEWER_EMAIL_PATH = INTERVIEW_PATH / "template_to_interviewer.json"
CANDIDATE_EMAIL_PATH = INTERVIEW_PATH / "template_to_candidate.json"
CANDIDATE_DATA_PATH = INTERVIEW_PATH / "interview_date"
INTERVIEW_QA_PATH = INTERVIEW_PATH / "interview_prep"

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