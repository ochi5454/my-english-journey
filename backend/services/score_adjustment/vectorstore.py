import chromadb

# ============================================
# 📤 ベクトルDBから候補者の履歴書テキストを取得
# ============================================

# (未利用の関数だが一旦残し)
def load_resume_text_by_candidate(candidate_id: str) -> str:
    """
    候補者IDに紐づくマスク済み履歴書テキストをChromaから取得する。
    （チャット文脈に使うための全文復元用）

    Returns:
        str: 結合済みテキスト（見つからない場合は空文字列）
    """
    try:
        chroma_client = chromadb.Client()
        collection = chroma_client.get_or_create_collection("resumes_local")

        # ✅ candidate_idで検索
        results = collection.get(
            where={"candidate_id": candidate_id},
            include=["documents", "metadatas"]
        )

        # データが存在しない場合
        if not results or not results.get("documents"):
            return ""

        # 🔹 チャンク順に並べ直す
        docs_with_order = sorted(
            zip(results["documents"], results["metadatas"]),
            key=lambda x: x[1].get("chunk_index", 0)
        )

        merged_text = "\n\n".join(doc for doc, _ in docs_with_order)
        return merged_text

    except Exception as e:
        print(f"[load_resume_text_by_candidate] エラー: {e}")
        return ""