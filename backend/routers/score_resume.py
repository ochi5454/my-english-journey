import os
import io
import re
import traceback
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any
from fastapi import HTTPException, APIRouter, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
import asyncio
from fastapi.exceptions import HTTPException
from pathlib import Path
from backend.core.database import SessionLocal
from backend.core.config import RESUME_PATH, MIME_TO_EXT
from backend.models.resume import ResumeWorkHistory
from backend.models.score_resume import Candidate, CandidateDivisionScore, CandidateScoreHistory, CandidateMustCheckItem, CandidateDivisionMustCheckItem, CandidateStatus
from backend.models.interview_schedule import InterviewSchedule
from backend.models.results_byinterview import ResultByInterview
from backend.services.score_resume.extract import extract_resume_text_from_pdf, extract_resume_text_from_docx, extract_resume_text_from_xlsx, normalize_pdf_text, extract_motivation, summarize_motivation, extract_work_experience, summarize_work_experience, calculate_total_experience, extract_birth_date
from backend.services.score_resume.score import score_resume_from_text_async, score_motivation_statement_async, score_work_experience_async
from backend.services.score_resume.sanitizer import mask_personal_info, mask_and_extract_personal_info
from backend.services.score_resume.vectorstore import save_masked_resume_embedding_local
from backend.services.score_resume.sql import generate_resume_sql, save_sql_to_sqlite
from backend.services.score_resume.streaming import _sse, log_step
from backend.utils.division import convert_division_to_prefix
from backend.utils.status import update_candidate_status

router = APIRouter()
JST = timezone(timedelta(hours=9))

# ✅ ヘルパー関数: datetime を JST の ISO 文字列に変換
def to_jst_iso(dt: Any) -> str | None:
    """datetime を JST の ISO 文字列に変換"""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JST)
    else:
        dt = dt.astimezone(JST)
    return dt.isoformat()

#  ============================================
#  📮 履歴書保存・スコアリング
#  ============================================

