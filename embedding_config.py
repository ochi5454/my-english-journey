from typing import Optional, Dict
from functools import lru_cache
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.embeddings import Embeddings

# デフォルトの設定
DEFAULT_MODEL = "all-MiniLM-L6-v2"
DEFAULT_CONFIG = {
    "encode_kwargs": {
        "normalize_embeddings": True
    },
    "model_kwargs": {
        "device": "cpu"
    }
}

@lru_cache(maxsize=1)
def get_embedding_model(
    model_name: str = DEFAULT_MODEL,
    config: Optional[Dict] = None
) -> Embeddings:
    """
    埋め込みモデルを初期化して返す

    Args:
        model_name (str): 使用するHuggingFaceモデルの名前
        config (Optional[Dict]): モデルの追加設定

    Returns:
        Embeddings: 初期化された埋め込みモデル

    Raises:
        ValueError: モデルの初期化に失敗した場合
    """
    try:
        model_config = DEFAULT_CONFIG.copy()
        if config:
            model_config.update(config)

        return HuggingFaceEmbeddings(
            model_name=model_name,
            encode_kwargs=model_config["encode_kwargs"],
            model_kwargs=model_config["model_kwargs"]
        )
    except Exception as e:
        raise ValueError(f"Failed to initialize embedding model: {str(e)}")