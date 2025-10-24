from uuid import uuid4
import os
import chromadb
from backend.core.config import CHROMA_PATH
from backend.core.embedding_config import get_sentence_transformer_model

model = get_sentence_transformer_model()

def save_masked_resume_embedding_local(candidate_id: str, text: str):
    os.makedirs(str(CHROMA_PATH), exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("resumes_local")

    chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
    embeddings = model.encode(chunks)
    embeddings = [e.tolist() for e in embeddings]  # ← numpy → list に変換！

    for i, chunk in enumerate(chunks):
        doc_id = f"{candidate_id}_{i}_{str(uuid4())[:8]}"
        collection.add(
            documents=[chunk],
            ids=[doc_id],
            embeddings=[embeddings[i]],
            metadatas=[{
                "candidate_id": candidate_id,
                "chunk_index": i
            }]
        )

    print(f"✅ Chroma 保存完了: {candidate_id} ({len(chunks)}件)")
    print(f"📁 保存先: {CHROMA_PATH}")