from uuid import uuid4
import os
from pathlib import Path
from backend.core.config import CHROMA_PATH
from backend.core.embedding_config import get_sentence_transformer_model
from backend.core.chroma_client import get_resume_collection

model = get_sentence_transformer_model()

def save_masked_resume_embedding_local(candidate_id: str, text: str):
    os.makedirs(str(CHROMA_PATH), exist_ok=True)
    
    # ✅ テキストファイルとしても保存
    text_dir = Path(CHROMA_PATH) / "texts"
    text_dir.mkdir(exist_ok=True)
    text_file = text_dir / f"{candidate_id}.txt"
    text_file.write_text(text, encoding="utf-8")
    
    # ChromaDB保存
    collection = get_resume_collection()

    chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]

    embeddings = model.encode(chunks)
    embeddings = [e.tolist() for e in embeddings]

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

def get_masked_resume_text_local(candidate_id: str) -> str:
    """
    保存されたテキストを取得（優先順位: ファイル > ChromaDB）
    """
    # ① テキストファイルから取得を試みる
    text_dir = Path(CHROMA_PATH) / "texts"
    text_file = text_dir / f"{candidate_id}.txt"
    
    if text_file.exists():
        return text_file.read_text(encoding="utf-8")
    
    # ② ChromaDBから取得を試みる
    collection = get_resume_collection()
    
    results = collection.get(
        where={"candidate_id": candidate_id},
        include=["documents", "metadatas"]
    )
    
    if not results or not results["documents"]:
        raise FileNotFoundError(f"履歴書テキストが見つかりません: {candidate_id}")
    
    documents = results["documents"]
    metadatas = results["metadatas"]
    
    if not documents or not metadatas:
        raise FileNotFoundError(f"履歴書データが不完全です: {candidate_id}")
    
    chunks = []
    for doc, meta in zip(documents, metadatas):
        chunks.append((meta["chunk_index"], doc))
    
    chunks.sort(key=lambda x: x[0])
    return "\n\n".join([chunk[1] for chunk in chunks])