@router.post("/resume-score-save")
async def resume_score_save(
    files: List[UploadFile] = File(...), 
    candidate_id: str = Form(...),
    uploader_id: str = Form(...),
    desired_division: Optional[str] = Form(None)
):

    # === 🔹 まずはすべてのファイルを一度メモリに読む ===
    safe_files = []
    for file in files:
        raw_filename = (file.filename or "").strip()
        content = await file.read()
        await file.close()
        safe_files.append({
            "filename": raw_filename,
            "content": content,
            "content_type": file.content_type
        })

    async def run_and_stream():
        try:
            yield log_step("start", "🚀 処理を開始しました")
            await asyncio.sleep(0)
            merged_texts = []

            # === 各ファイルを順に処理 ===
            last_filename = None # 安全策

            for f in safe_files:
            
                # === ① 拡張子チェックと読み込み ===
                raw_filename = (f["filename"] or "").strip()
                ext = Path(raw_filename).suffix.lower()
                yield log_step("reading_start", f"📄 ファイル {raw_filename} の読み込みを開始します")
                await asyncio.sleep(0)
                file_stream = io.BytesIO(f["content"])

                if not ext and f["content_type"] in MIME_TO_EXT:
                    ext = MIME_TO_EXT[f["content_type"]]
                if not ext:
                    yield _sse({"status": "error", "log": f"⚠️ 拡張子が不明なファイルです: {raw_filename}"})
                    await asyncio.sleep(0)
                    return
                yield log_step("reading_done", f"📄 ファイル {raw_filename} の読み込み完了")
                await asyncio.sleep(0)
                # === ② ファイル形式に応じたテキスト抽出 ===
                yield log_step("extract_start", f"🧾 テキスト抽出を開始 ({ext} 形式)")
                await asyncio.sleep(0)
                if ext == ".pdf":
                    extracted_text = extract_resume_text_from_pdf(file_stream)
                elif ext in (".doc", ".docx"):
                    extracted_text = extract_resume_text_from_docx(file_stream)
                elif ext in (".xls", ".xlsx"):
                    extracted_text = extract_resume_text_from_xlsx(file_stream)
                else:
                    yield _sse({"status": "error", "log": f"⚠️ 未対応形式: {ext}"})
                    await asyncio.sleep(0)
                    return
                if not extracted_text.strip():
                    yield _sse({"status": "error", "log": "⚠️ テキスト抽出に失敗しました"})
                    await asyncio.sleep(0)
                    return
                # 正規化
                extracted_text = normalize_pdf_text(extracted_text)
                merged_texts.append(f"## {raw_filename}\n{extracted_text}")
                yield log_step("extract_done", f"🧾 テキスト抽出完了 ({len(extracted_text)} 文字)")
                await asyncio.sleep(0)

                last_filename = raw_filename # 最後に処理したファイル名を保存し氏名抽出のフォールバックに利用
            # === ③ 全ファイルを1つのテキストに結合 ===
            yield log_step("normalize_start", f"📎 {len(merged_texts)} ファイルの結合を開始")
            await asyncio.sleep(0)
            merged_text = "\n\n".join(merged_texts)
            print("=== 抽出テキスト ===")
            print(merged_text[:1500])
            yield log_step("normalize_done", "📎 テキスト結合完了")
            await asyncio.sleep(0)
            
            # === ④ マスキング処理 ＆ 氏名性別抽出 ===
            yield log_step("mask_start", "🙈 個人情報マスキングを開始")
            await asyncio.sleep(0)
            masked_text, info = mask_and_extract_personal_info(merged_text, filename=last_filename)

            extracted_name = info.get("name")
            extracted_gender = info.get("gender")
            extracted_birth_date = extract_birth_date(merged_text)

            print(f"🔍 extracted_name: '{extracted_name}'")
            print(f"🔍 extracted_gender: '{extracted_gender}'")
            print(f"🔍 extracted_birth_date: '{extracted_birth_date}'")  # ✅ 追加

            yield log_step("mask_done", f"🙈 マスキング完了 — 氏名候補: {extracted_name or '不明'}")
            await asyncio.sleep(0)

            # === ⑤ ベクトルDB保存 ===
            yield log_step("embed_start", "🧠 ベクトルDBへの保存を開始")
            await asyncio.sleep(0)
            save_masked_resume_embedding_local(candidate_id, masked_text)
            yield log_step("embed_done", "✅ ベクトルDB保存完了")
            await asyncio.sleep(0)

            # === ⑥ SQL構造保存（オプション） ===
            yield log_step("sql_start", "🧾 SQL構造生成を開始")
            await asyncio.sleep(0)
            generated_sql = generate_resume_sql(masked_text, candidate_id)
            save_sql_to_sqlite(generated_sql)
            yield log_step("sql_done", "✅ SQL構造保存完了")
            await asyncio.sleep(0)

            # === ⑦ Candidateと CandidateStatusを保存 ===
            yield log_step("db_init_start", "👤 候補者情報の登録を開始")
            await asyncio.sleep(0)
            
            now = datetime.now(JST)

            with SessionLocal() as db:

                work_histories = db.query(ResumeWorkHistory).filter_by(resume_id=candidate_id).all()
                experience_years = calculate_total_experience(work_histories)
                candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()

                # 🔁 和名 → prefix に変換
                prefix = convert_division_to_prefix(desired_division) if desired_division else None

                if not candidate:
                    candidate = Candidate(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        name=extracted_name,
                        gender=extracted_gender,
                        birth_date=extracted_birth_date,
                        experience=experience_years,
                        uploader_id=uploader_id,
                        preferred_div=prefix,
                        status="アップロード",
                        updated_by="system",
                        updated_at=now
                    )
                    db.add(candidate)
                else:
                    candidate.name = extracted_name
                    candidate.gender = extracted_gender
                    candidate.birth_date = extracted_birth_date
                    candidate.updated_by = "system"
                    candidate.updated_at = now
                    candidate.experience = experience_years
                    candidate.preferred_div = prefix

                    # 既存候補のステータスが空なら「アップロード」を設定
                    if not candidate.status:
                        candidate.status = "アップロード"

                db.commit()

                # === CandidateStatus 履歴追加（こちらもアップロード）===
                new_status = CandidateStatus(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    stage="アップロード",
                    chat_reviewer=uploader_id,
                    reviewed_at=now,
                )
                db.add(new_status)
                db.commit()

            yield log_step("db_init_done", f"✅ 候補者登録完了 — 経験年数: {experience_years}年")
            await asyncio.sleep(0)

            # === ⑧ LLMスコアリング実行 ===
            yield log_step("llm_start", "🤖 LLMスコアリングを開始")
            await asyncio.sleep(0)
            filtered_text = re.sub(
                r"志望動機[:：]?\s*.*?(?=(?:\n\S{2,3}|##|職務経歴|$))",
                "",
                masked_text,
                flags=re.DOTALL
            )
            print("🧠 LLMスコアリングに渡す前に１次精査。なるべく職務経歴重視: %s", filtered_text)
            scoring_result = await score_resume_from_text_async(filtered_text, candidate_id)
            yield log_step("llm_done", "✅ LLMスコアリング完了")
            await asyncio.sleep(0)

            # 🔽 和名 → prefix 変換をここで実施
            raw_recommended = scoring_result.get("recommended_division")
            recommended_div_prefix = (
                convert_division_to_prefix(raw_recommended) if raw_recommended else None
            )
            scoring_result["recommended_division"] = recommended_div_prefix

            # === ⑨ スコア・must_checkをDBに保存 ===
            yield log_step("db_scores_start", "💾 スコア・サマリの保存を開始")
            await asyncio.sleep(0)
            now = datetime.now(JST)

            with SessionLocal() as db:
                # === 志望動機・職務経歴の抽出 ===
                print("🎯 志望動機と職務経歴の抽出を開始します")

                motivation_text = extract_motivation(masked_text)
                work_experience_text = extract_work_experience(masked_text)

                # === 要約とスコアリング ===
                summarized_motivation = summarize_motivation(motivation_text) if motivation_text else None
                score_motivation = await score_motivation_statement_async(motivation_text) if motivation_text else None

                summarized_work = summarize_work_experience(work_experience_text) if work_experience_text else None
                score_work = await score_work_experience_async(work_experience_text) if work_experience_text else None

                print(f"志望動機サマリ: {summarized_motivation}")
                print(f"志望動機スコア: {score_motivation}")
                print(f"職務経歴サマリ: {summarized_work}")
                print(f"職務経歴スコア: {score_work}")

                # 🎯 candidates テーブル更新 or INSERT
                candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
                if not candidate:
                    candidate = Candidate(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        notes=summarized_motivation,        # 志望動機サマリ
                        score_notes=score_motivation,       # 志望動機スコア
                        work_summary=summarized_work,       # 職務経歴サマリ（新規）
                        score_work=score_work,              # 職務経歴スコア（新規）
                        recommended_div=recommended_div_prefix,
                        recommended_division=recommended_div_prefix,  # 推奨部門も設定
                        status="書類選考",  # 初回アップロード時のステータス
                        uploader_id=uploader_id,
                        updated_by="system",
                        updated_at=now
                    )
                    db.add(candidate)
                else:
                    candidate.notes = summarized_motivation
                    candidate.score_notes = score_motivation
                    candidate.work_summary = summarized_work
                    candidate.score_work = score_work
                    candidate.recommended_div = recommended_div_prefix
                    candidate.recommended_division = recommended_div_prefix  # 推奨部門も設定
                    if not candidate.status:  # ステータスが未設定の場合のみ設定
                        candidate.status = "書類選考"
                    candidate.updated_by = "system"
                    candidate.updated_at = now

                # 🎯 must_check項目 保存
                db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).delete()
                for name, info in scoring_result.get("must_check", {}).items():
                    db.add(CandidateMustCheckItem(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        item_name=name,
                        result=info.get("result", False),
                        reason=info.get("reason", "")
                    ))

                # 🎯 divisionごとのmust_check保存
                for division, checks in scoring_result.get("must_check_by_division", {}).items():
                    division_prefix = convert_division_to_prefix(division)
                    for name, info in checks.items():
                        db.add(CandidateDivisionMustCheckItem(
                            id=str(uuid4()),
                            user_id=candidate_id,
                            division=division_prefix,
                            item_name=name,
                            result=info.get("result", False),
                            reason=info.get("reason", "")
                        ))

                # 🎯 divisionスコア 保存
                db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).delete()
                for s in scoring_result.get("scores", []):
                    division_prefix = convert_division_to_prefix(s["division"])
                    db.add(CandidateDivisionScore(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        division=division_prefix,
                        score=s["score"],
                        reason=s["reason"]
                    ))

                # 🎯 スコア履歴 保存（重複チェックあり）
                for s in scoring_result.get("scores", []):
                    # --- 重複チェック ---
                    division_prefix = convert_division_to_prefix(s["division"])
                    existing = db.query(CandidateScoreHistory).filter(
                        CandidateScoreHistory.user_id == candidate_id,
                        CandidateScoreHistory.division == division_prefix,
                        CandidateScoreHistory.score == s["score"],
                        CandidateScoreHistory.reason == s["reason"],
                        CandidateScoreHistory.source.in_(["resume_upload", "resume_score_save"])
                    ).first()

                    if existing:
                        # 既に 行がある -> 挿入スキップ
                        print(f"skip duplicate score history for {candidate_id} {s['division']} cus it is added already")
                        continue

                    # 重複がなければ挿入
                    db.add(CandidateScoreHistory(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        division=division_prefix,
                        score=s["score"],
                        reason=s["reason"],
                        reviewer="system",
                        reviewed_at=now,
                        source="resume_score_save"
                    ))

                db.commit()

                preferred_div_score = None
                recommended_div_score = None
                preferred_div_reason = None
                recommended_div_reason = None

                # 🙋希望部門スコアを抽出
                if desired_division:
                    preferred_score_row = db.query(CandidateDivisionScore).filter_by(
                        user_id=candidate_id, division=desired_division
                    ).first()
                    if preferred_score_row:
                        preferred_div_score = preferred_score_row.score
                        preferred_div_reason = preferred_score_row.reason

                # 🙋‍♀️推薦部門スコアを抽出
                recommended_div = scoring_result.get("recommended_division")
                if recommended_div:
                    recommended_score_row = db.query(CandidateDivisionScore).filter_by(
                        user_id=candidate_id, division=recommended_div
                    ).first()
                    if recommended_score_row:
                        recommended_div_score = recommended_score_row.score
                        recommended_div_reason = recommended_score_row.reason

            yield log_step("db_scores_done", f"✅ 保存完了 — {len(scoring_result.get('scores', []))} 件")
            await asyncio.sleep(0)

            # === ⑩ 応答 ===
            yield log_step("finalize_start", "📦 最終応答を生成中...")
            await asyncio.sleep(0)
            final_payload = {
                "candidate_id": candidate_id,
                "uploader_id": uploader_id,
                "desired_division": prefix,
                "timestamp": now.isoformat(),
                "generated_sql": generated_sql,

                # 希望部門・推薦部門情報を追加
                "preferred_div": prefix,
                "preferred_div_score": preferred_div_score,
                "preferred_div_reason": preferred_div_reason,
                "recommended_div": recommended_div_prefix,
                "recommended_div_score": recommended_div_score,
                "recommended_div_reason": recommended_div_reason,

                # 推薦部門・must_check・スコア
                "must_check": scoring_result.get("must_check"),
                "must_check_by_division": scoring_result.get("must_check_by_division"),
                "scores": scoring_result.get("scores"),

                # 既存のネストも残す（将来用）
                "llm_scoring": scoring_result,

                # 志望動機・職務経歴のサマリとスコア
                "summarized_motivation": summarized_motivation,
                "score_motivation": score_motivation,
                "summarized_work": summarized_work,
                "score_work": score_work,

                "message": "✅ 全データ保存完了"
            }

            yield _sse({
                "status": "final_payload",
                "log": "📤 最終結果データを送信しました",
                "data": final_payload
            })
            yield log_step("finalize_done", "✅ 最終応答生成完了")
            yield log_step("done", "🎉 すべての処理が完了しました")
            await asyncio.sleep(0)

        except Exception as e:
            error_msg = f"❌ エラー発生: {str(e)}"
            print(error_msg)
            traceback.print_exc()
            yield _sse({"status": "error", "log": error_msg})
            await asyncio.sleep(0)
            return
    
    # SSE（POSTレスポンスをストリーム）
    return StreamingResponse(
        run_and_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Nginx対策
        }
    )

