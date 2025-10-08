import os
import io
from uuid import uuid4
from datetime import datetime
from fastapi import HTTPException, APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import HTTPException
from pathlib import Path
from backend.core.database import SessionLocal
from backend.core.config import (
    RESUME_PATH, 
    MIME_TO_EXT
)
from backend.models.candidate_evals import Candidate, CandidateDivisionScore, CandidateScoreHistory, CandidateMustCheckItem, CandidateStatus
from backend.models.interview_schedule import InterviewSchedule
from backend.services.resume_upload.scorer import score_resume_from_text
from backend.services.resume_upload.extractor import (
    extract_resume_text_from_pdf, 
    extract_resume_text_from_docx, 
    extract_resume_text_from_xlsx
)
from backend.services.resume_upload.text_sanitizer import mask_personal_info
from backend.services.resume_upload.vectorstore import save_masked_resume_embedding_local
from backend.services.resume_upload.sql_builder import (
    generate_resume_sql, 
    save_sql_to_sqlite
)

router = APIRouter()

#  ============================================
#  📮 履歴書保存・スコアリング
#  ============================================

@router.post("/resume-score-save")
async def resume_score_save(
    file: UploadFile = File(...),
    candidate_id: str = Form(...),
    uploader_id: str = Form(...)
):
    try:
        # === ① 拡張子チェックと読み込み ===
        raw_filename = (file.filename or "").strip()
        ext = Path(raw_filename).suffix.lower()

        if not ext and file.content_type in MIME_TO_EXT:
            ext = MIME_TO_EXT[file.content_type]

        if not ext:
            return JSONResponse(content={"error": "拡張子不明"}, status_code=400)

        content = await file.read()
        file_stream = io.BytesIO(content)

        # === ② ファイル形式に応じたテキスト抽出 ===
        if ext == ".pdf":
            extracted_text = extract_resume_text_from_pdf(file_stream)
        elif ext in (".doc", ".docx"):
            extracted_text = extract_resume_text_from_docx(file_stream)
        elif ext in (".xls", ".xlsx"):
            extracted_text = extract_resume_text_from_xlsx(file_stream)
        else:
            return JSONResponse(content={"error": f"未対応形式: {ext}"}, status_code=400)

        if not extracted_text.strip():
            return JSONResponse(content={"error": "テキスト抽出失敗"}, status_code=400)

        # === ③ マスキング処理 ===
        masked_text = mask_personal_info(extracted_text)

        # === ④ ベクトルDB保存 ===
        save_masked_resume_embedding_local(candidate_id, masked_text)

        # === ⑤ SQL構造保存（オプション） ===
        generated_sql = generate_resume_sql(masked_text, candidate_id)
        save_sql_to_sqlite(generated_sql)

        # === ⑥ の前に Candidate を保存 ===
        now = datetime.utcnow()

        with SessionLocal() as db:
            candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
            if not candidate:
                candidate = Candidate(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    uploader_id=uploader_id,
                    updated_by="system",
                    updated_at=now
                )
                db.add(candidate)
            else:
                candidate.updated_by = "system"
                candidate.updated_at = now
            db.commit()

        # === ⑥ LLMスコアリング実行 ===
        scoring_result = score_resume_from_text(masked_text, candidate_id)

        # === ⑦ スコア・must_checkをDBに保存 ===
        now = datetime.utcnow()

        with SessionLocal() as db:
            # 🎯 candidates テーブル更新 or INSERT
            candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
            if not candidate:
                candidate = Candidate(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    recommended_div=scoring_result.get("recommended_division"),
                    uploader_id=uploader_id,
                    updated_by="system",
                    updated_at=now
                )
                db.add(candidate)
            else:
                candidate.recommended_div = scoring_result.get("recommended_division")
                candidate.updated_by = "system"
                candidate.updated_at = now

            # 🎯 must_check項目 保存（一旦削除→追加）
            db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).delete()
            for name, info in scoring_result.get("must_check", {}).items():
                db.add(CandidateMustCheckItem(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    item_name=name,
                    result=info.get("result", False),
                    reason=info.get("reason", "")
                ))

            # 🎯 divisionスコア 保存（削除→追加）
            db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).delete()
            for s in scoring_result.get("scores", []):
                db.add(CandidateDivisionScore(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    division=s["division"],
                    score=s["score"],
                    reason=s["reason"]
                ))

                # 🎯 スコア履歴（追加のみ）
                db.add(CandidateScoreHistory(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    division=s["division"],
                    score=s["score"],
                    reason=s["reason"],
                    reviewer="system",
                    reviewed_at=now,
                    source="resume_score_save"
                ))

            db.commit()

        # === ⑧ 応答 ===
        return JSONResponse(content={
            "candidate_id": candidate_id,
            "uploader_id": uploader_id,
            "timestamp": now.isoformat(),
            "generated_sql": generated_sql,

            # 直接参照できるようトップレベルにも展開
            "recommended_division": scoring_result.get("recommended_division"),
            "must_check": scoring_result.get("must_check"),
            "scores": scoring_result.get("scores"),

            # 既存のネストも残す（将来用）
            "llm_scoring": scoring_result,

            "message": "✅ 全データ保存完了"
        })

    except Exception as e:
        print("❌ エラー:", str(e))
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": f"処理中に例外が発生しました: {str(e)}"}, status_code=500)

