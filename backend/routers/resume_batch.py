from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from typing import List
import asyncio
import json

from backend.services.score_resume.batch_processor import BatchResumeProcessor
from backend.services.score_resume.score import score_resume_from_text_async
from backend.services.score_resume.extract import (
    extract_resume_text_from_pdf,
    extract_resume_text_from_docx,
    extract_resume_text_from_xlsx,
    normalize_pdf_text
)
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate
from pathlib import Path
import io

router = APIRouter()

@router.post("/resume-batch-upload")
async def resume_batch_upload(
    files: List[UploadFile] = File(...),
    uploader_id: str = Form(...)
):
    """
    複数履歴書の一括アップロード（軽量版）
    
    処理内容:
    - 各ファイルから基本情報のみ抽出（名前・性別・志望動機・職務経歴）
    - 詳細スコアリングは後から個別に実行
    - 並列処理で高速化（デフォルト5件同時）
    
    Returns:
        {
            "total": 処理件数,
            "success": 成功件数,
            "error": エラー件数,
            "processing_time": 処理時間（秒）,
            "results": [...],
            "successful_candidates": [...]  # 成功した候補のみ
        }
    """
    if not files:
        raise HTTPException(status_code=400, detail="ファイルが選択されていません")
    
    # ファイルを読み込み
    file_data = []
    for file in files:
        content = await file.read()
        await file.close()
        file_data.append({
            "filename": file.filename or "unknown",
            "content": content
        })
    
    # 並列処理（最大5件同時）
    processor = BatchResumeProcessor(max_concurrent=5)
    result = await processor.process_batch(file_data, uploader_id)
    
    return JSONResponse(content=result)


@router.post("/resume-batch-score/{candidate_id}")
async def resume_batch_score(candidate_id: str):
    """
    一括アップロード後の詳細スコアリング
    
    処理内容:
    - 既存の詳細スコアリング処理を実行
    - マストチェック + 全部門スコアリング
    
    Returns:
        既存の /resume-score-save と同じ形式
    """
    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")
        
        # 🚀 ここで既存の詳細スコアリングを実行
        # ただし、テキストが保存されていないので再抽出が必要
        # → フロントから再度ファイルをアップロードしてもらうか、
        #    ベクトルDBから取得するなどの工夫が必要
        
        return JSONResponse(content={
            "message": "詳細スコアリングは /resume-score-save を使用してください",
            "candidate_id": candidate_id
        })


@router.post("/resume-batch-score-streaming/{candidate_id}")
async def resume_batch_score_streaming(candidate_id: str):
    """
    一括アップロード後の詳細スコアリング（ストリーミング版）
    
    ⚠️ この実装には履歴書テキストの再取得が必要
    現状ではベクトルDBやファイルストレージから取得する必要あり
    """
    # TODO: 実装
    raise HTTPException(status_code=501, detail="未実装")


@router.get("/resume-batch-status")
async def get_batch_status():
    """
    一括アップロードされた候補の一覧取得
    
    Returns:
        一括アップロード状態の候補リスト
    """
    with SessionLocal() as db:
        from backend.models.score_resume import CandidateStatus
        
        # 最新ステータスが「アップロード」の候補を取得
        candidates = db.query(Candidate).join(
            CandidateStatus,
            Candidate.user_id == CandidateStatus.user_id
        ).filter(
            CandidateStatus.stage == "アップロード"
        ).all()
        
        results = []
        for c in candidates:
            results.append({
                "candidate_id": c.user_id,
                "name": c.name,
                "gender": c.gender,
                "has_notes": bool(c.notes),
                "has_work_summary": bool(c.work_summary),
                "uploaded_at": c.updated_at.isoformat() if c.updated_at else None,
                "uploader_id": c.uploader_id
            })
        
        return JSONResponse(content=results)