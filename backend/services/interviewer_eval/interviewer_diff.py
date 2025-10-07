import json
from hashlib import sha1
from typing import Optional
from backend.core.config import (
    INTERVIEWER_CHECKSHEET_PATH,
)
from backend.utils.resume_utils import save_json
from backend.services.interviewer_eval.result_loader import get_resume_or_empty
from backend.services.interviewer_eval.prep_loader import (
    load_prep_map_with_owner, 
    iter_all_prep, 
    pick_qa_block_for
)
from backend.services.interviewer_eval.rubric_loader import load_interviewer_skills
from backend.services.interviewer_eval.rolefit_evaluator import evaluate_role_expectation_match
from backend.services.interviewer_eval.eval_cache import (
    load_all_evals, 
    index_rows, 
    load_evals_for_interviewer, 
    save_evals_cache_for,
)
from backend.services.interviewer_eval.interviewer_eval import (
    to_row_from_llm_json, 
    normalize_interviewer_eval_output, 
    eval_interviewer_once
)

# ============================================
# 🧠 差分検出・再評価
# ============================================

def _row_key(cid: str, iid: str, stage: str) -> str:
    return f"{cid}::{stage}::{iid}"

def calc_source_sig(
    cid: str, stage: str, qa_block: dict, resume: dict, rubric: dict, rolefit: dict | None = None
) -> str:
    payload = {
        "cid": cid,
        "stage": stage,
        "qa_updated_at": qa_block.get("updated_at"),
        "qa_items": qa_block.get("prepItems", []),
        "qa_qualitative": qa_block.get("qualitative", {}),
        "qa_quantitative": qa_block.get("quantitative", {}),
        "resume_updated_at": (resume or {}).get("updated_at"),
        "resume_scores": (resume or {}).get("scores", []),
        "rubric_version": rubric.get("version"),

        # 🔽 差分に使うフィールドを増やす
        "rolefit_score": rolefit.get("score") if rolefit else 0,
        "rolefit_matched": rolefit.get("matched", []) if rolefit else [],
        "rolefit_missing": rolefit.get("missing", []) if rolefit else [],
        "rolefit_violated": rolefit.get("violated", []) if rolefit else [],
        "rolefit_comment": rolefit.get("comment", "") if rolefit else "",
    }
    j = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return sha1(j.encode("utf-8")).hexdigest()

def list_diff_targets(stage: str|None=None, q: str|None=None, limit: int|None=None) -> dict:
    prep_map = load_prep_map_with_owner()
    rubric = load_interviewer_skills()

    # すべての shard を合算して index
    agg = load_all_evals()  # {"rows": [...]}
    idx = index_rows(agg.get("rows") or [])

    resume_cache: dict[str, dict] = {}
    missing, stale = [], []
    needle = (q or "").strip().lower()

    for cid, stg, block in iter_all_prep(prep_map):
        if stage and stg != stage:
            continue
        iid = block.get("interviewer_id", "unknown")

        if not block.get("eval_required", False):
            continue
        if needle and (needle not in iid.lower() and needle not in cid.lower()):
            continue

        if cid not in resume_cache:
            resume_cache[cid] = get_resume_or_empty(cid)
        resume = resume_cache[cid]

        rolefit = evaluate_role_expectation_match(iid, block)
        sig = calc_source_sig(cid, stg, block, resume, rubric, rolefit=rolefit)
        k = _row_key(cid, iid, stg)
        cached = idx.get(k)

        if not cached:
            missing.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})
        elif cached.get("source_sig") != sig:
            stale.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})

        if limit and (len(missing) + len(stale)) >= limit:
            break

    return {"missing": missing, "stale": stale}

