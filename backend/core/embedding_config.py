from pathlib import Path
import os
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2'

# オフライン環境ではローカルパスを環境変数 LOCAL_SENTENCE_MODEL_PATH で指定できる
local_model_path = os.getenv("LOCAL_SENTENCE_MODEL_PATH")
model_source = Path(local_model_path).expanduser() if local_model_path else DEFAULT_MODEL

# モデルは1回だけロード
model = SentenceTransformer(str(model_source))

def get_sentence_transformer_model():
    return model
