from backend.services.score_adjustment.result_editor import load_single_result

# ============================================
# 🧠 結果シートの読込
# ============================================

def get_resume_or_empty(candidate_id: str) -> dict:
    """候補者の最新結果を取得。なければ空dict。"""
    return load_single_result(candidate_id) or {}