@router.post("/candidate-ai-evaluation")
async def candidate_ai_evaluation(request: Request):
    """
    既存候補者のAI評価を実行（希望部門を指定して再スコアリング）
    """
    data = await request.json()
    candidate_id = data.get("candidate_id")
    preferred_division = data.get("preferred_division")
    reviewer_id = data.get("reviewer_id")

    if not candidate_id:
        raise HTTPException(status_code=400, detail="candidate_idが必要です")

    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        # 希望部門を更新
        if preferred_division:
            prefix = convert_division_to_prefix(preferred_division)
            candidate.preferred_div = prefix
            candidate.updated_by = reviewer_id or "system"
            candidate.updated_at = datetime.now(JST)
            db.commit()

        masked_text = None

        # ① まずvectorstoreから取得を試みる
        print(f"🔍 候補者 {candidate_id} のテキストを取得中...")
        try:
            from backend.services.score_resume.vectorstore import get_masked_resume_text_local
            masked_text = get_masked_resume_text_local(candidate_id)
            print(f"✅ vectorstoreからテキスト取得成功: {len(masked_text)} 文字")
        except Exception as e:
            print(f"⚠️ vectorstore取得失敗: {str(e)}")

        # ② vectorstoreで失敗した場合、ファイルから取得
        if not masked_text:
            print(f"🔍 RESUME_PATH: {RESUME_PATH}")

            if not os.path.exists(RESUME_PATH):
                print(f"❌ ディレクトリが存在しません: {RESUME_PATH}")
                return JSONResponse(content={
                    "needs_reupload": True,
                    "message": "履歴書が見つかりません。ファイルを再アップロードしてください。"
                })

            matching_files = [
                f for f in os.listdir(RESUME_PATH)
                if f.startswith(f"cand_{candidate_id}_") or candidate_id in f
            ]

            print(f"📂 検索結果: {matching_files}")

            if not matching_files:
                all_files = os.listdir(RESUME_PATH)
                print(f"📋 全ファイル数: {len(all_files)}")
                print(f"📋 最初の5件: {all_files[:5]}")

                return JSONResponse(content={
                    "needs_reupload": True,
                    "message": "履歴書が見つかりません。ファイルを再アップロードしてください。"
                })

            target_file = RESUME_PATH / matching_files[0]
            ext = Path(target_file).suffix.lower()
            raw_filename = target_file.name # ✅ 元のファイル名を保存

            print(f"📄 ファイル発見: {target_file.name}")

            with open(target_file, 'rb') as f:
                file_stream = io.BytesIO(f.read())

            if ext == ".pdf":
                extracted_text = extract_resume_text_from_pdf(file_stream)
            elif ext in (".doc", ".docx"):
                extracted_text = extract_resume_text_from_docx(file_stream)
            elif ext in (".xls", ".xlsx"):
                extracted_text = extract_resume_text_from_xlsx(file_stream)
            else:
                raise HTTPException(status_code=400, detail=f"未対応形式: {ext}")

            extracted_text = normalize_pdf_text(extracted_text)
            masked_text, _ = mask_personal_info(extracted_text, filename=raw_filename) # ✅ filenameを渡す

            print(f"✅ ファイルからテキスト抽出完了: {len(masked_text)} 文字")

        # ③ 職務経歴重視のフィルタリング
        filtered_text = re.sub(
            r"志望動機[:：]?\s*.*?(?=(?:\n\S{2,3}|##|職務経歴|$))",
            "",
            masked_text,
            flags=re.DOTALL
        )

        # ④ LLMスコアリング実行
        scoring_result = await score_resume_from_text_async(filtered_text, candidate_id)

        # ⑤ 推薦部門をprefix化
        raw_recommended = scoring_result.get("recommended_division")
        recommended_div_prefix = (
            convert_division_to_prefix(raw_recommended) if raw_recommended else None
        )
        scoring_result["recommended_division"] = recommended_div_prefix

        # ⑥ DBを更新
        now = datetime.now(JST)

        motivation_text = extract_motivation(masked_text)
        work_experience_text = extract_work_experience(masked_text)

        summarized_motivation = summarize_motivation(motivation_text) if motivation_text else None
        score_motivation = await score_motivation_statement_async(motivation_text) if motivation_text else None
        summarized_work = summarize_work_experience(work_experience_text) if work_experience_text else None
        score_work = await score_work_experience_async(work_experience_text) if work_experience_text else None

        candidate.notes = summarized_motivation
        candidate.score_notes = score_motivation
        candidate.work_summary = summarized_work
        candidate.score_work = score_work
        candidate.recommended_div = recommended_div_prefix
        candidate.updated_by = reviewer_id or "system"
        candidate.updated_at = now

        db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).delete()
        for name, info in scoring_result.get("must_check", {}).items():
            db.add(CandidateMustCheckItem(
                id=str(uuid4()),
                user_id=candidate_id,
                item_name=name,
                result=info.get("result", False),
                reason=info.get("reason", "")
            ))

        db.query(CandidateDivisionMustCheckItem).filter_by(user_id=candidate_id).delete()
        for division, checks in scoring_result.get("must_check_by_division", {}).items():
            division_prefix = convert_division_to_prefix(division)
            for name, info in checks.items():
                db.add(CandidateDivisionMustCheckItem(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    division=division_prefix,
                    item_name=name,
                    result=info.get("result", False),
                    reason=info.get("reason", "")
                ))

        db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).delete()
        for s in scoring_result.get("scores", []):
            division_prefix = convert_division_to_prefix(s["division"])
            db.add(CandidateDivisionScore(
                id=str(uuid4()),
                user_id=candidate_id,
                division=division_prefix,
                score=s["score"],
                reason=s["reason"]
            ))

        for s in scoring_result.get("scores", []):
            division_prefix = convert_division_to_prefix(s["division"])
            db.add(CandidateScoreHistory(
                id=str(uuid4()),
                user_id=candidate_id,
                division=division_prefix,
                score=s["score"],
                reason=s["reason"],
                reviewer=reviewer_id or "system",
                reviewed_at=now,
                source="ai_evaluation"
            ))

        # ★★★ ステータスは進めない ★★★
        # candidate-ai-evaluation は AI評価だけの用途なので
        # CandidateStatus は追加しない

        db.commit()

        return JSONResponse(content={
            "success": True,
            "message": "AI評価が完了しました",
            "recommended_division": recommended_div_prefix,
            "scores": scoring_result.get("scores", [])
        })

