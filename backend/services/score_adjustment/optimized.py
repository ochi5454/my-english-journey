from functools import lru_cache
import chromadb
from backend.core.embedding_config import get_sentence_transformer_model

# ✅ SentenceTransformerモデルの初期化（OpenAI不使用）
model = get_sentence_transformer_model()

# ============================================
# 🔍 履歴書検索 with キャッシュ + 信頼度しきい値
# ============================================

@lru_cache(maxsize=128)
def search_resume_snippets(
    candidate_id: str,
    query: str,
    top_k: int = 3,
    min_score: float = 0.35,
):
    """
    履歴書ベクトルDBから、質問内容に関連するチャンクを検索する。
    キャッシュとスコアフィルタで最適化。

    Returns:
        List[dict] = [{ "text": str, "score": float }]
    """
    chroma_client = chromadb.Client()
    collection = chroma_client.get_or_create_collection("resumes_local")

    # クエリをEmbedding
    query_vec = model.encode([query])

    # 検索実行（やや多めに取る）
    results = collection.query(
        query_embeddings=query_vec,
        n_results=top_k * 2,
        where={"candidate_id": candidate_id}
    )

    docs = results.get("documents", [[]])[0]
    scores = results.get("distances", [[]])[0]

    # ✅ スコアフィルタ（低スコアの無関係チャンクを除外）
    snippets = [
        {"text": doc, "score": float(score)}
        for doc, score in zip(docs, scores)
        if isinstance(doc, str) and float(score) >= min_score
    ]

    # スコア順でソートして上位のみ返す
    snippets.sort(key=lambda x: x["score"], reverse=True)
    return snippets[:top_k]