@router.get("/resume-results")
async def get_resume_results():
    with SessionLocal() as db:
        candidates = db.query(Candidate).all()
        results = []

        for c in candidates:
            user_id = c.user_id

            must_checks = db.query(CandidateMustCheckItem)\
                .filter_by(user_id=user_id).all()
            scores = db.query(CandidateDivisionScore)\
                .filter_by(user_id=user_id).all()

            result = {
                "user_id": user_id,
                "user_name": c.name,
                "recommended_division": c.recommended_div,
                "uploader_id": c.uploader_id,
                "timestamp": c.updated_at.isoformat() if c.updated_at else None,
                "must_check": {
                    m.item_name: {"result": m.result, "reason": m.reason}
                    for m in must_checks
                },
                "scores": [
                    {"division": s.division, "score": s.score, "reason": s.reason}
                    for s in scores
                ]
            }
            results.append(result)

        return JSONResponse(content=results)

@router.get("/resume-result/{candidate_id}")
async def get_result_by_candidate_id(candidate_id: str):
    with SessionLocal() as db:
        c = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not c:
            return JSONResponse(content={"error": "候補者が見つかりません"}, status_code=404)

        must_checks = db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).all()
        scores = db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).all()
        histories = db.query(CandidateScoreHistory).filter_by(user_id=candidate_id).order_by(CandidateScoreHistory.reviewed_at.desc()).all()

        history_map = {}
        for h in histories:
            history_map.setdefault(h.division, []).append({
                "score": h.score,
                "reason": h.reason,
                "reviewer": h.reviewer,
                "reviewed_at": h.reviewed_at.isoformat() if h.reviewed_at else None,
                "source": h.source
            })

        # ✅ reviewed_at の最新値を取得
        latest_status = (
            db.query(CandidateStatus)
            .filter(CandidateStatus.user_id == candidate_id)
            .order_by(CandidateStatus.reviewed_at.desc())
            .first()
        )
        latest_reviewed_at = latest_status.reviewed_at if latest_status else None

        result_data = {
            "user_id": candidate_id,
            "recommended_division": c.recommended_div,
            "uploader_id": c.uploader_id,
            "timestamp": latest_reviewed_at.isoformat() if latest_reviewed_at else None,  # ← ここを修正
            "must_check": {
                m.item_name: {"result": m.result, "reason": m.reason}
                for m in must_checks
            },
            "scores": [
                {
                    "division": s.division,
                    "score": s.score,
                    "reason": s.reason,
                    "score_history": history_map.get(s.division, [])
                }
                for s in scores
            ]
        }

        # ✅ 面談日程情報
        schedules = db.query(InterviewSchedule).filter_by(candidate_id=candidate_id).all()
        for s in schedules:
            if s.interview_stage == "interview_1":
                result_data["interview_1_date"] = s.scheduled_at.isoformat()
            elif s.interview_stage == "interview_2":
                result_data["interview_2_date"] = s.scheduled_at.isoformat()
            elif s.interview_stage == "interview_final":
                result_data["interview_final_date"] = s.scheduled_at.isoformat()
        if schedules:
            result_data["last_updated"] = max(s.last_updated for s in schedules).isoformat()

        # ✅ ステージごとの最終レビュー者情報
        status_rows = db.query(CandidateStatus).filter_by(user_id=candidate_id).all()
        for status in status_rows:
            stage = status.stage
            if stage:
                result_data[f"chat_review_{stage}_at"] = status.reviewed_at.isoformat() if status.reviewed_at else None
                result_data[f"chat_reviewer_{stage}"] = status.chat_reviewer

        return JSONResponse(content=result_data)

@router.get("/resumes/by-candidate/{candidate_id}")
async def get_resume_by_candidate(candidate_id: str):
    """
    cand_{candidate_id}_xxxx.docx の形式にマッチするファイルを1件返す
    """
    # ディレクトリ内を検索
    matching_files = [
        f for f in os.listdir(RESUME_PATH)
        if f.startswith(f"cand_{candidate_id}_")
    ]

    if not matching_files:
        raise HTTPException(status_code=404, detail="Resume not found")

    # 一致ファイルのうち1件目を返す（複数ある場合は最初のファイル）
    target_file = RESUME_PATH / matching_files[0]
    return FileResponse(
        path=target_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=target_file.name
    )