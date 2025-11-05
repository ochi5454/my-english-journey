import asyncio
import io
from typing import List, Dict, Optional, Any
from datetime import datetime
from uuid import uuid4
from pathlib import Path

from backend.services.score_resume.extract import (
    extract_resume_text_from_pdf,
    extract_resume_text_from_docx, 
    extract_resume_text_from_xlsx,
    normalize_pdf_text,
    extract_all_resume_info_async  # 🚀 並列抽出を使用
)
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateStatus
from backend.core.config import MIME_TO_EXT

class BatchResumeProcessor:
    """複数履歴書の一括処理（軽量版）"""
    
    def __init__(self, max_concurrent: int = 5):
        """
        Args:
            max_concurrent: 同時処理数の上限（OpenAI APIレート制限対策）
        """
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.results: List[Dict] = []
        
    async def _extract_text_from_file(
        self,
        filename: str,
        content: bytes
    ) -> Optional[str]:
        """
        ファイルからテキスト抽出
        
        Returns:
            抽出テキスト（失敗時はNone）
        """
        try:
            file_stream = io.BytesIO(content)
            ext = Path(filename).suffix.lower()
            
            # 拡張子がない場合はMIMEタイプから推測（実装必要なら）
            if not ext:
                return None
            
            if ext == ".pdf":
                text = extract_resume_text_from_pdf(file_stream)
            elif ext in (".doc", ".docx"):
                text = extract_resume_text_from_docx(file_stream)
            elif ext in (".xls", ".xlsx"):
                text = extract_resume_text_from_xlsx(file_stream)
            else:
                return None
            
            return normalize_pdf_text(text) if text else None
            
        except Exception as e:
            print(f"❌ テキスト抽出エラー ({filename}): {e}")
            return None
    
    async def process_single_resume(
        self,
        filename: str,
        content: bytes,
        uploader_id: str
    ) -> Dict:
        """
        1ファイルの軽量処理
        
        Args:
            filename: ファイル名
            content: ファイルバイナリ
            uploader_id: アップロード者ID
            
        Returns:
            処理結果（成功/エラー情報）
        """
        async with self.semaphore:
            start_time = datetime.utcnow()
            
            try:
                print(f"📥 処理開始: {filename}")
                
                # ① テキスト抽出
                text = await self._extract_text_from_file(filename, content)
                
                if not text or not text.strip():
                    return {
                        "filename": filename,
                        "status": "error",
                        "error": "テキスト抽出失敗",
                        "processing_time": (datetime.utcnow() - start_time).total_seconds()
                    }
                
                # ② 基本情報抽出（LLM並列実行）
                # 🚀 extract_all_resume_info_async で name, gender, motivation, work_experience を一括取得
                info = await extract_all_resume_info_async(text)
                
                # ③ 候補者IDを生成
                candidate_id = str(uuid4())
                
                # ④ DBに軽量保存
                now = datetime.utcnow()
                with SessionLocal() as db:
                    candidate = Candidate(
                        id=candidate_id,
                        user_id=candidate_id,
                        name=info.get("name"),
                        gender=info.get("gender", "不明"),
                        # 🚀 志望動機・職務経歴は一時保存（長すぎる場合は切り詰め）
                        notes=info.get("motivation", "")[:500] if info.get("motivation") else None,
                        work_summary=info.get("work_experience", "")[:500] if info.get("work_experience") else None,
                        uploader_id=uploader_id,
                        updated_by="batch_upload",
                        updated_at=now
                    )
                    db.add(candidate)
                    
                    # ステータス登録
                    status = CandidateStatus(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        stage="一括アップロード",
                        chat_reviewer=uploader_id,
                        reviewed_at=now,
                        reviewed_resume=False
                    )
                    db.add(status)
                    db.commit()
                
                processing_time = (datetime.utcnow() - start_time).total_seconds()
                print(f"✅ 処理完了: {filename} - {info.get('name', '不明')} ({processing_time:.2f}秒)")
                
                return {
                    "filename": filename,
                    "status": "success",
                    "candidate_id": candidate_id,
                    "name": info.get("name"),
                    "gender": info.get("gender", "不明"),
                    "has_motivation": bool(info.get("motivation")),
                    "has_work_experience": bool(info.get("work_experience")),
                    "processing_time": processing_time
                }
                
            except Exception as e:
                processing_time = (datetime.utcnow() - start_time).total_seconds()
                print(f"❌ エラー: {filename} - {str(e)}")
                return {
                    "filename": filename,
                    "status": "error",
                    "error": str(e),
                    "processing_time": processing_time
                }
    
    async def process_batch(
        self,
        files: List[Dict[str, Any]],
        uploader_id: str
    ) -> Dict:
        """
        複数ファイルを並列処理
        
        Args:
            files: [{"filename": str, "content": bytes}, ...]
            uploader_id: アップロード者ID
            
        Returns:
            {
                "total": int,
                "success": int,
                "error": int,
                "processing_time": float,
                "results": [...]
            }
        """
        start_time = datetime.utcnow()
        
        # 並列実行するタスクを準備
        tasks = [
            self.process_single_resume(
                f["filename"],
                f["content"],
                uploader_id
            )
            for f in files
        ]
        
        # すべて並列実行
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # エラーハンドリング
        processed_results = []
        for r in results:
            if isinstance(r, Exception):
                processed_results.append({
                    "status": "error",
                    "error": str(r)
                })
            else:
                processed_results.append(r)
        
        # サマリ作成
        success_count = sum(1 for r in processed_results if r.get("status") == "success")
        error_count = len(processed_results) - success_count
        total_time = (datetime.utcnow() - start_time).total_seconds()
        
        # 成功した候補のみを抽出
        successful_candidates = [
            r for r in processed_results 
            if r.get("status") == "success"
        ]
        
        return {
            "total": len(processed_results),
            "success": success_count,
            "error": error_count,
            "processing_time": total_time,
            "avg_time_per_file": total_time / len(files) if files else 0,
            "results": processed_results,
            "successful_candidates": successful_candidates  # フロント表示用
        }