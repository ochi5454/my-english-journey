import json
from pathlib import Path
from backend.core.config import INTERVIEWER_META_PATH
from backend.core.database import SessionLocal
from backend.utils.division import get_expected_focus_items

# ============================================
# 🧠 観点スコア評価（部門・ロール観点におけるタグ網羅性）
# ============================================

def evaluate_role_expectation_match(interviewer_id: str, qa_block: dict) -> dict:
    meta = get_interviewer_meta(interviewer_id)
    dept = meta.get("department")
    role = meta.get("role")

    if not dept or not role:
        return {
            "matched": [],
            "matched_semantic": [],
            "missing": [],
            "violated": [],
            "comment": "部署/ロール情報なし",
            "score": 0.0
        }

    with SessionLocal() as db:
        expected_items = get_expected_focus_items(dept, role, db)

    if not expected_items:
        return {
            "matched": [],
            "missing": [],
            "violated": [],
            "comment": f"DBにロール {role} の期待観点が存在しない",
            "score": 0.0
        }
    expected_ids = {item["id"] for item in expected_items}
    id_to_label = {item["id"]: item["label"] for item in expected_items}

    selected_tags = set()
    for item in qa_block.get("prepItems", []):
        tags = item.get("tags", [])
        selected_tags.update(tags)

    matched_ids = [tag_id for tag_id in expected_ids if tag_id in selected_tags]
    missing_ids = [tag_id for tag_id in expected_ids if tag_id not in selected_tags]

    role_expectation = {
        "matched": [id_to_label[i] for i in matched_ids],
        "matched_semantic": [],
        "missing": [id_to_label[i] for i in missing_ids],
        "violated": [],
        "comment": f"タグ評価: 期待観点 {len(expected_ids)} 件中 {len(matched_ids)} 件マッチ",
        "score": calc_role_score({
            "matched": matched_ids,
            "missing": missing_ids,
            "violated": []
        })
    }

    return role_expectation

def calc_role_score(role_expectation: dict) -> float:
    """
    role_expectation から柔らかいロールスコア（float）を計算する。
    violated があっても最低4点を保証する優しい評価。
    """
    if not role_expectation:
        return 0.0

    matched = len(role_expectation.get("matched", []))
    missing = len(role_expectation.get("missing", []))
    violated = len(role_expectation.get("violated", []))
    total = matched + missing

    if total == 0:
        return 0.0

    # 優しい段階スコア + 減点（最低4点保証）
    ratio = matched / total
    if matched == 0:
        score = 4
    elif ratio < 0.34:
        score = 6
    elif ratio < 0.67:
        score = 8
    elif ratio < 1.0:
        score = 9
    else:
        score = 10

    return max(score - violated * 1, 4.0)

def get_interviewer_meta(interviewer_id: str) -> dict:
    """
    面接官IDから部署・ロールなどのメタ情報を取得。
    全員分が1ファイルにまとまっている形式に対応。
    """
    meta_file: Path = INTERVIEWER_META_PATH  # ← JSONファイルそのもの
    if not meta_file.exists():
        return {}
    try:
        with open(meta_file, encoding="utf-8") as f:
            all_meta = json.load(f)
            return all_meta.get(interviewer_id, {})
    except Exception as e:
        print(f"[WARN] 面接官メタ情報の読み込み失敗 ({interviewer_id}): {e}")
        return {}
