from backend.core.config import CHROMA_PATH
import chromadb

def load_resume_text_by_candidate(candidate_id: str) -> str:
    """
    候補者IDに紐づく履歴書テキストをChromaから復元
    """
    try:
        chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        collection = chroma_client.get_or_create_collection("resumes_local")

        results = collection.get(
            where={"candidate_id": candidate_id},
            include=["documents", "metadatas"]
        )

        # 🔧 Fix: Use or [] to provide default empty lists
        documents = results.get("documents") or [] if results else []
        metadatas = results.get("metadatas") or [] if results else []

        if not documents:
            print(f"⚠ 履歴書データが見つかりません: {candidate_id}")
            return ""

        # 🔧 Fix: Define a helper function that explicitly returns int
        def get_chunk_index(item: tuple) -> int:
            """Extract chunk_index from metadata, defaulting to 0"""
            _, metadata = item
            if isinstance(metadata, dict):
                chunk_idx = metadata.get("chunk_index", 0)
                # Ensure we return an int
                if isinstance(chunk_idx, int):
                    return chunk_idx
                try:
                    return int(chunk_idx)
                except (ValueError, TypeError):
                    return 0
            return 0

        docs_with_order = sorted(
            zip(documents, metadatas),
            key=get_chunk_index
        )
        
        merged_text = "\n\n".join(doc for doc, _ in docs_with_order)
        print(f"📄 履歴書復元成功: {candidate_id} ({len(docs_with_order)}件)")
        return merged_text
        
    except Exception as e:
        print(f"[load_resume_text_by_candidate] エラー: {e}")
        return ""