@router.post("/resume-score-rescore/{candidate_id}")
async def resume_score_rescore(candidate_id: str):
    """
    既存候補者の履歴書を再評価する
    """
    try:
        with SessionLocal() as db:
            candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
            if not candidate:
                raise HTTPException(status_code=404, detail="候補者が見つかりません")

            masked_text = None

            # ① まずvectorstoreから取得を試みる
            print(f"🔍 候補者 {candidate_id} のテキストを取得中...")
            try:
                from backend.services.score_resume.vectorstore import get_masked_resume_text_local
                masked_text = get_masked_resume_text_local(candidate_id)
                print(f"✅ vectorstoreからテキスト取得成功: {len(masked_text)} 文字")
            except Exception as e:
                print(f"⚠️ vectorstore取得失敗: {str(e)}")

            # ② vectorstoreで失敗した場合、ファイルから取得
            if not masked_text:
                print(f"🔍 RESUME_PATH: {RESUME_PATH}")
                
                if not os.path.exists(RESUME_PATH):
                    print(f"❌ ディレクトリが存在しません: {RESUME_PATH}")
                    raise HTTPException(
                        status_code=404, 
                        detail="履歴書テキストが見つかりません。再アップロードが必要です。"
                    )
                
                matching_files = [
                    f for f in os.listdir(RESUME_PATH)
                    if f.startswith(f"cand_{candidate_id}_") or candidate_id in f
                ]
                
                print(f"📂 検索結果: {matching_files}")
                
                if not matching_files:
                    all_files = os.listdir(RESUME_PATH)
                    print(f"📋 全ファイル数: {len(all_files)}")
                    print(f"📋 最初の5件: {all_files[:5]}")
                    
                    raise HTTPException(
                        status_code=404, 
                        detail="履歴書テキストが見つかりません。再アップロードが必要です。"
                    )
                
                target_file = RESUME_PATH / matching_files[0]
                ext = Path(target_file).suffix.lower()
                raw_filename = target_file.name # ファイル名取得
                
                print(f"📄 ファイル発見: {target_file.name}")
                
                with open(target_file, 'rb') as f:
                    file_stream = io.BytesIO(f.read())
                
                if ext == ".pdf":
                    extracted_text = extract_resume_text_from_pdf(file_stream)
                elif ext in (".doc", ".docx"):
                    extracted_text = extract_resume_text_from_docx(file_stream)
                elif ext in (".xls", ".xlsx"):
                    extracted_text = extract_resume_text_from_xlsx(file_stream)
                else:
                    raise HTTPException(status_code=400, detail=f"未対応形式: {ext}")
                
                extracted_text = normalize_pdf_text(extracted_text)
                masked_text, _ = mask_personal_info(extracted_text, filename=raw_filename)  # ✅  filenameを渡す
                
                print(f"✅ ファイルからテキスト抽出完了: {len(masked_text)} 文字")

            # ③ 職務経歴重視のフィルタリング
            filtered_text = re.sub(
                r"志望動機[:：]?\s*.*?(?=(?:\n\S{2,3}|##|職務経歴|$))",
                "",
                masked_text,
                flags=re.DOTALL
            )

            # ④ LLMスコアリング実行
            scoring_result = await score_resume_from_text_async(filtered_text, candidate_id)

            # ⑤ 推薦部門をprefix化
            raw_recommended = scoring_result.get("recommended_division")
            recommended_div_prefix = (
                convert_division_to_prefix(raw_recommended) if raw_recommended else None
            )
            scoring_result["recommended_division"] = recommended_div_prefix

            # ⑥ DBを更新
            now = datetime.now(JST)

            motivation_text = extract_motivation(masked_text)
            work_experience_text = extract_work_experience(masked_text)

            summarized_motivation = summarize_motivation(motivation_text) if motivation_text else None
            score_motivation = await score_motivation_statement_async(motivation_text) if motivation_text else None
            summarized_work = summarize_work_experience(work_experience_text) if work_experience_text else None
            score_work = await score_work_experience_async(work_experience_text) if work_experience_text else None

            candidate.notes = summarized_motivation
            candidate.score_notes = score_motivation
            candidate.work_summary = summarized_work
            candidate.score_work = score_work
            candidate.recommended_div = recommended_div_prefix
            candidate.recommended_division = recommended_div_prefix  # 新フィールドにも設定
            # ★ ステータスは変更しない
            candidate.updated_by = "system"
            candidate.updated_at = now

            db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).delete()
            for name, info in scoring_result.get("must_check", {}).items():
                db.add(CandidateMustCheckItem(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    item_name=name,
                    result=info.get("result", False),
                    reason=info.get("reason", "")
                ))

            db.query(CandidateDivisionMustCheckItem).filter_by(user_id=candidate_id).delete()
            for division, checks in scoring_result.get("must_check_by_division", {}).items():
                division_prefix = convert_division_to_prefix(division)
                for name, info in checks.items():
                    db.add(CandidateDivisionMustCheckItem(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        division=division_prefix,
                        item_name=name,
                        result=info.get("result", False),
                        reason=info.get("reason", "")
                    ))

            db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).delete()
            for s in scoring_result.get("scores", []):
                division_prefix = convert_division_to_prefix(s["division"])
                db.add(CandidateDivisionScore(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    division=division_prefix,
                    score=s["score"],
                    reason=s["reason"]
                ))

            for s in scoring_result.get("scores", []):
                division_prefix = convert_division_to_prefix(s["division"])
                db.add(CandidateScoreHistory(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    division=division_prefix,
                    score=s["score"],
                    reason=s["reason"],
                    reviewer="system",
                    reviewed_at=now,
                    source="rescore"
                ))

            db.commit()

            return JSONResponse(content={
                "success": True,
                "message": "再評価が完了しました",
                "recommended_division": recommended_div_prefix,
                "scores": scoring_result.get("scores", [])
            })
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ エラー発生: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"再評価エラー: {str(e)}")

