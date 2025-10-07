from collections import Counter, defaultdict
from typing import Mapping
from sqlalchemy.orm import Session
from backend.models.interviewer_evals import InterviewerRoleFocusItem
from backend.models.results_byinterview import  ResultByInterview, ResultByInterviewQATag

# ============================================
# 🧠 タグ利用状況の集計・不足分析
# ============================================

def load_role_focus_dict(db: Session) -> dict:
    """DBから division:role 単位の expected_focus を返す"""
    role_focus_dict = defaultdict(lambda: {"expected_focus": []})

    rows = db.query(InterviewerRoleFocusItem).all()
    for row in rows:
        role_key = f"{row.division.lower().strip()}:{row.role.lower().strip()}"
        role_focus_dict[role_key]["expected_focus"].append({
            "id": row.focus_id,
            "label": row.focus_label
        })

    return dict(role_focus_dict)

def load_all_prepitem_tags_by_role(meta: dict, db: Session) -> dict:
    usage_counter: defaultdict[str, Counter[str]] = defaultdict(Counter)

    # すべてのQATag取得（ResultByInterviewとJOIN）
    query = (
        db.query(ResultByInterview, ResultByInterviewQATag)
        .join(ResultByInterviewQATag, ResultByInterview.id == ResultByInterviewQATag.evaluation_id)
    )

    for parent, qa in query.all():
        user_id = parent.interviewer_id
        user_meta = meta.get(user_id)
        if not isinstance(user_meta, Mapping):
            continue

        dept = str(user_meta.get("department", "") or "").lower()
        role = str(user_meta.get("role", "") or "").lower()
        role_key = f"{dept}:{role}"

        tag_str = qa.tags or ""
        tag_list = [t.strip() for t in tag_str.split(",") if t.strip()]

        for tag_id in tag_list:
            usage_counter[role_key][tag_id] += 1

    return {rk: dict(cnt) for rk, cnt in usage_counter.items()}

def get_missing_tags(expected_tags: list, used_counter: dict) -> list:
    tag_ids = []

    for tag in expected_tags:
        if isinstance(tag, str):
            tag_ids.append(tag)
        elif isinstance(tag, dict):
            if 'id' in tag and isinstance(tag['id'], str):
                tag_ids.append(tag['id'])

    return [tag_id for tag_id in tag_ids if used_counter.get(tag_id, 0) < 1]

def extract_ids_and_labels(expected_focus: list):
    """expected_focus が string or dict の両形式に対応するユーティリティ関数"""
    ids = []
    id_to_label = {}

    for item in expected_focus:
        if isinstance(item, dict) and "id" in item and "label" in item:
            ids.append(item["id"])
            id_to_label[item["id"]] = item["label"]
        elif isinstance(item, str):
            ids.append(item)
            id_to_label[item] = item  # ラベルがない場合はIDをそのまま使う
    return ids, id_to_label