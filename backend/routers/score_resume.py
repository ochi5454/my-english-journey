import os
import io
import re
import traceback
from uuid import uuid4
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException, APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
import asyncio
from fastapi.exceptions import HTTPException
from pathlib import Path
from backend.core.database import SessionLocal
from backend.core.config import RESUME_PATH, MIME_TO_EXT
from backend.models.resume import Resume, ResumeWorkHistory
from backend.models.score_resume import Candidate, CandidateDivisionScore, CandidateScoreHistory, CandidateMustCheckItem, CandidateDivisionMustCheckItem, CandidateStatus
from backend.models.interview_schedule import InterviewSchedule
from backend.services.score_resume.extract import extract_resume_text_from_pdf, extract_resume_text_from_docx, extract_resume_text_from_xlsx, normalize_pdf_text,  extract_gender_from_text, extract_motivation, summarize_motivation, extract_work_experience, summarize_work_experience, calculate_total_experience
from backend.services.score_resume.score import score_resume_from_text, score_motivation_statement, score_work_experience
from backend.services.score_resume.sanitizer import mask_personal_info
from backend.services.score_resume.vectorstore import save_masked_resume_embedding_local
from backend.services.score_resume.sql import generate_resume_sql, save_sql_to_sqlite
from backend.services.score_resume.streaming import _sse, log_step
from backend.utils.division import convert_division_to_prefix

