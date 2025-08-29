import os
import json
from openai import OpenAI
import shutil
import io
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException, APIRouter, UploadFile, File, Form, Query, Body
from fastapi.responses import JSONResponse, FileResponse, Response, ORJSONResponse
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from langchain_community.embeddings import OpenAIEmbeddings
from dotenv import load_dotenv
from typing import Optional, List, Dict, Any, Mapping, cast
from pathlib import Path
from pydantic import ValidationError
from openai_config import create_custom_openapi
from def_library import (
    mask_personal_info, 
    score_resume, 
    call_openai_chat, 
    generate_score_review_prompt,
    parse_score_adjustments, 
    load_division_profiles, 
    extract_original_scores_from_message, 
    load_interview_config, 
    send_interview_emails, 
    save_interview_schedule, 
    save_result_to_file, 
    save_score_to_history, 
    review_with_interview_checksheet, 
    evaluate_interviewer_single, 
    load_evals_cache_for, 
    filter_cache_rows_in_memory, 
    list_diff_targets, 
    refresh_targets_and_upsert, 
    load_rubric_for_http, 
    load_evals_cache_aggregate, 
    load_division_names, 
    list_checksheet_by_interviewer, 
    get_checksheet_one, 
    merge_block, 
    upsert_checksheets_block, 
    get_checksheet_one_async, 
    _load_json, 
    load_role_focus_dict, 
    load_all_prepitem_tags_by_role, 
    extract_ids_and_labels, 
    list_all_checksheet_blocks, 
    extract_resume_text_from_pdf, 
    extract_resume_text_from_docx, 
    extract_resume_text_from_xlsx, 
    save_masked_resume_embedding_local, 
    generate_resume_sql, 
    save_sql_to_sqlite,
    send_interview_emails,
    save_interview_schedule,
    review_with_interview_checksheet,
    _safe_load_json,
    _safe_load_json_list,
    _as_non_empty_str,
    _to_prep_item_dict,
    InterviewSetupRequest as DefLibraryRequest,
    PrepItemDict
)
from config import (
    RESUME_PATH, 
    RESULT_PATH, 
    SKILLS_PATH, 
    INTERVIEWDATE_EACH_CANDIDATE_PATH, 
    TEMPLATE_QUANTITATIVE_PATH, 
    TEMPLATE_QUALITATIVE_PATH, 
    TEMPLATE_HIRIING_PATH, 
    TEMPLATE_ROLETITLE_PATH, 
    INTERVIEWER_META_PATH, 
    INTERVIEWER_SKILLS_PATH, 
    INTERVIEWER_CHECKSHEET_PATH
)
from contextlib import asynccontextmanager

# ============================================
# ✅ 1. 環境変数の読み込み & OpenMPエラー回避
# ============================================

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY が設定されていません。")

# ============================================
# ✅ 2. OpenAI クライアントと Embedding 初期化
# ============================================

client = OpenAI(api_key=api_key)
embedding = OpenAIEmbeddings(api_key=api_key)

# ============================================
# ✅ 3. MIMEタイプと拡張子のマッピング
# ============================================

MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
}

# ============================================
# ✅ 4. FastAPI アプリとルーター初期化
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(lifespan=lifespan)
router = APIRouter()

app.openapi = lambda: create_custom_openapi(app)

# ============================================
# ✅ 5. CORS ミドルウェア設定
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # フロントエンドのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# 📊 1. スコア精査・チャット関連のリクエストモデル
# ============================================

