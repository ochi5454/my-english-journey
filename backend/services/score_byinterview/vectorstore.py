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

        if not results or not results.get("documents"):
            print(f"⚠ 履歴書データが見つかりません: {candidate_id}")
            return ""

        docs_with_order = sorted(
            zip(results["documents"], results["metadatas"]),
            key=lambda x: x[1].get("chunk_index", 0)
        )
        merged_text = "\n\n".join(doc for doc, _ in docs_with_order)
        print(f"📄 履歴書復元成功: {candidate_id} ({len(docs_with_order)}件)")
        return merged_text
    except Exception as e:
        print(f"[load_resume_text_by_candidate] エラー: {e}")
        return ""