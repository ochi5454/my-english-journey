from janome.tokenizer import Tokenizer
from functools import lru_cache

@lru_cache(maxsize=1)
def get_tokenizer() -> Tokenizer:
    return Tokenizer()