class ChatTurn(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ScoreChatRequest(BaseModel):
    candidate_id: str
    reviewer_id: str
    phase: Optional[str] = "2nd_review"
    messages: List[ChatTurn]

class ScoreAdjustment(BaseModel):
    division: str
    score: int
    reason: str

class ScoreUpdateRequest(BaseModel):
    candidate_id: str
    reviewer_id: str
    stage: Optional[str]
    adjustments: List[ScoreAdjustment]

# ============================================
# 📊 2. 面接準備・面談設定・HR評価関連のリクエストモデル
# ============================================

class PrepItem(BaseModel):
    question: str
    answer: str
    tags: List[str]  # ✅ ← ここでタグを文字列リストとして許容

class InterviewPrepByInterviewerRequest(BaseModel):
    interviewer_id: str
    candidate_id: str
    stage: str
    prepItems: List[PrepItem] = Field(default_factory=list)  # ✅ ← 型を修正
    reviewedResume: bool = False
    qualitative: Optional[Dict[str, Any]] = None
    quantitative: Optional[Dict[str, Any]] = None

class InterviewSetupRequest(BaseModel):
    interviewDate: str
    interviewer: str    # email アドレスを期待
    candidate: str      # email アドレスを期待
    todo: str
    candidateMail: str
    interviewerMail: str
    stage: str 

class HRReviewUpdate(BaseModel):
    candidate_id: str
    decision: str
    division: str
    title: str
    annual_income: Optional[int] = None

#  ============================================
#  📮 1. 候補者判定機能エンドポイント群
#  ============================================

@app.post("/resume-score") # 📄 パタン1 履歴書をそのまま保存し、スコア判定
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

@app.post("/resume-score-no-save") # 📄 パタン2 履歴書をマスクし、ベクトルDB、SQLに保存し、スコア判定
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

@app.get("/resume-results")
async def get_resume_results():
    results = []
    for file in RESULT_PATH.glob("*.json"):
        try:
            with open(file, encoding='utf-8') as f:
                results.append(json.load(f))
        except Exception as e:
            continue
    return JSONResponse(content=results)

@app.get("/resume-result/{candidate_id}")
async def get_result_by_candidate_id(candidate_id: str):
    files = sorted(RESULT_PATH.glob(f"{candidate_id}_*.json"), reverse=True)
    if not files:
        return JSONResponse(content={"error": "結果が見つかりません"}, status_code=404)

    try:
        with open(files[0], encoding="utf-8") as f:
            result_data = json.load(f)
        
        # 面談日程も読み込む（存在する場合）
        interview_file = os.path.join(INTERVIEWDATE_EACH_CANDIDATE_PATH, f"{candidate_id}.json")
        if os.path.exists(interview_file):
            with open(interview_file, encoding="utf-8") as f:
                interview_data = json.load(f)
            result_data.update(interview_data)  # 統合

        return JSONResponse(content=result_data)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/chat-score-review")
async def chat_score_review(payload: ScoreChatRequest):
    messages = [m.dict() for m in payload.messages]
    division_profiles = load_division_profiles(SKILLS_PATH)
    valid_divisions = [p["division"] for p in division_profiles]

    # 最新のuserメッセージから元スコアを抽出
    last_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
    original_scores = extract_original_scores_from_message(last_user_msg["content"]) if last_user_msg else {}

    # プロンプト生成 → 応答 → スコア解析
    prompt = generate_score_review_prompt(messages, valid_divisions)
    reply = call_openai_chat(prompt)
    adjusted_scores = parse_score_adjustments(reply, original_scores)

    return {
        "reply": reply,
        "adjusted_score": adjusted_scores  # ← 複数
    }

@app.post("/update-score")
async def update_score(payload: ScoreUpdateRequest):
    candidate_id = payload.candidate_id
    reviewer_id = payload.reviewer_id
    stage = payload.stage

    now_str = datetime.now().isoformat()

    if not payload.adjustments:
        raise HTTPException(status_code=400, detail="調整内容がありません")

    # JSON形式に変換（save_score_to_historyの仕様に合わせる）
    new_scores = [
        {
            "division": adj.division,
            "score": adj.score,
            "reason": adj.reason
        }
        for adj in payload.adjustments
    ]

    # 保存・推薦部門の更新含む
    result = save_score_to_history(
        candidate_id=candidate_id,
        new_scores=new_scores,
        updated_by=reviewer_id,
        source="chat_review"
    )

    if not result:
        raise HTTPException(status_code=500, detail="保存に失敗しました")

    # ステージ別のレビュー履歴
    if stage:
        result[f"chat_review_{stage}_at"] = now_str
        result[f"chat_reviewer_{stage}"] = reviewer_id

    result["updated_by"] = reviewer_id
    result["updated_at"] = now_str

    save_result_to_file(result, candidate_id)
    return JSONResponse(content=result)

@app.get("/interview/config")
def get_config():
    try:
        return load_interview_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/interview/setup")
def post_setup(req: InterviewSetupRequest):
    try:
        # ▼ main側 → def_library側の型へ変換（同構造ならこれでOK）
        req_for_lib: DefLibraryRequest = DefLibraryRequest.model_validate(req.model_dump())

        # ▼ def_library側の関数に渡す（Pylanceの型不一致を解消）
        send_interview_emails(req_for_lib)
        result = save_interview_schedule(req_for_lib)

        return {
            "message": "面談設定・送信成功",
            **result,
        }

    except ValidationError as ve:
        # スキーマ差異がある場合は内容を返して調整しやすく
        raise HTTPException(status_code=400, detail=f"リクエスト変換に失敗しました: {ve.errors()}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"処理エラー: {str(e)}")

@app.get("/checksheet/config")
def get_all_interview_settings(request: Request):
    user_id = request.headers.get("x-user-id")
    tags: list[dict] = []

    if user_id:
        meta = _safe_load_json(INTERVIEWER_META_PATH)
        user_meta = meta.get(user_id)
        if isinstance(user_meta, Mapping):
            dept = str(user_meta.get("department") or "").strip().lower()
            role = str(user_meta.get("role") or "").strip()
            if dept and role:
                path = INTERVIEWER_SKILLS_PATH / f"{dept}.json"
                if path.exists():
                    role_file = _safe_load_json(path)
                    role_data = role_file.get(role)
                    if isinstance(role_data, Mapping):
                        exp = role_data.get("expected_focus", [])
                        if isinstance(exp, list):
                            tags = exp

    return {
        "divisions": load_division_names(SKILLS_PATH),  # これは配列形式でOK
        "quantitativeItems": _safe_load_json_list(TEMPLATE_QUANTITATIVE_PATH),
        "qualitativeItems": _safe_load_json_list(TEMPLATE_QUALITATIVE_PATH),
        "hiringDecisions": _safe_load_json_list(TEMPLATE_HIRIING_PATH),
        "titleOptions": _safe_load_json_list(TEMPLATE_ROLETITLE_PATH),
        "focusTags": tags,
    }

@app.get("/checksheet/one", response_class=ORJSONResponse)
async def api_get_checksheet_one(
    interviewer_id: str = Query(...),
    candidate_id: str = Query(...),
    stage: str = Query(...)
):
    try:
        data = await get_checksheet_one_async(interviewer_id, candidate_id, stage)  # async 実装に
        return ORJSONResponse(content=data or {})
    except FileNotFoundError:
        return ORJSONResponse(content={})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to read checksheet: {e}")

@app.post("/checksheet")
def api_upsert_checksheet(payload: Dict[str, Any]):
    # 必須キーを取得して非空文字列に正規化
    iid = _as_non_empty_str(payload.get("interviewer_id"))
    cid = _as_non_empty_str(payload.get("candidate_id"))
    stage = _as_non_empty_str(payload.get("stage"))

    if not (iid and cid and stage):
        raise HTTPException(status_code=400, detail="interviewer_id, candidate_id, stage は必須です")

    # 既存ブロックを安全に読み込み
    try:
        existing = get_checksheet_one(iid, cid, stage) or {}
    except Exception:
        existing = {}

    # incoming は dict 前提だが、None の可能性があるのでフォールバック
    incoming = {
        "prepItems": payload.get("prepItems") or [],
        "reviewedResume": payload.get("reviewedResume") or False,
        "qualitative": payload.get("qualitative") or {},
        "quantitative": payload.get("quantitative") or {},
    }

    block = merge_block(existing, incoming)

    # フラグ追加（保存時は未精査・再評価不要）
    block["ai_score_reviewed"] = False
    block["eval_required"] = False
    block["updated_at"] = datetime.now().isoformat()

    ok = upsert_checksheets_block(
        interviewer_id=iid,   # ← str が確定
        candidate_id=cid,     # ← str が確定
        stage=stage,          # ← str が確定
        block=block,
    )
    return {"ok": ok}

@app.get("/checksheet/interviewer/{interviewer_id}")
def api_list_checksheet_by_interviewer(interviewer_id: str):
    return list_checksheet_by_interviewer(interviewer_id)

@app.post("/interview/review-score")
async def interview_review_score(payload: InterviewPrepByInterviewerRequest):
    # PrepItem -> PrepItemDict に実体変換（Noneセーフ）
    prep_items_normalized: List[PrepItemDict] = [
        _to_prep_item_dict(pi) for pi in (payload.prepItems or [])
    ]
    # （任意）Pylanceに型を明示
    prep_items_for_review = cast(List[PrepItemDict], prep_items_normalized)

    updated = review_with_interview_checksheet(
        candidate_id=payload.candidate_id,
        reviewer_id=payload.interviewer_id,
        stage=payload.stage,
        prep_items=prep_items_for_review,  # ← 型が完全一致
        reviewed_resume=getattr(payload, "reviewedResume", False),
        qualitative=getattr(payload, "qualitative", None),
        quantitative=getattr(payload, "quantitative", None),
    )
    return JSONResponse(content=updated)

#  ============================================
#  📮 2.  面接官判定機能エンドポイント群
#  ============================================

@app.get("/interviewer/rubric")
def get_interviewer_rubric_ep(request: Request):
    """
    面談者評価ルーブリックを返す。If-None-Match 対応で 304 も返せる。
    """
    try:
        data, etag = load_rubric_for_http()
        inm = request.headers.get("if-none-match")
        if inm and inm.strip('"') == etag:
            return Response(status_code=304, headers={"ETag": f'"{etag}"'})
        return JSONResponse(content=data, headers={"ETag": f'"{etag}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"rubric load error: {e}")

@app.get("/interviewer/evals-cache")
async def interviewer_evals_cache_ep(
    stage: str|None = Query(None),
    q: str|None = Query(None),
    interviewer_id: str|None = Query(None),
    candidate_id: str|None = Query(None),
    limit: int|None = Query(None, ge=1, le=200),
):
    # 面談者指定なら単一ファイル、未指定なら合算
    if interviewer_id:
        cache = load_evals_cache_for(interviewer_id)
        src_rows = cache.get("rows") or []
        cached_at = cache.get("generated_at")
    else:
        cache = load_evals_cache_aggregate()
        src_rows = cache.get("rows") or []
        cached_at = cache.get("generated_at")

    rows = filter_cache_rows_in_memory(
        src_rows, stage=stage, q=q, interviewer_id=interviewer_id, candidate_id=candidate_id, limit=limit
    )
    return JSONResponse(content={"rows": rows, "cached_at": cached_at})

@app.post("/interviewer/evals-refresh")
async def interviewer_evals_refresh_ep(payload: dict = Body(...)):
    """
    body 例:
        { "targets": [{candidate_id,interviewer_id,stage}, ...] }
        または
        { "auto": true, "stage":"面談・1次", "q":"user", "limit":100 }
    """
    targets = payload.get("targets")
    if payload.get("auto"):
        diff = list_diff_targets(stage=payload.get("stage"), q=payload.get("q"), limit=payload.get("limit"))
        targets = (diff["missing"] + diff["stale"])
    targets = targets or []

    model = payload.get("model") or "gpt-4"
    include_reasons = payload.get("includeReasons", True)
    skip_eval = payload.get("skipEval", False)

    rows = refresh_targets_and_upsert(
        targets, 
        model=model, 
        include_reasons=include_reasons,
        skip_eval=skip_eval
    )
    return JSONResponse(content={"updated": len(rows), "rows": rows})

@app.post("/interviewer/evaluate")
async def interviewer_evaluate(payload: dict = Body(...)):
    candidate_id = payload.get("candidate_id")
    interviewer_id = payload.get("interviewer_id")
    stage = payload.get("stage", "面談・1次")
    if not candidate_id or not interviewer_id:
        raise HTTPException(status_code=400, detail="candidate_id と interviewer_id は必須です")

    out = evaluate_interviewer_single(
        candidate_id=candidate_id,
        interviewer_id=interviewer_id,
        stage=stage,
        resume_result=payload.get("resume_result"),
        qa_block=payload.get("interview_prep"),
    )
    return JSONResponse(content=out)

@app.get("/checksheet/role-focus-summary")
def get_role_focus_summary():
    role_focus_dict = load_role_focus_dict(INTERVIEWER_SKILLS_PATH)
    meta = _load_json(INTERVIEWER_META_PATH)
    usage_counter = load_all_prepitem_tags_by_role(meta, INTERVIEWER_CHECKSHEET_PATH)

    role_summary = {}
    for role_key, role_data in role_focus_dict.items():
        expected_focus = role_data.get("expected_focus", [])
        expected_ids, id_to_label = extract_ids_and_labels(expected_focus)

        used_tags = usage_counter.get(role_key, {})
        missing_ids = [tag_id for tag_id in expected_ids if tag_id not in used_tags]

        role_summary[role_key] = {
            "expected_count": len(expected_ids),
            "missing_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in missing_ids
            ],
            "used_count": sum(used_tags.values()),
            "used_tags": dict(used_tags),
            "expected_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in expected_ids
            ]
        }

    return role_summary

@app.get("/checksheet/meta")
def get_interviewer_meta():
    return _load_json(INTERVIEWER_META_PATH)

@app.get("/checksheet/all", response_class=ORJSONResponse)
async def api_get_all_checksheet_blocks():
    try:
        results = list_all_checksheet_blocks()
        return ORJSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to load all checksheets: {e}")
    
@app.post("/resume-result/hr-review")
async def update_hr_review(data: HRReviewUpdate, request: Request):
    user_id = request.headers.get("x-user-id", "unknown")
    now = datetime.utcnow().isoformat()

    file_path = RESULT_PATH / f"{data.candidate_id}_result.json"

    # 既存読み込み（型を明示）
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            existing: Dict[str, Any] = json.load(f)
            if not isinstance(existing, dict):
                existing = {}
    else:
        existing: Dict[str, Any] = {
            "user_id": data.candidate_id,
            "timestamp": now,
        }

    # HR評価を更新
    existing["hr_review"] = {
        "decision": data.decision,
        "division": data.division,
        "title": data.title,
        "annual_income": data.annual_income,
        "updated_by": user_id,
        "updated_at": now,
    }

    os.makedirs(RESULT_PATH, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return {"status": "success", "path": str(file_path)}

@app.get("/resumes/by-candidate/{candidate_id}")
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