@router.post("/candidate-gender-update")
async def candidate_gender_update(request: Request):
    data = await request.json()
    candidate_id = data.get("candidate_id")
    gender = data.get("gender")
    
    if not candidate_id or not gender:
        raise HTTPException(status_code=400, detail="候補者IDと性別が必要です")
    
    # ✅ "不明" を追加
    if gender not in ["男性", "女性", "その他", "不明"]:
        raise HTTPException(status_code=400, detail="無効な性別です")
    
    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")
        
        candidate.gender = gender
        candidate.updated_at = now = datetime.now(JST)
        db.commit()
    
    return JSONResponse(content={"success": True, "gender": gender})

@router.post("/candidate-preferred-div-update")
async def candidate_preferred_div_update(request: Request):
    data = await request.json()
    candidate_id = data.get("candidate_id")
    preferred_division = data.get("preferred_division")

    if not candidate_id or not preferred_division:
        raise HTTPException(status_code=400, detail="候補者IDと希望部門が必要です")

    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        candidate.preferred_div = preferred_division
        candidate.updated_at = now = datetime.now(JST)
        db.commit()

    return JSONResponse(content={"success": True, "preferred_division": preferred_division})

@router.post("/candidate-recommended-div-update")
async def candidate_recommended_div_update(request: Request):
    data = await request.json()
    candidate_id = data.get("candidate_id")
    recommended_division = data.get("recommended_division")

    if not candidate_id or not recommended_division:
        raise HTTPException(status_code=400, detail="候補者IDと推奨部門が必要です")

    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        candidate.recommended_division = recommended_division
        candidate.updated_at = now = datetime.now(JST)
        db.commit()

    return JSONResponse(content={"success": True, "recommended_division": recommended_division})

