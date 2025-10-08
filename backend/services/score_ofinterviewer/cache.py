import json
from datetime import datetime
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.models.interviewer_evals import InterviewerEvaluation, EvaluationRubricScore, EvaluationComment, EvaluationRoleExpectation

# ============================================
# 🧠 キャッシュファイルの読込
# ============================================

def load_evals_for_interviewer(iid: str) -> dict:
    db: Session = SessionLocal()
    try:
        evaluations = db.query(InterviewerEvaluation).filter_by(interviewer_id=iid).all()

        rows = []
        for e in evaluations:
            rubrics = db.query(EvaluationRubricScore).filter_by(evaluation_id=e.id).all()
            comments = db.query(EvaluationComment).filter_by(evaluation_id=e.id).all()
            role_exp = db.query(EvaluationRoleExpectation).filter_by(evaluation_id=e.id).first()

            breakdown = {}
            for r in rubrics:
                if r.key:
                    breakdown[r.key] = r.score

            total_score = e.total_score

            rows.append({
                "id": e.id,
                "candidate_id": e.candidate_id,
                "interviewer_id": e.interviewer_id,
                "stage": e.stage,
                "total": total_score,
                "breakdown": breakdown, 
                "evaluated_at": e.evaluated_at.isoformat() if e.evaluated_at else None,
                "rubrics": [r.__dict__ for r in rubrics],
                "comments": [c.__dict__ for c in comments],
                "role_expectation": role_exp.__dict__ if role_exp else None,
                "note": e.note or "",
                "comments": [c.__dict__ for c in comments],
                "display_comment": e.note if e.note else (
                    next((c.text for c in comments if c.type == "reason"), "")
                ),
            })

        return {
            "version": "1",
            "generated_at": datetime.now().isoformat(),
            "interviewer_id": iid,
            "rows": rows
        }

    finally:
        db.close()

def save_evals_cache_for(iid: str, rows: list[dict]) -> None:
    db: Session = SessionLocal()
    try:
        for r in rows:
            candidate_id = r.get("candidate_id")
            stage = r.get("stage")
            if not (candidate_id and stage):
                continue

            # total_score の取得
            total_score = r.get("total") or r.get("total_score")
            skipped = r.get("skipped", False)
            skipped_int = 1 if skipped else 0
            note = r.get("note") or ""
            source_sig = r.get("source_sig") or r.get("sourceSignature") or None

            # evaluated_at
            evaluated_at_raw = r.get("evaluated_at") or r.get("evaluatedAt") or None
            evaluated_at = None
            if evaluated_at_raw:
                try:
                    evaluated_at = datetime.fromisoformat(evaluated_at_raw)
                except Exception:
                    evaluated_at = None

            # 既存 evaluation を探す
            existing = db.query(InterviewerEvaluation).filter_by(
                interviewer_id=iid,
                candidate_id=candidate_id,
                stage=stage
            ).first()

            if existing:
                # 更新
                existing.total_score = total_score
                existing.skipped = skipped_int
                existing.note = note
                existing.evaluated_at = evaluated_at
                existing.source_sig = source_sig
                db.add(existing)
                db.flush()
                eval_id = existing.id
            else:
                # 新規作成
                new_eval = InterviewerEvaluation(
                    candidate_id=candidate_id,
                    interviewer_id=iid,
                    stage=stage,
                    total_score=total_score,
                    skipped=skipped_int,
                    note=note,
                    evaluated_at=evaluated_at,
                    source_sig=source_sig
                )
                db.add(new_eval)
                db.flush()
                eval_id = new_eval.id

            # --- Rubric（detail scores） ---
            db.query(EvaluationRubricScore).filter_by(evaluation_id=eval_id).delete(synchronize_session=False)
            rubric_list = r.get("rubric") or r.get("rubrics") or []
            for item in rubric_list:
                rr = EvaluationRubricScore(
                    evaluation_id=eval_id,
                    key=item.get("key"),
                    label=item.get("label"),
                    score=int(item.get("score")) if item.get("score") is not None else None,
                    note=item.get("note") or "",
                    weight=float(item.get("weight")) if item.get("weight") is not None else None,
                    guidance=item.get("guidance") or ""
                )
                db.add(rr)

            # --- comments ---
            db.query(EvaluationComment).filter_by(evaluation_id=eval_id).delete(synchronize_session=False)
            for reason in (r.get("reasons") or []):
                db.add(EvaluationComment(evaluation_id=eval_id, type="reason", text=reason))
            for sug in (r.get("suggestions") or []):
                db.add(EvaluationComment(evaluation_id=eval_id, type="suggestion", text=sug))

            # --- role expectation ---
            db.query(EvaluationRoleExpectation).filter_by(evaluation_id=eval_id).delete(synchronize_session=False)
            role_exp = r.get("role_expectation") or {}
            if isinstance(role_exp, dict):
                db.add(EvaluationRoleExpectation(
                    evaluation_id=eval_id,
                    matched_json=json.dumps(role_exp.get("matched", []), ensure_ascii=False),
                    matched_semantic_json=json.dumps(role_exp.get("matched_semantic", []), ensure_ascii=False),
                    missing_json=json.dumps(role_exp.get("missing", []), ensure_ascii=False),
                    violated_json=json.dumps(role_exp.get("violated", []), ensure_ascii=False),
                    score=float(role_exp.get("score")) if role_exp.get("score") is not None else None,
                    comment=role_exp.get("comment") or ""
                ))

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def load_all_evals() -> dict:
    db: Session = SessionLocal()
    try:
        all_interviewer_ids = db.query(InterviewerEvaluation.interviewer_id).distinct().all()
        rows = []
        for (iid,) in all_interviewer_ids:
            result = load_evals_for_interviewer(iid)
            rows.extend(result["rows"])

        return {
            "version": "1",
            "generated_at": datetime.now().isoformat(),
            "rows": rows
        }

    finally:
        db.close()

def index_rows(rows: list[dict]) -> dict[str, dict]:
    # 🔁 遅延インポートで循環回避
    from backend.services.score_ofinterviewer.diffcheck import _row_key
    idx = {}
    for r in rows or []:
        k = _row_key(r["candidate_id"], r["interviewer_id"], r["stage"])
        idx[k] = r
    return idx

def filter_cache_rows_in_memory(
    rows: list[dict],
    stage: str|None=None,
    q: str|None=None,
    interviewer_id: str|None=None,
    candidate_id: str|None=None,
    limit: int|None=None
) -> list[dict]:
    needle = (q or "").strip().lower()
    out = []
    for r in rows or []:
        if stage and r["stage"] != stage: continue
        if interviewer_id and r["interviewer_id"] != interviewer_id: continue
        if candidate_id and r["candidate_id"] != candidate_id: continue
        if needle and (needle not in r["interviewer_id"].lower() and needle not in r["candidate_id"].lower()): continue
        out.append(r)
        if limit and len(out) >= limit: break
    out.sort(key=lambda x: (x["stage"], x["interviewer_id"], x["candidate_id"]))
    return out