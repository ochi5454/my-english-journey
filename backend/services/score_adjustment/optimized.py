from functools import lru_cache
import chromadb
import numpy as np
from backend.core.config import CHROMA_PATH
from backend.core.embedding_config import get_sentence_transformer_model

def get_model():
    return get_sentence_transformer_model()

@lru_cache(maxsize=128)
def search_resume_snippets(candidate_id: str, query: str, top_k: int = 3, min_score: float = 0.35):
    """
    履歴書ベクトルDBから、質問内容に関連するチャンクを検索
    """
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("resumes_local")

    # クエリをEmbedding
    model = get_model()   # ← ここで初回1回だけロード
    query_vec = model.encode([query])

    # 検索実行
    results = collection.query(
        query_embeddings=query_vec.tolist(),  # numpy → list
        n_results=top_k * 2,
        where={"candidate_id": candidate_id}
    )

    docs = results.get("documents", [[]])
    docs = docs[0] if docs else []
    distances = results.get("distances", [[]])
    distances = distances[0] if distances else []

    # ✅ 類似度スコアに変換（距離が小さいほどスコアが高い）
    snippets = []
    for doc, dist in zip(docs, distances):
        if not isinstance(doc, str):
            continue
        score = 1 / (1 + float(dist))  # ← 修正ポイント！（以前は 1 - dist）
        snippets.append({"text": doc, "score": score})

    # フィルタリング
    snippets = [s for s in snippets if s["score"] >= min_score]

    # スコア順ソート
    snippets.sort(key=lambda x: x["score"], reverse=True)
    return snippets[:top_k]


def debug_search(candidate_id: str, query: str):
    """開発者向け: 類似度と距離をそのまま出力"""
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("resumes_local")
    model = get_sentence_transformer_model()

    query_vec = model.encode([query])
    results = collection.query(
        query_embeddings=query_vec.tolist(),
        n_results=5,
        where={"candidate_id": candidate_id}
    )

    docs = results.get("documents", [[]])
    docs = docs[0] if docs else []
    distances = results.get("distances", [[]]) or [[]]
    distances = distances[0] if distances else []

    print(f"🔍 {len(docs)} 件ヒット")
    for doc, dist in zip(docs, distances):
        print(f"距離={dist:.4f} / 類似度={1/(1+dist):.4f} / doc={doc[:40]}")