router = APIRouter()

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
            for f in safe_files:
            
                # === ① 拡張子チェックと読み込み ===
                raw_filename = (f["filename"] or "").strip()
                ext = Path(raw_filename).suffix.lower()
                yield log_step("reading_start", f"📄 ファイル {raw_filename} の読み込みを開始します")
                await asyncio.sleep(0)
                file_stream = io.BytesIO(f["content"])

                if not ext and file.content_type in MIME_TO_EXT:
                    ext = MIME_TO_EXT[file.content_type]
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
            masked_text, extracted_name = mask_personal_info(merged_text)
            extracted_gender = extract_gender_from_text(merged_text)
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

            # 🔹 emit_sql 関数を定義（_sseを使って整形）
            def emit_sql(event: dict):
                sse_data = _sse({
                    "status": event.get("kind", "sql_log"),
                    "log": event.get("message"),
                    "data": event.get("data", {}),
                })
                # 後でまとめてyieldするためリストに貯めておく
                emitted_sql_logs.append(sse_data)

            emitted_sql_logs = []

            generated_sql = generate_resume_sql(masked_text, candidate_id, emit=emit_sql)
            save_sql_to_sqlite(generated_sql, emit=emit_sql)

            # ためたログを逐次送信
            for sse_data in emitted_sql_logs:
                yield sse_data
                await asyncio.sleep(0)
            yield log_step("sql_done", "✅ SQL構造保存完了")
            await asyncio.sleep(0)

            # === ⑦ Candidateと CandidateStatusを保存 ===
            yield log_step("db_init_start", "👤 候補者情報の登録を開始")
            await asyncio.sleep(0)
            now = datetime.utcnow()

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
                        experience=experience_years,
                        uploader_id=uploader_id,
                        preferred_div=prefix,
                        updated_by="system",
                        updated_at=now
                    )
                    db.add(candidate)
                else:
                    candidate.updated_by = "system"
                    candidate.updated_at = now
                    candidate.experience = experience_years
                    candidate.preferred_div = prefix
                db.commit()

                new_status = CandidateStatus(
                    id=str(uuid4()),
                    user_id=candidate_id,
                    stage="アップロード",
                    chat_reviewer=uploader_id,
                    reviewed_at=now,
                    reviewed_resume=False
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

            # --- 🧩 ここから追加 ---
            loop = asyncio.get_running_loop()
            queue: asyncio.Queue[dict] = asyncio.Queue()

            # emit関数: score_resume_from_text() 内から呼ばれる
            def emit(event: dict):
                queue.put_nowait(event)

            # score_resume_from_text() を別スレッドで実行（同期関数なので）
            scoring_task = loop.run_in_executor(
                None,
                score_resume_from_text,
                filtered_text,
                candidate_id,
                emit
            )

            # イベントを逐次フロントへ転送
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.3)
                    # score_resume_from_text 側から emit されたログを SSEで出力
                    yield _sse({
                        "status": event.get("kind", "log"),
                        "log": event.get("message"),
                        "data": {k: v for k, v in event.items() if k not in ("kind", "message")}
                    })
                except asyncio.TimeoutError:
                    pass

                # 終了検知
                if scoring_task.done():
                    scoring_result = scoring_task.result()
                    break
            # --- 🧩 ここまで追加 ---
            # 元々は次の1行
            # scoring_result = score_resume_from_text(filtered_text, candidate_id)

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
            now = datetime.utcnow()

            with SessionLocal() as db:
                # === 志望動機・職務経歴の抽出 ===
                print("🎯 志望動機と職務経歴のサマリを開始します")
                yield log_step("reading_extract_start", "🎯 志望動機と職務経歴のサマリを開始します")
                await asyncio.sleep(0)

                motivation_text = extract_motivation(masked_text)
                work_experience_text = extract_work_experience(masked_text)

                # === 要約とスコアリング ===
                yield log_step("reading_summary_start", "🧩 要約とスコアリングを実施中...")
                await asyncio.sleep(0)
                summarized_motivation = summarize_motivation(motivation_text) if motivation_text else None
                score_motivation = score_motivation_statement(motivation_text) if motivation_text else None

                summarized_work = summarize_work_experience(work_experience_text) if work_experience_text else None
                score_work = score_work_experience(work_experience_text) if work_experience_text else None
                yield log_step("reading_summary_done", "✅ 要約・スコアリング完了")
                await asyncio.sleep(0)
                print(f"志望動機サマリ: {summarized_motivation}")
                print(f"志望動機スコア: {score_motivation}")
                print(f"職務経歴サマリ: {summarized_work}")
                print(f"職務経歴スコア: {score_work}")

                # 🎯 candidates テーブル更新 or INSERT
                yield log_step("save_candidate_update", "💾 候補者情報を更新中...")
                await asyncio.sleep(0)
                candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
                if not candidate:
                    candidate = Candidate(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        notes=summarized_motivation,        # 志望動機サマリ
                        score_notes=score_motivation,       # 志望動機スコア
                        work_summary=summarized_work,       # 職務経歴サマリ（新規）
                        score_work=score_work,              # 職務経歴スコア（新規）
                        recommended_div=scoring_result.get("recommended_division"),
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
                    candidate.recommended_div = scoring_result.get("recommended_division")
                    candidate.updated_by = "system"
                    candidate.updated_at = now

                yield log_step("save_candidate_done", "✅ 候補者更新完了")
                await asyncio.sleep(0)

                # 🎯 must_check項目 保存
                yield log_step("must_scores_start", "🧩 マストチェックの結果を保存中...")
                await asyncio.sleep(0)
                db.query(CandidateMustCheckItem).filter_by(user_id=candidate_id).delete()
                for name, info in scoring_result.get("must_check", {}).items():
                    db.add(CandidateMustCheckItem(
                        id=str(uuid4()),
                        user_id=candidate_id,
                        item_name=name,
                        result=info.get("result", False),
                        reason=info.get("reason", "")
                    ))
                yield log_step("must_scores_done", "✅ マストチェックの結果の保存完了")
                await asyncio.sleep(0)

                # 🎯 divisionごとのmust_check保存
                yield log_step("division_mustcheck_start", "🧩 部門ごとのマストチェックの結果を保存中...")
                await asyncio.sleep(0)
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
                yield log_step("division_mustcheck_done", "✅ 部門ごとのマストチェックの結果の保存完了")
                await asyncio.sleep(0)

                # 🎯 divisionスコア 保存
                yield log_step("division_scores_start", "🏢 部門スコアを保存中...")
                await asyncio.sleep(0)
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
                yield log_step("division_scores_done", "✅ 部門スコア保存完了")
                await asyncio.sleep(0)

                # 🎯 スコア履歴 保存（重複チェックあり）
                yield log_step("division_scores_history_start", "🕓 部門スコア履歴をチェック・保存中...")
                await asyncio.sleep(0)
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

                yield log_step("division_scores_history_done", "✅ スコア履歴保存完了")
                await asyncio.sleep(0)

                db.commit()

                yield log_step("save_commit_done", "🧾 DBコミット完了")
                await asyncio.sleep(0)

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

@router.get("/resume-results")
async def get_resume_results():
    with SessionLocal() as db:
        candidates = db.query(Candidate).all()
        results = []

        for c in candidates:
            user_id = c.user_id

            # === ステータス取得 ===
            latest_status = (
                db.query(CandidateStatus)
                .filter_by(user_id=user_id)
                .order_by(CandidateStatus.reviewed_at.desc())  # reviewed_atで最新を取る（任意）
                .first()
            )
            status_value = latest_status.stage if latest_status else "アップロード"

            # === 各種関連データ ===
            must_checks = db.query(CandidateMustCheckItem)\
                .filter_by(user_id=user_id).all()

            division_must_checks = db.query(CandidateDivisionMustCheckItem)\
                .filter_by(user_id=user_id).all()

            scores = db.query(CandidateDivisionScore)\
                .filter_by(user_id=user_id).all()
            
            # --- 部門別スコア辞書を構築 ---
            division_score_map = {s.division: s.score for s in scores}

            # === division_must_check 整形 ===
            division_must_check_dict = {}
            for d in division_must_checks:
                division = d.division
                if division not in division_must_check_dict:
                    division_must_check_dict[division] = {}
                division_must_check_dict[division][d.item_name] = {
                    "result": d.result,
                    "reason": d.reason
                }

            # === 希望部門・推薦部門のスコア取得 ===
            preferred_div = c.preferred_div
            recommended_div = c.recommended_div

            preferred_div_score = None
            recommended_div_score = None
            preferred_div_reason = None
            recommended_div_reason = None

            # 希望部門スコア
            if preferred_div:
                pref_score = (
                    db.query(CandidateDivisionScore)
                    .filter_by(user_id=user_id, division=preferred_div)
                    .one_or_none()  # ← first()でもOK。整合性重視ならこちら。
                )
                if pref_score:
                    preferred_div_score = pref_score.score
                    preferred_div_reason = pref_score.reason

            # 推薦部門スコア
            if recommended_div:
                rec_score = (
                    db.query(CandidateDivisionScore)
                    .filter_by(user_id=user_id, division=recommended_div)
                    .one_or_none()
                )
                if rec_score:
                    recommended_div_score = rec_score.score
                    recommended_div_reason = rec_score.reason

            result = {
                "user_id": user_id,
                "user_name": c.name,
                "gender": c.gender,
                "status": status_value,
                "hr_decision": c.hr_decision,
                "hr_division": c.hr_division,
                "hr_title": c.hr_title,
                "hr_income": c.hr_income,
                "hr_pay_type": c.hr_pay_type,
                "hr_employment_type": c.hr_employment_type, 
                "hr_saved_at": c.hr_saved_at.isoformat() if c.hr_saved_at else None,
                "hr_saved_by": c.hr_saved_by,
                "notes": c.notes,
                "score_notes":c.score_notes,
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
                "timestamp": c.updated_at.isoformat() if c.updated_at else None,
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
            "user_name": c.name,
            "gender": c.gender,
            "status": latest_status.stage if latest_status else None,
            "notes": c.notes,
            "work_summary": c.work_summary,
            "score_notes": c.score_notes,
            "score_work": c.score_work,
            "experience": c.experience,
            "recommended_division": c.recommended_div,
            "uploader_id": c.uploader_id,
            "timestamp": latest_reviewed_at.isoformat() if latest_reviewed_at else None,
            "hr_decision": c.hr_decision,
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