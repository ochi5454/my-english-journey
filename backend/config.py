import os
from pydantic import SecretStr
from pathlib import Path
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv()

# プロジェクトのルートディレクトリを取得
PROJECT_ROOT = Path(__file__).parent  # backendフォルダー

# データディレクトリの定義
DATA_DIR = PROJECT_ROOT.parent / "data"

# APIキーの取得と検証
api_key_str = os.getenv("OPENAI_API_KEY")
if not api_key_str:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

# SecretStrに変換
OPENAI_API_KEY = SecretStr(api_key_str)

# ディレクトリの設定
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data") 
SAVE_DIR = os.path.join(BASE_DIR, "savecontext")
os.makedirs(SAVE_DIR, exist_ok=True)

# ベクトルストアのディレクトリとカウンターファイルの設定
VECTORSTORE_DIR = os.path.join(BASE_DIR, "vectorstore")
COUNTER_FILE = os.path.join(BASE_DIR, "session_counter.txt")
os.makedirs(VECTORSTORE_DIR, exist_ok=True)

# 初期メッセージの定義
INITIAL_MESSAGES = {
    "システムの初期化メッセージです。これは新しい会話の開始地点となります。",
    "ここから会話の履歴が蓄積されていきます。",
    "過去の会話内容はベクトルストアに保存され、必要に応じて参照されます。"
}