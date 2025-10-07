import os
import json
import shutil
import io
from datetime import datetime
from fastapi import HTTPException, APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import HTTPException
from pathlib import Path
from backend.core.database import get_db
from backend.core.config import (
    RESUME_PATH, 
    RESULT_PATH, 
    MIME_TO_EXT
)
from backend.models.interview_schedule import InterviewSchedule
from backend.utils.resume_utils import save_result_to_file
from backend.services.resume_upload.scorer import score_resume
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

@router.post("/resume-score") # 📄 パタン1 履歴書をそのまま保存し、スコア判定
async def resume_score(
    file: UploadFile = File(...),
    candidate_id: str = Form(...),
    uploader_id: str = Form(...)
):
    save_filename = f"{candidate_id}_{file.filename}"
    save_path = RESUME_PATH / save_filename

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        result = score_resume(str(save_path), candidate_id)

        result["uploader_id"] = uploader_id
        result["timestamp"] = datetime.now().isoformat()

        # 👇 1ファイル上書き保存に統一
        save_result_to_file(result, candidate_id)

        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(
            content={"error": f"処理中に例外が発生しました: {str(e)}"},
            status_code=500
        )

@router.post("/resume-score-no-save") # 📄 パタン2 履歴書をマスクし、ベクトルDB、SQLに保存し、スコア判定
async def resume_score_no_save(
    file: UploadFile = File(...),
    candidate_id: str = Form(...),
    uploader_id: str = Form(...)
):
    try:
        # 0) filename の None ガード & 正規化（パストラバーサル対策で basename 抽出）
        raw_filename = (file.filename or "").strip()
        safe_name = Path(raw_filename).name if raw_filename else ""
        ext = Path(safe_name).suffix.lower()

        # content_type から拡張子フォールバック
        if not ext and file.content_type in MIME_TO_EXT:
            ext = MIME_TO_EXT[file.content_type]

        if not ext:
            return JSONResponse(content={"error": "ファイル拡張子を判定できませんでした"}, status_code=400)

        # 1) メモリ読み込み
        content = await file.read()
        file_stream = io.BytesIO(content)

        # 2) ファイル形式ごとの抽出（ext は必ず小文字）
        if ext == ".pdf":
            extracted_text = extract_resume_text_from_pdf(file_stream)
        elif ext in (".docx", ".doc"):
            extracted_text = extract_resume_text_from_docx(file_stream)
        elif ext in (".xlsx", ".xls"):
            extracted_text = extract_resume_text_from_xlsx(file_stream)
        else:
            return JSONResponse(content={"error": f"未対応のファイル形式です: {ext}"}, status_code=400)

        if not (extracted_text or "").strip():
            return JSONResponse(content={"error": "ファイルからテキストを抽出できませんでした"}, status_code=400)

        # 3) マスク処理
        masked_text = mask_personal_info(extracted_text)

        # 4) ベクトルDB保存（候補者ID付き）
        save_masked_resume_embedding_local(candidate_id, masked_text)

        # 5) SQL構造生成（候補者ID付き）
        generated_sql = generate_resume_sql(masked_text, candidate_id)

        # 6) SQLiteに保存
        save_sql_to_sqlite(generated_sql)

        # 返却（スコアはスキップ中）
        result = {
            "candidate_id": candidate_id,
            "uploader_id": uploader_id,
            "timestamp": datetime.now().isoformat(),
            "generated_sql": generated_sql,
            "message": "✅ ベクトルDBとSQLite保存は成功しました（スコアリングはスキップ中）"
        }
        return JSONResponse(content=result)

    except Exception as e:
        print(f"❌ エラー: {e}")
        return JSONResponse(content={"error": f"処理中に例外が発生しました: {str(e)}"}, status_code=500)

@router.get("/resume-results")
async def get_resume_results():
    results = []
    for file in RESULT_PATH.glob("*.json"):
        try:
            with open(file, encoding='utf-8') as f:
                results.append(json.load(f))
        except Exception as e:
            continue
    return JSONResponse(content=results)

@router.get("/resume-result/{candidate_id}")
async def get_result_by_candidate_id(candidate_id: str):
    files = sorted(RESULT_PATH.glob(f"{candidate_id}_*.json"), reverse=True)
    if not files:
        return JSONResponse(content={"error": "結果が見つかりません"}, status_code=404)

    try:
        with open(files[0], encoding="utf-8") as f:
            result_data = json.load(f)

        # ✅ DBセッション
        with get_db() as db:
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

        return JSONResponse(content=result_data)

    except Exception as e:
        # ✅ エラー内容をコンソールに出す
        print("❌ エラー内容:", str(e))
        import traceback
        traceback.print_exc()

        return JSONResponse(content={"error": str(e)}, status_code=500)

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