@router.get("/resume-results")
async def get_resume_results():
    with SessionLocal() as db:
        candidates = db.query(Candidate).all()
        results = []

        for c in candidates:
            user_id = c.user_id

            # 最優先は Candidate.status
            status_value = c.status

            # 万が一、古いデータで status が NULL のときだけ CandidateStatus で補完
            if not status_value:
                latest_status = (
                    db.query(CandidateStatus)
                    .filter_by(user_id=user_id)
                    .order_by(CandidateStatus.reviewed_at.desc())
                    .first()
                )
                status_value = latest_status.stage if latest_status else "アップロード"

            must_checks = db.query(CandidateMustCheckItem).filter_by(user_id=user_id).all()
            division_must_checks = db.query(CandidateDivisionMustCheckItem).filter_by(user_id=user_id).all()
            scores = db.query(CandidateDivisionScore).filter_by(user_id=user_id).all()
            
            division_score_map = {s.division: s.score for s in scores}

            division_must_check_dict = {}
            for d in division_must_checks:
                division = d.division
                if division not in division_must_check_dict:
                    division_must_check_dict[division] = {}
                division_must_check_dict[division][d.item_name] = {
                    "result": d.result,
                    "reason": d.reason
                }

            preferred_div = c.preferred_div
            recommended_div = c.recommended_div

            preferred_div_score = None
            recommended_div_score = None
            preferred_div_reason = None
            recommended_div_reason = None

            if preferred_div is not None:
                pref_score = db.query(CandidateDivisionScore).filter_by(user_id=user_id, division=preferred_div).one_or_none()
                if pref_score:
                    preferred_div_score = pref_score.score
                    preferred_div_reason = pref_score.reason

            if recommended_div is not None:
                rec_score = db.query(CandidateDivisionScore).filter_by(user_id=user_id, division=recommended_div).one_or_none()
                if rec_score:
                    recommended_div_score = rec_score.score
                    recommended_div_reason = rec_score.reason

            # ✅ 書類選考結果（Candidate テーブルから取得）
            document_review_result = c.document_review_result
            document_review_date = to_jst_iso(c.document_review_date) if c.document_review_date else None
            document_review_reviewer = c.document_review_reviewer

            result = {
                "user_id": user_id,
                "user_name": c.name,
                "gender": c.gender,
                "birth_date": c.birth_date,
                "status": status_value,
                "hr_decision": c.hr_decision,
                "hr_division": c.hr_division,
                "hr_title": c.hr_title,
                "hr_income": c.hr_income,
                "hr_pay_type": c.hr_pay_type,
                "hr_employment_type": c.hr_employment_type, 
                "hr_saved_at": to_jst_iso(c.hr_saved_at),  # ✅ 修正
                "hr_saved_by": c.hr_saved_by,
                "notes": c.notes,
                "score_notes": c.score_notes,
                "work_summary": c.work_summary,
                "score_work": c.score_work,
                "experience": c.experience,
                "preferred_div": preferred_div,
                "preferred_div_score": preferred_div_score,
                "preferred_div_reason": preferred_div_reason,
                "recommended_div": recommended_div,
                "recommended_div_score": recommended_div_score,
                "recommended_div_reason": recommended_div_reason,
                "uploader_id": c.uploader_id,
                "timestamp": to_jst_iso(c.updated_at),  # ✅ 修正
                "must_check": {
                    m.item_name: {"result": m.result, "reason": m.reason}
                    for m in must_checks
                },
                "division_must_check": division_must_check_dict,
                "scores": [
                    {"division": s.division, "score": s.score, "reason": s.reason}
                    for s in scores
                ],
                "division_scores": division_score_map,
                "document_review_result": document_review_result,
                "document_review_date": document_review_date,
                "document_review_reviewer": document_review_reviewer,
            }
            results.append(result)

        return JSONResponse(content=results)

