from uuid import uuid4
import chromadb
from backend.core.embedding_config import get_sentence_transformer_model

# ============================================
# ✅ モデル初期化
# ============================================

model = get_sentence_transformer_model()

# ============================================
# 🧠 テキストをベクトルDBに保存
# ============================================

def save_masked_resume_embedding_local(candidate_id: str, text: str):
    """
    マスク済み履歴書テキストをローカルEmbeddingし、Chromaに保存する。
    OpenAIは一切使用しない。

    Parameters:
        candidate_id (str): 候補者ID（例：cand_0001）
        text (str): マスク済み履歴書の全文
    """
    # 1. Chromaクライアントとコレクション取得
    chroma_client = chromadb.Client()
    collection = chroma_client.get_or_create_collection("resumes_local")

    # 2. チャンク分割（簡易。必要であればtiktoken系にも変更可）
    chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]

    # 3. SentenceTransformerでベクトル化（OpenAIは一切使わない）
    embeddings = model.encode(chunks)

    # 4. Chromaに保存（candidate_idをメタデータとして追加）
    for i, chunk in enumerate(chunks):
        doc_id = f"{candidate_id}_{i}_{str(uuid4())[:8]}"  # UUIDで衝突回避
        collection.add(
            documents=[chunk],
            ids=[doc_id],
            embeddings=[embeddings[i]],
            metadatas=[{
                "candidate_id": candidate_id,
                "chunk_index": i
            }]
        )