def refresh_targets_and_upsert(
        targets: list[dict], 
        model: str = "gpt-4",
        include_reasons: bool = True,
        skip_eval: bool = False
    ) -> list[dict]:
    if not targets: return []

    rubric = load_interviewer_skills()
    prep_map = load_prep_map_with_owner()
    resume_cache: dict[str, dict] = {}

    # 面談者ごとに束ねて1ファイルずつ更新
    by_iid: dict[str, list[dict]] = {}
    for t in targets:
        by_iid.setdefault(t["interviewer_id"], []).append(t)

    updated_rows: list[dict] = []

    for iid, iid_targets in by_iid.items():
        result = load_evals_for_interviewer(iid)
        rows = result["rows"]
        idx = index_rows(rows)

        for t in iid_targets:
            cid, stg = t["candidate_id"], t["stage"]
            if cid not in resume_cache:
                resume_cache[cid] = get_resume_or_empty(cid)
            resume = resume_cache[cid]

            blocks = (prep_map.get(cid, {}).get(stg, []) or [])
            qa_block = next((b for b in blocks if b.get("interviewer_id") == iid),
                            (blocks[0] if blocks else {}))
            
            if not qa_block.get("eval_required", False):
                continue

            result = evaluate_interviewer_single(
                candidate_id=cid,
                interviewer_id=iid,
                stage=stg,
                resume_result=resume,
                qa_block=qa_block,
                model=model,
                include_reasons=include_reasons,
                skip_eval=skip_eval
            )

            sig = calc_source_sig(cid, stg, qa_block, resume, rubric, rolefit=result.get("role_expectation"))
            row = to_row_from_llm_json(cid, iid, stg, result, rubric, sig)
            row["role_expectation"] = result.get("role_expectation", {})

            idx[_row_key(cid, iid, stg)] = row
            updated_rows.append(row)

            # 🔸 ここで eval_required を False に落とす
            qa_block["eval_required"] = False

        # idx → rows に戻してこの面談者ファイルにだけ保存
        rows = list(idx.values())
        rows.sort(key=lambda r: (r["stage"], r["interviewer_id"], r["candidate_id"]))
        save_evals_cache_for(iid, rows)
        save_checksheet_map(prep_map)

    return updated_rows

def evaluate_interviewer_single(
    candidate_id: str,
    interviewer_id: str,
    stage: str,
    resume_result: Optional[dict] = None,
    qa_block: Optional[dict] = None,
    model: str = "gpt-4",
    include_reasons: bool = True,
    skip_eval: bool = False
) -> dict:
    """
    面談者1名×1ステージの評価を完結させるサービス関数。
    入力が無ければ自動で取りに行く。
    """
    print(f"✅モデル/理由スキップ/基礎スコアスキップ： {model}/ {include_reasons}/ {skip_eval}")
    resume = resume_result or get_resume_or_empty(candidate_id)
    if qa_block is None:
        prep_map = load_prep_map_with_owner()
        qa_block = pick_qa_block_for(prep_map, candidate_id, stage, interviewer_id)

    rubric = load_interviewer_skills()
    if not skip_eval:
        raw = eval_interviewer_once(
            interviewer_id, stage, 
            resume, 
            qa_block, 
            rubric, 
            model=model,
            include_reasons=include_reasons
        )

        # LLMが壊れても最低限の形に
        if not isinstance(raw, dict):
            try:
                raw = json.loads(raw)  # 念のため
            except Exception:
                raw = {"score": 0, "criteria": [], "reasons": ["LLM出力の解析に失敗"], "suggestions": []}
    else:
        raw = {"score": 0, "criteria": [], "reasons": [], "suggestions": [], "skipped": True, "note": "このスコアはLLMによる基礎スコア評価をスキップしたため、実スコアではありません"}  # 👈 スコアは0点固定

    result = normalize_interviewer_eval_output(raw, rubric, interviewer_id, candidate_id, stage)
    print("\n========== [DEBUG] Evaluated result before role_expectation ==========")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("=======================================================================\n")

    # 🔽 追加: 部署×ロール適合度を計算して追記
    rolefit = evaluate_role_expectation_match(interviewer_id, qa_block)
    # 🔽 スコアを計算して明示的に追加（冪等ではあるが確実にする）
    expected_count = len(rolefit.get("matched", [])) + len(rolefit.get("missing", []))
    rolefit["score"] = round(len(rolefit.get("matched", [])) / max(expected_count, 1) * 10, 1)

    result["role_expectation"] = rolefit

    return result

def save_checksheet_map(prep_map: dict):
    for cid, stage_blocks in prep_map.items():
        for stage, blocks in stage_blocks.items():
            for block in blocks:
                iid = block.get("interviewer_id")
                if not iid:
                    continue
                filepath = INTERVIEWER_CHECKSHEET_PATH / iid / f"{cid}.json"
                # 保存対象の1人分の dict を構成
                content = {
                    "interviewer_id": iid,
                    "candidate_id": cid,
                    "stages": {
                        stage: block
                    }
                }
                save_json(filepath, content)
