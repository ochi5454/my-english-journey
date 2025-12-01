from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2'

# モデルは1回だけロード
model = SentenceTransformer(DEFAULT_MODEL)

def get_sentence_transformer_model():
    return model