from functools import lru_cache
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2'
    
@lru_cache(maxsize=1)
def get_sentence_transformer_model(name: str = DEFAULT_MODEL) -> SentenceTransformer:
    return SentenceTransformer(name)