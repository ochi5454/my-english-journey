from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, Any, Iterable, Mapping
from backend.utils.resume_utils import _load_json

# ============================================
# 🧠 タグ利用状況の集計・不足分析
# ============================================

def load_role_focus_dict(skills_path: Path) -> dict:
    role_focus_dict = {}
    for skill_file in skills_path.glob("*.json"):
        skill_data = _load_json(skill_file)
        for role, role_data in skill_data.items():
            key = f"{skill_file.stem.lower()}:{role.lower()}"

            if isinstance(role_data, dict):
                # ✅ 正常な形式
                role_focus_dict[key] = role_data
            elif isinstance(role_data, list):
                # ✅ 旧形式への対応： expected_focus を dict に包む
                role_focus_dict[key] = {"expected_focus": role_data}
            else:
                # fallback
                role_focus_dict[key] = {"expected_focus": []}
    return role_focus_dict

def load_all_prepitem_tags_by_role(meta: Dict[str, Any], checksheet_path: Path) -> Dict[str, Dict[str, int]]:
    usage_counter: defaultdict[str, Counter[str]] = defaultdict(Counter)

    for user_dir in checksheet_path.glob("*"):
        if not user_dir.is_dir():
            continue

        user_id = user_dir.name
        user_meta = meta.get(user_id)
        if not isinstance(user_meta, Mapping):
            continue

        dept = str(user_meta.get("department", "") or "").lower()
        role = str(user_meta.get("role", "") or "").lower()
        role_key = f"{dept}:{role}"

        for json_file in user_dir.glob("*.json"):
            data = _load_json(json_file)

            # stages は dict 前提だが、型安全にガード
            stages = data.get("stages") if isinstance(data, Mapping) else None
            if not isinstance(stages, Mapping):
                continue

            for stage_data in stages.values():
                if not isinstance(stage_data, Mapping):
                    continue

                prep_items = stage_data.get("prepItems", [])
                if not isinstance(prep_items, Iterable):
                    continue

                for item in prep_items:
                    if not isinstance(item, Mapping):
                        continue

                    tags = item.get("tags", [])
                    # tags が単一文字列/オブジェクトの可能性に備えて配列化
                    if isinstance(tags, (list, tuple)):
                        tag_iter = tags
                    else:
                        tag_iter = [tags]

                    for tag in tag_iter:
                        tag_id: str | None
                        if isinstance(tag, Mapping):
                            # dict形式のときは id 優先、なければ name などもフォールバック可
                            tag_id = tag.get("id") or tag.get("name") or None
                            if tag_id is not None:
                                tag_id = str(tag_id)
                        else:
                            tag_id = str(tag) if isinstance(tag, (str, int, float)) else None

                        if tag_id:
                            usage_counter[role_key][tag_id] += 1

    # defaultdict を通常の dict にして返す（シリアライズ等で扱いやすく）
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