@router.get("/resume-result/{candidate_id}")
async def get_result_by_candidate_id(candidate_id: str):
    with SessionLocal() as db:

        # -------------------------------
        # 🎉 候補者取得
        # -------------------------------
        c = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not c:
            return JSONResponse({"error": "候補者が見つかりません"}, status_code=404)
        
        # -------------------------------
        # 🎉 必要テーブル取得
        # -------------------------------
        must_checks = db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).all()
        division_must_checks = db.query(CandidateDivisionMustCheckItem).filter_by(user_id=candidate_id).all()
        scores = db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).all()
        histories = (
            db.query(CandidateScoreHistory)
            .filter_by(user_id=candidate_id)
            .order_by(CandidateScoreHistory.reviewed_at.desc())
            .all()
        )
        schedules = db.query(InterviewSchedule).filter_by(candidate_id=candidate_id).all()
        interview_rows = db.query(ResultByInterview).filter_by(candidate_id=candidate_id).all()
        status_rows = (
            db.query(CandidateStatus)
            .filter_by(user_id=candidate_id)
            .order_by(CandidateStatus.reviewed_at.asc())
            .all()
        )
        # -------------------------------
        # 🎉 ステータス補完
        # -------------------------------
        latest_status = (
            db.query(CandidateStatus)
            .filter_by(user_id=candidate_id)
            .order_by(CandidateStatus.reviewed_at.desc())
            .first()
        )
        status_value = c.status or (latest_status.stage if latest_status else "アップロード")

        # -------------------------------
        # 🎉 スコア履歴マッピング
        # -------------------------------
        history_map = {}
        for h in histories:
            history_map.setdefault(h.division, []).append({
                "score": h.score,
                "reason": h.reason,
                "reviewer": h.reviewer,
                "reviewed_at": to_jst_iso(h.reviewed_at),
                "source": h.source
            })

        # -------------------------------
        # 🎉 ステータスマッピング
        # -------------------------------
        status_map = {
            s.stage: {
                "date": to_jst_iso(s.reviewed_at),
                "reviewer": s.chat_reviewer,
            }
            for s in status_rows
        }

        # -------------------------------
        # 🎉 面談日時マッピング
        # -------------------------------
        interview_dates = {}
        for s in schedules:
            interview_dates[f"{s.interview_stage}_date"] = to_jst_iso(s.scheduled_at)

        if schedules:
            interview_dates["last_updated"] = to_jst_iso(max(s.last_updated for s in schedules))

        # -------------------------------
        # 🎉 面談結果マッピング
        # -------------------------------
        interview_results = [
            {
                "stage": r.stage_name,
                "interviewer": r.interviewer_id,
                "decision": r.hiring_decision,
                "updated_at": to_jst_iso(r.updated_at)
            }
            for r in interview_rows
        ]

        # -------------------------------
        # 🎉 最終返却値
        # -------------------------------
        division_must_check_dict = {}
        for d in division_must_checks:
            division = d.division
            if division not in division_must_check_dict:
                division_must_check_dict[division] = {}
            division_must_check_dict[division][d.item_name] = {
                "result": d.result,
                "reason": d.reason,
            }

        result_data = {
            "user_id": candidate_id,
            "user_name": c.name,
            "name": c.name,
            "gender": c.gender,
            "birth_date": c.birth_date,
            "status": status_value,
            "notes": c.notes,
            "work_summary": c.work_summary,
            "score_notes": c.score_notes,
            "score_work": c.score_work,
            "experience": c.experience,
            "recommended_division": c.recommended_division,
            "recommended_div": c.recommended_div,
            "preferred_div": c.preferred_div,
            "uploader_id": c.uploader_id,
            "timestamp": to_jst_iso(latest_status.reviewed_at) if latest_status else None,

            # HR 関連
            "hr_decision": c.hr_decision,
            "hr_saved_at": to_jst_iso(c.hr_saved_at) if c.hr_saved_at else None,
            "hr_saved_by": c.hr_saved_by,
            "hr_pay_type": c.hr_pay_type,
            "hr_employment_type": c.hr_employment_type,
            "hr_division": c.hr_division,
            "hr_title": c.hr_title,
            "hr_income": c.hr_income,

            # 書類選考
            "document_review_date": to_jst_iso(c.document_review_date) if c.document_review_date else None,
            "document_review_reviewer": c.document_review_reviewer,
            "document_review_result": c.document_review_result,

            # 必須チェック
            "must_check": {
                m.item_name: {"result": m.result, "reason": m.reason}
                for m in must_checks
            },
            "division_must_check": division_must_check_dict,

            # スコア
            "scores": [
                {
                    "division": s.division,
                    "score": s.score,
                    "reason": s.reason,
                    "score_history": history_map.get(s.division, []),
                }
                for s in scores
            ],

            # 面談情報
            **interview_dates,
            "interview_results": interview_results,

            # ステータス一覧
            "status_map": status_map,
        }

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

@router.post("/candidate-document-review")
async def candidate_document_review(request: Request):
    data = await request.json()
    candidate_id = data.get("candidate_id")
    reviewer_id = data.get("reviewer_id")
    is_passed = data.get("is_passed")
    
    if not candidate_id or reviewer_id is None or is_passed is None:
        raise HTTPException(status_code=400, detail="必須パラメータが不足しています")
    
    now = datetime.now(JST)
    new_stage = "web面談" if is_passed else "不合格"

    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        # ① Candidate.status を最新に
        candidate.status = new_stage
        candidate.document_review_date = now
        candidate.document_review_reviewer = reviewer_id
        candidate.document_review_result = "合格" if is_passed else "不合格"
        candidate.updated_at = now

        # ② 履歴を追加（共通関数に統一）
        update_candidate_status(db, candidate_id, new_stage, reviewer_id)

        db.commit()

    return JSONResponse(content={
        "success": True,
        "is_passed": is_passed,
        "reviewed_at": to_jst_iso(now)
    })
