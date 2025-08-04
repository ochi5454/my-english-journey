# 標準ライブラリ
import os
import re
import json
import logging
import openai
from collections import Counter
import traceback
from openai import OpenAI
import asyncio
import sqlite3 
from uuid import uuid4
import pickle

# サードパーティライブラリ
from fastapi import FastAPI, Request, HTTPException, APIRouter, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OpenAIEmbeddings
from langdetect import detect
from dotenv import load_dotenv
from datetime import datetime, timezone
from typing import Optional, List
from fastapi.staticfiles import StaticFiles
from pptx import Presentation
import numpy as np

# 自作モジュール
from def_library import generate_related_keywords_llm, search_items_in_json, search_database, load_json, save_conversation_to_file, generate_summary, enhance_retrieval_with_topics, clean_related_keywords, recommend_items_with_llm, extract_keywords, get_next_interquest_id, get_user_memory_and_store, get_max_id_num, recommend_generate_items, assign_sequential_ids, mask_personal_info, load_all_documents_texts, search_items_in_documents, load_sharepoint_document, extract_ids_from_llm_text, translate_to_english, get_negative_feedbacks, extract_text_from_pptx, init_filedb, get_public_like_feedbacks_by_product, convert_pptx_to_pdf, search_similar_pptx, build_pptx_index_incremental, generate_ai_reason_comment, search_similar_summaries, save_pptx_file, summarize_and_store_slides, load_valid_summaries, extract_themes_from_text, summarize_pdf_slides_with_vision, merge_summaries_by_slide_index, load_pptx_index_text, process_single_file
from config import SAVE_DIR, VECTORSTORE_DIR, DATA_DIR, FEEDBACK_DIR, FILESUMMARY_PATH, PPTXUPLOAD_DIR, PDFUPLOAD_DIR, PPTX_INDEX_PATH


from hashtag_trigger import ACTION_MAP, RequestBody
from hashtag_config import load_hashtag_map

hashtag_map = {}

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global hashtag_map
    hashtag_map = load_hashtag_map()

    init_filedb() #### 2025.7.28 Add（image pptx）
    print("✅ init_filedb() executed from lifespan")

    yield
    # Shutdown (必要に応じて)

app = FastAPI(lifespan=lifespan)

#### 2025.7.15 Add（attachment files）START
router = APIRouter()
# app.mount("/", StaticFiles(directory="./frontend/build", html=True), name="static")


#### 2025.7.8 Add（avoid error）START
# OpenMP関連のエラー回避設定（FAISS対策）
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
#### 2025.7.8 Add（avoid error）END

# .envファイルから環境変数を読み込む
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY が設定されていません。")

#### 2025.7.22 Add（summarize pptx）START
client = OpenAI(api_key=api_key)
#### 2025.7.22 Add（summarize pptx）END

#### 2025.7.28 Add（image pptx）START
# /static/pdf_files/filename でアクセスできるようにマウント
app.mount("/static/pdf_files", StaticFiles(directory=PDFUPLOAD_DIR), name="pdf_files")
#### 2025.7.28 Add（image pptx）END

# OpenAI埋め込みモデルの初期化
embedding = OpenAIEmbeddings(api_key=api_key)

# ユーザーごとのメモリ／ベクトルストアを管理する辞書
user_memories = {}
user_vectorstores = {}

# 1回の発言を表すモデル（役割・内容・タイムスタンプ）
class ChatTurn(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

# 複数の発言をまとめたチャットメッセージモデル（発言リスト・タイムスタンプ・要約）
class ChatMessage(BaseModel):
    messages: List[ChatTurn]
    #### 2025.7.9 Mod（avoid error）START
    timestamp: Optional[str] = None  # ✅ 任意にする
    #### 2025.7.9 Mod（avoid error）END
    summary: Optional[str] = None

# ユーザーからのチャットリクエストデータモデル（ユーザーID・質問・メッセージ・履歴）
class ChatRequest(BaseModel):
    user_id: str
    question: Optional[str] = None
    message: Optional[str] = None
    chat_history: Optional[List[ChatMessage]] = None

#### 2025.7.25 Add（public feedback）START
class FeedbackLike(BaseModel):
    message: str
    user_id: Optional[str] = None
    timestamp: Optional[str] = None
#### 2025.7.25 Add（public feedback）END

#### 2025.7.15 Add（attachment files）START
class Product(BaseModel):
    id: str
    name: str
    description: str
    price: float
    category: str
    score: Optional[float] = None
    filename: Optional[str] = None
    sourceDb: Optional[str] = None #### 2025.7.16 Add（source db）
    liked_feedbacks: Optional[List[FeedbackLike]] = None #### 2025.7.25 Add（public feedback）
#### 2025.7.15 Add（attachment files）END

#### 2025.7.8 Add（recommend db）START
# 商品推薦APIのリクエストモデル（セッションID・検索クエリ）
class ProductQuery(BaseModel):    
    session_id: Optional[str] = None  # 必須でなくてもOK
    query: str
    export_format: Optional[str] = None  # "csv" or "json"
    category: Optional[str] = None  # フィルタリング用カテゴリ
    date_range: Optional[List[str]] = ["2025-01-01", datetime.now().strftime("%Y-%m-%d")] # フィルタリング用日付範囲 ["YYYY-MM-DD", "YYYY-MM-DD"]
    search_level: str = "expanded"  # "basic", "expanded", "conversation" のいずれか #### 2025.7.17 Mod（radio checkbox）
    include_english: bool = False  # 英語データを含めるかどうか #### 2025.7.17 Mod（radio checkbox）

# 商品推薦APIのレスポンスモデル（ユーザーID・メッセージ・キーワード・推薦内容）
class RecommendationResponse(BaseModel):
    user_id: str
    message: str
    keywords: List[str]
    recommendations: List[Product] #### 2025.7.15 Add（attachment files）
    recommendation_text: str #### 2025.7.15 Add（attachment files）
#### 2025.7.8 Add（recommend db）END

#### 2025.7.18 Add（feedback）START
class Feedback(BaseModel):
    user_id: str
    message: Optional[str] = None
    product_id: str
    product_name: Optional[str] = None
    product_description: Optional[str] = None
    feedback: str
    timestamp: str
    public: Optional[bool] = False  #### 2025.7.25 Mod（public feedback）
#### 2025.7.18 Add（feedback）END

# CORS設定を追加
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # フロントエンドのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# リクエストごとにuser_idを付与するミドルウェア（ヘッダー、パス、ボディから抽出／生成）
@app.middleware("http")
async def assign_user_id(request: Request, call_next):
    try:
        user_id = None

        if request.method == "GET":
            path = request.url.path
            match = re.search(r"/history/([a-zA-Z0-9_]+)", path)
            if match:
                user_id = match.group(1)
            else:
                user_id = request.headers.get("X-User-ID")
            print(f"Check1: {user_id}")

        else:
            user_id = request.headers.get("X-User-ID")
            print(f"Check2: {user_id}")

            if not user_id or user_id.strip() == "":
                body_bytes = await request.body()

                # ★重要：body をキャッシュ
                async def receive():
                    return {"type": "http.request", "body": body_bytes}

                request._receive = receive

                if body_bytes:
                    try:
                        body = json.loads(body_bytes.decode("utf-8"))
                        user_id = body.get("user_id") or body.get("session_id") #### 2025.7.8 Mod (recommend db)
                        print(f"Check3: {user_id}")
                    except Exception as e:
                        print(f"Error parsing body: {str(e)}")
                        user_id = None
                else:
                    print("Body is empty")
                    user_id = None

        if not user_id:
            user_id = get_next_interquest_id()
            print(f"Generated user_id: {user_id}")
        else:
            print(f"Using provided user_id: {user_id}")

        request.state.user_id = user_id
        response = await call_next(request)
        response.headers["X-User-ID"] = user_id
        return response

    except Exception as e:
        print(f"Error in assign_user_id middleware: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            content={"error": "Failed to process user ID"},
            status_code=500
        )
#### 2025.7.4 Mod（user_id count）END

#### 2025.7.7 Mod（user_id count）START
# / ルートエンドポイント：APIの稼働確認用
@app.get("/")
def root(request: Request):
    return {
        "message": "LangChain Chat API is running.",
        "user_id": getattr(request.state, "user_id", None)
    }
#### 2025.7.7 Mod（user_id count）END

# /chatエンドポイント：AI応答・質問推測・会話保存を行う
@app.post("/chat", summary="Send AI response and ask ChatGPT to infer user question")
async def chat(req: ChatRequest, request: Request):
    print("✅ Start of /chat")
    print(f"req.message: {req.message}")
    print(f"req.user_id: {req.user_id}")
    try:
        # ミドルウェアで設定されたユーザーIDを取得
        user_id = request.state.user_id
        print(f"Using user_id: {user_id}")

        #### 2025.7.8 Mod（history）START
        # ユーザーの入力にそのまま応答する
        chatgpt_reply = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "あなたは、ユーザーの指示に従って会話を記録・保存できるアシスタントです。"},
                {"role": "user", "content": req.message or req.question or ""}
            ],
            max_tokens=4000,
            temperature=0.7
        )

        ai_response = chatgpt_reply.choices[0].message.content
        #### 2025.7.8 Mod（history）END

        if not ai_response:
            return {"error": "Missing AI response."}
        
        detected_language = "unknown"  # Default value
        # `langdetect` を使ってAIの応答の言語を判定
        try:
            detected_language = detect(ai_response)
        except Exception as e:
            print(f"ERROR: language detection failed: {str(e)}")

        # user_id を一貫して使用
        user_memory, vectorstore = get_user_memory_and_store(user_id, embedding)

        # 関連する過去の会話を検索
        similar_chunks = []
        topics = []
        if vectorstore:
            topics, similar_chunks = enhance_retrieval_with_topics(
                #### 2025.7.8 Mod（history）START
                query=req.message or req.question or "",
                #### 2025.7.8 Mod（history）END
                vectorstore=vectorstore
            )

        # プロンプトに過去の関連会話を含める
        context = "\n".join(similar_chunks)
        enhanced_message = f"""Context from past conversations:
        Topics: {', '.join(topics)}

        Related conversations:
        {context}

        Given this response from AI: "{ai_response}", what might the user have asked? Please infer the user’s question from this response."""

        # 言語に合わせて推測のプロンプトを変更
        
        if detected_language == 'ja':  # 日本語が検出された場合
            enhanced_message = enhanced_message.replace("Please infer the user’s question from this response.", "この応答からユーザーの質問を推測してください。")
        elif detected_language == 'en':  # 英語が検出された場合
            enhanced_message = enhanced_message.replace("Please infer the user’s question from this response.", "Please infer the user’s question from this response.")
        else:  # 他の言語が検出された場合
            # 必要に応じて他の言語も対応できます
            pass
        
        # ChatGPTに「この応答はどんな質問に対するものか」を推測させる
        try:
            # `gpt-3.5-turbo`に、AIの応答からユーザーの質問を推測させる
            chatgpt_question = openai.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an assistant that infers user questions from AI responses."},
                    {"role": "user", "content": enhanced_message}
                ],
                max_tokens=150,
                temperature=0.7
            )
            
            langchain_response = chatgpt_question.choices[0].message.content

        except Exception as e:
            langchain_response = None

        #### 2025.7.9 Mod（history）START
        summary = generate_summary(req.message or req.question or "", ai_response, langchain_response or "")
        #### 2025.7.9 Mod（history）END

        #### 2025.7.8 Mod（history）START
        # 会話履歴を保存
        try:
            print(f"Saving conversation for user: {user_id}")
            save_conversation_to_file(
                user_id=user_id,
                user_message=req.message or req.question,
                assistant_response=ai_response,
                inferred_question=langchain_response,
                summary=summary
            )

            # vectorstore に会話を蓄積
            print("Adding conversation to vectorstore")

            texts_to_add = []
            if req.message:
                texts_to_add.append(f"ユーザー: {req.message}")
            if ai_response:
                texts_to_add.append(f"アシスタント: {ai_response}")

            if texts_to_add:
                try:
                    vectorstore.add_texts(texts_to_add)
                    user_vs_path = os.path.join(VECTORSTORE_DIR, user_id)
                    vectorstore.save_local(user_vs_path)
                    print("✅ ベクトルストアに会話を保存しました")
                except Exception as e:
                    print(f"⚠️ 保存エラー: {str(e)}")

        except Exception as e:
            print(f"Failed to save conversation: {str(e)}")
        #### 2025.7.8 Mod（history）END

        # 最終的な応答に推測された質問も含める
        print(f"Check user_id:{request.state.user_id}")
        return {
            #### 2025.7.7 Mod（user_id count）START
            "user_id": request.state.user_id,
            #### 2025.7.7 Mod（user_id count）END
            "assistant_message": ai_response,  # AIの実際の応答
            "langchain_message": langchain_response,  # ChatGPT自身が推測したユーザーの質問
            "summary": summary,
            "topics": topics,
            "user_question_inferred": langchain_response  # 推測されたユーザーの質問
        }

    except Exception as e:
        print(f"Chat endpoint error: {str(e)}")
        return {"error": str(e)}

# /historyエンドポイント：ユーザーの会話履歴を取得する
@app.get("/history/{user_id}", summary="Get chat history for a user")
def get_chat_history(
    user_id: str,
    category: Optional[str] = None,
    date_range: Optional[str] = None
):
    filepath = os.path.join(SAVE_DIR, f"{user_id}.json")
    if not os.path.exists(filepath):
        return JSONResponse(
            content={
                "messages": [],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, 
            status_code=404
        )

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        # JSONファイルの実際の形式に合わせてデータを変換
        formatted_messages = []
        
        for conversation in data:
            timestamp = conversation.get("timestamp", "")
            messages = conversation.get("messages", [])
            
            # 各会話セッションから user と assistant のメッセージを抽出
            user_message = ""
            assistant_message = ""
            summary = ""
            
            for msg in messages:
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                elif msg.get("role") == "assistant":
                    assistant_message = msg.get("content", "")
                elif msg.get("role") == "context":
                    summary = msg.get("content", "").replace("要約: ", "")
            
            # フロントエンド用の形式に変換
            if user_message or assistant_message:
                formatted_messages.append({
                    "user_message": user_message,
                    "assistant_message": assistant_message,
                    "timestamp": timestamp,
                    "summary": summary
                })

        # 🔄 アドオン: フィルタリング処理（オプション）
        if category or date_range:
            from def_library import filter_results
            
            # date_rangeがクエリパラメータとして文字列で渡される場合の処理
            processed_date_range = None
            if date_range:
                try:
                    # "2025-01-01,2025-12-31" のような形式を想定
                    if "," in date_range:
                        start_date, end_date = date_range.split(",")
                        processed_date_range = (start_date.strip(), end_date.strip())
                except Exception as e:
                    print(f"日付範囲の解析エラー: {e}")
                    processed_date_range = None
            
            # フィルタリングを適用
            data = filter_results(data, category=category, date_range=processed_date_range)
        
        return {"messages": data}
    
    except Exception as e:
        print(f"Error reading history file: {str(e)}")
        return JSONResponse(
            content={
                "error": f"Failed to read history: {str(e)}",
                "messages": []
            },
            status_code=500
        )

#### 2025.7.7 Add（recommend db）START
@app.post("/recommend", response_model=RecommendationResponse, summary="Generate product recommendations based on user message")
async def recommend(req: ProductQuery, request: Request):
    print("✅ Start of /recommend")
    try:
        query_text = req.query
        print(f"✅ query_text: {query_text}")

        #### 2025.7.18 Mod（radio checkbox）START
        basic_keywords=""
        expanded_keywords=""
        history_keywords=""
        #### 2025.7.18 Mod（radio checkbox）END

    #### 2025.7.11 Mod（remove identify info）START
        # 0. 個人情報をマスクする
        masked_user_query = mask_personal_info(req.query)
        print(f"✅ masked_user_query: {masked_user_query}")

        # 1. 商品検索タグや個人情報マスクをユーザ入力テキスト上から削除
        for token in ["#商品検索", "＜メールアドレス削除＞", "＜電話番号削除＞", "＜人名削除＞", "＜会社名削除＞"]: #### 2025.7.16 Mod（remove identify info）
            masked_user_query = masked_user_query.replace(token, "")
        masked_user_query = masked_user_query.strip()
        #### 2025.7.11 Mod（remove identify info）END

        # 2. ユーザとの過去のやり取りを取得
        # 2-1. 会話履歴ベクトルストアの取得
        related_history = ""
        memory, vectorstore = get_user_memory_and_store(request.state.user_id, embedding)

        # 2-2. 過去の類似チャットを取得（商品検索に限らず）
        if req.search_level == "conversation": #### 2025.7.17 Mod（radio checkbox）
            related_history = [doc.page_content for doc in vectorstore.similarity_search(masked_user_query, k=3)] #### 2025.7.11 Mod（remove identify info）

            print(f"🔍 Retrieved {len(related_history)} related history items for query: {masked_user_query}") #### 2025.7.11 Mod（remove identify info）
            for i, h in enumerate(related_history, 1):
                print(f"  [{i}] {h}")

        #### 2025.7.18 Add（feedback）START
        # 2-2. 過去のフィードバックを取得（商品検索における）
        negative_feedbacks = get_negative_feedbacks(request.state.user_id, masked_user_query)
        excluded_product_ids = set(fb["product_id"] for fb in negative_feedbacks)
        #### 2025.7.18 Add（feedback）END

        # 3. 基本キーワード生成
        basic_keywords = extract_keywords(masked_user_query) #### 2025.7.11 Mod（remove identify info）
        print(f"🎯 基本キーワード: {basic_keywords}")

        # 4. 拡張キーワード生成
        if req.search_level != "basic": #### 2025.7.17 Mod（radio checkbox）
            try:
                raw_related = generate_related_keywords_llm(basic_keywords)
                related_keywords = clean_related_keywords(raw_related)
                print(f"🧠 拡張キーワード: {related_keywords}")
            except Exception as e:
                print(f"拡張キーワード生成に失敗: {str(e)}")
                related_keywords = basic_keywords  # fallback

        # 5. 拡張キーワードを、さらに短いキーワードに切り分ける
            related_text = "。".join(related_keywords)  # 句点でつないでも、空白でつないでもOK
            expanded_keywords = extract_keywords(related_text)
            print(f"🧠 拡張キーワードから抽出された名詞: {expanded_keywords}")

    #### 2025.7.17 Mod（radio checkbox）START
        # 6. 会話履歴からキーワードを抽出する（頻出履歴キーワードだけに絞る）
        if req.search_level == "conversation":
            history_text_all = "。".join(related_history)
            raw_history_keywords = extract_keywords(history_text_all)
            keyword_counts = Counter(raw_history_keywords)
            history_keywords = [kw for kw, _ in keyword_counts.most_common(3)]
            print(f"📜 履歴から頻出キーワード上位3つ: {history_keywords}")

        #### 2025.7.18 Mod（feedback）START
        # 7. 英語キーワードを追加する
        if req.include_english:
            try:
                # 各セットごとに英訳して追加
                translated_basic = [translate_to_english(kw) for kw in basic_keywords]
                basic_keywords = list(set(basic_keywords + translated_basic))
                print(f"🌐 英訳キーワード追加（basic）: {translated_basic}")

                if req.search_level != "basic":
                    translated_expanded = [translate_to_english(kw) for kw in expanded_keywords]
                    expanded_keywords = list(set(expanded_keywords + translated_expanded))
                    print(f"🌐 英訳キーワード追加（expanded）: {translated_expanded}")

                if req.search_level == "conversation":
                    translated_history = [translate_to_english(kw) for kw in history_keywords]
                    history_keywords = list(set(history_keywords + translated_history))
                    print(f"🌐 英訳キーワード追加（history）: {translated_history}")

            except Exception as e:
                print(f"❌ キーワード英訳に失敗: {e}")
        #### 2025.7.18 Mod（feedback）END
    #### 2025.7.17 Mod（radio checkbox）END

#### 2025.7.15 Mod（search files）START
    #### 2025.7.16 Mod（search all db）START
        # 8. DBを先に読み込む
        try:
            # 8-1. products.jsonから商品データを読み込む
            products_json = load_json(os.path.join(DATA_DIR, "products.json"))
            print(f"✅ Loaded {len(products_json)} products from products.json")
        except Exception as e:
            print(f"商品データベースの読み込みエラー: {e}")
            raise HTTPException(status_code=500, detail="商品データベースの読み込みに失敗しました(products.json)")

        try:
            # 8-2. documentsディレクトリから商品データを読み込む
            documents = load_all_documents_texts(os.path.join(DATA_DIR, "products_docs"))
            print(f"✅ Loaded {len(documents)} products from documents")
        except Exception as e:
            print(f"商品データベースの読み込みエラー: {e}")
            raise HTTPException(status_code=500, detail="商品データベースの読み込みに失敗しました(documents)")

        # try:
        #     # 8-3. sharepointから商品データを読み込む
        #     site_url = os.getenv("SHAREPOINT_SITE_URL")  # ← 例: https://yourcompany.sharepoint.com/sites/your-site
        #     folder_path = "products_docs"  # SharePoint上のフォルダ名
        #     documents = load_sharepoint_document(site_url, folder_path)
        # except Exception as e:
        #     print(f"商品データベースの読み込みエラー: {e}")
        #     raise HTTPException(status_code=500, detail="商品データベースの読み込みに失敗しました(sharepoint)")

        # 9. DB検索
        # 9-1. products.jsonから検索
        search_results_from_json  = search_items_in_json(basic_keywords, expanded_keywords, history_keywords, products_json)
        print(f"✅ Found {len(search_results_from_json)} matching items(products.json)")

        # 9-2. documentsから検索
        search_results_from_documents = search_items_in_documents(basic_keywords, expanded_keywords, history_keywords, documents)
        print(f"✅ Found {len(search_results_from_documents)} matching items(documents)")
        
        # 9-3. sharepointから検索
        # ・・・・・

        # 9-4. 各DBの検索結果に sourceDb を明記して統合
        for item in search_results_from_json:
            item["sourceDb"] = "ローカルJSON（products.json）"

        for item in search_results_from_documents:
            item["sourceDb"] = "ローカルドキュメントフォルダ（products_docs）"

        # 9-5. 結果を統合してスコア順に並べ替え
        search_results = search_results_from_json + search_results_from_documents
        search_results.sort(key=lambda x: x.get("score", 0), reverse=True)  # ★ スコア順ソート追加
        print(f"✅ Total matching items found: {len(search_results)}")

        # 9-6. 除外フィルタ適用
        search_results = [
            item for item in search_results
            if item.get("id") not in excluded_product_ids
        ]
        print(f"✅ Excluded {len(excluded_product_ids)} items based on user feedback")
        print(f"✅ Finally matching items: {len(search_results)}")
#### 2025.7.15 Mod（search files）END

        # #### 2025.7.10 Mod（generate items）START
        # # 10. もしヒットしなければ、商品をweb検索し自動生成
        # if len(search_results) == 0:
        #     print("🔎 検索結果なし → ChatGPTで商品生成")
        #     new_items = recommend_generate_items(keywords, related_history)

        #     if new_items:
        #         max_id = get_max_id_num(db) + 1  # 次の番号スタートを計算
        #         new_items = assign_sequential_ids(new_items, max_id)

        #         db.extend(new_items)
        #         try:
        #             with open("products.json", "w", encoding="utf-8") as f:
        #                 json.dump(db, f, ensure_ascii=False, indent=2)
        #             print("💾 新商品をDBに保存しました")
        #         except Exception as e:
        #             print(f"❌ DB保存エラー: {e}")
        #             raise HTTPException(status_code=500, detail="商品データ保存エラー")

        #         search_results = new_items
        #         print(f"✅ 生成した商品: {search_results}")
        # #### 2025.7.10 Mod（generate items）END

        # 11. ChatGPTでおすすめ生成
        llm_generated_text = recommend_items_with_llm(basic_keywords, search_results, related_history, req.search_level) #### 2025.7.15 Add（attachment files） #### 2025.7.17 Mod（radio checkbox）
        print(f"✅ 生成した提案: {llm_generated_text}")

        # 12. 返却予定の会話内容を先に保存
        # 12-1. 要約生成
        summary = generate_summary(masked_user_query, llm_generated_text, "") #### 2025.7.11 Mod（remove identify info）

        # 12-2. JSONに保存
        save_conversation_to_file(
            user_id=request.state.user_id,
            user_message=masked_user_query, #### 2025.7.11 Mod（remove identify info）
            assistant_response=llm_generated_text, #### 2025.7.15 Add（attachment files）
            summary=summary
        )
        # 12-3. ベクトルストアに保存
        conversation_text = f"ユーザー: {masked_user_query}\nアシスタント: {llm_generated_text}" #### 2025.7.11 Mod（remove identify info）→#### 2025.7.15 Add（attachment files）
        vectorstore.add_texts([conversation_text])
        try:
            user_vs_path = os.path.join(VECTORSTORE_DIR, request.state.user_id)
            FAISS.save_local(vectorstore, user_vs_path)
            print("✅ ベクトルストアを保存しました")
        except Exception as e:
            print(f"💾 ベクトルストア保存エラー: {e}")
        
        #### 2025.7.15 Add（attachment files）START
        # 13. UIに適切に表示するため、返却前整形作業
        # 13-1. 「該当商品」カードに出すために変換（Product構造）
        recommendation_items = []
        for i, item in enumerate(search_results):
            recommendation_items.append(Product(
                id=item.get('id', ''),
                name=item.get("name", "商品名無し"),
                description=item.get("description", item.get("text", "")),
                price=item.get("price", 0.0),
                category=item.get("category", "未分類"),
                filename=item.get("filename"),
                sourceDb=item.get("sourceDb")
            ))
        # 13-2. 「AIからの提案」する商品IDを抽出し正規化
        recommended_ids = []
        if llm_generated_text:
            recommended_ids = extract_ids_from_llm_text(llm_generated_text)
            recommended_ids = [rid.lower() for rid in recommended_ids if rid is not None]  # 小文字に統一
        print(f"✅ 抽出されたID一覧: {recommended_ids}")

        # 13-3. 「該当商品」カードの商品IDを「AIからの提案」する商品IDでフィルタ
        filtered_items = [
            item for item in recommendation_items
            if item.id.strip().lower() in [rid.strip().lower() for rid in recommended_ids]
        ]

        # 13-4. 「AIからの提案」に1件も商品IDが見つからなければ、fallback。最初の1件だけ表示
        if not filtered_items and recommendation_items:
            print("⚠️ IDがマッチしないため fallback で1件目を返却")
            filtered_items = recommendation_items[:1]

        print("✅ search_results の中身:")
        for item in search_results:
            print(f"  - id: {item.get('id', 'N/A')}, filename: {item.get('filename', '')}, category: {item.get('category', '')}, score: {item.get('score', 'N/A')}")

        print("✅ recommendation_items の中身:")
        for item in recommendation_items:
            print(f"  - id: {item.id}")

        print(f"✅ filtered_items 件数: {len(filtered_items)}")
        for item in filtered_items:
            print(f"🔍 filtered item: id={item.id}, name={item.name}")
            print("🔍 filtered_items as dicts:")
            print(item.dict(by_alias=True))
        #### 2025.7.15 Add（attachment files）END

        #### 2025.7.25 Add（public feedback）START
        # 14. 公開likeフィードバックを取得
        print(f"▶ get_public_like_feedbacks_by_product に渡すfiltered_items件数: {len(filtered_items)}")
        public_like_feedbacks = get_public_like_feedbacks_by_product([
            item.dict() for item in filtered_items
        ])
        print("▶ get_public_like_feedbacks_by_product 実行完了")
        print("✅ 公開likeフィードバック:")
        for pname, fbs in public_like_feedbacks.items():
            print(f"  - {pname}: {len(fbs)} 件")

        for item in filtered_items:
            pid = item.id
            if pid in public_like_feedbacks:
                item.liked_feedbacks = public_like_feedbacks[pid]
            print(f"✅ {pid} の公開likeフィードバック: {item.liked_feedbacks}")
        #### 2025.7.25 Add（public feedback）END

        # 15. 結果を返却
        return {
            "user_id": request.state.user_id,
            "message": masked_user_query, #### 2025.7.11 Mod（remove identify info）
            "keywords": basic_keywords,
            "recommendations": filtered_items, #### 2025.7.15 Add（attachment files）
            "recommendation_text": llm_generated_text, #### 2025.7.15 Add（attachment files）
            "used_history": related_history
        }

    except Exception as e:
        print(f"❌ Recommend endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
#### 2025.7.7 Add（recommend db）END

#### 2025.7.15 Add（attachment files）START
@router.post("/recommend/upload", summary="Upload product file for recommendation DB")
async def upload_product_file(
    request: Request,
    session_id: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        # 保存ディレクトリのパスを作成
        save_dir = os.path.join(DATA_DIR, "products_docs")
        os.makedirs(save_dir, exist_ok=True)

        if save_dir is not None and file.filename is not None:
            save_path = os.path.join(save_dir, file.filename)
        else:
            # Handle the error or provide a default value
            raise ValueError("save_dir and file.filename must not be None")
        content = await file.read()

        # ファイル保存
        with open(save_path, "wb") as f:
            f.write(content)

        print(f"✅ {file.filename} を保存しました")

        return {
            "user_id": session_id,
            "message": f"✅ ファイル「{file.filename}」を商品DBに登録しました。次回の推薦に活用されます。",
            "filename": file.filename
        }

    except Exception as e:
        print(f"❌ ファイル保存エラー: {e}")
        raise HTTPException(status_code=500, detail="ファイルの保存に失敗しました")
app.include_router(router)

@app.get("/recommend/download")
async def download_file(filename: str):
    file_path = os.path.join(DATA_DIR, "products_docs", filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
    return FileResponse(path=file_path, filename=filename, media_type='application/octet-stream')
#### 2025.7.15 Add（attachment files）END

#### 2025.7.18 Add（feedback）START
@app.post("/recommend/feedback")
async def save_feedback(fb: Feedback):
    file_path = os.path.join(FEEDBACK_DIR, f"{fb.user_id}.json")

    # 既存データ読み込み
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []

    # 重複チェック → 更新 or 追加
    updated = False
    for item in data:
        if item.get("message") == fb.message and item.get("product_id") == fb.product_id:
            item["feedback"] = fb.feedback
            item["timestamp"] = fb.timestamp
            item["public"] = fb.public
            updated = True
            break

    if not updated:
        data.append(fb.dict())

    # 保存
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"message": "フィードバック保存完了"}
#### 2025.7.18 Add（feedback）END

#### 2025.7.30 Mod（pptx defs maintenance）START
@app.post("/upload_and_index_pptx/") #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
async def upload_and_index_pptx(file: UploadFile = File(...)):
    print("✅ ファイル名:", file.filename)

    content = await file.read()
    file_id, save_filename, pptx_path = save_pptx_file(file.filename, content)

    pdf_path = convert_pptx_to_pdf(pptx_path, PDFUPLOAD_DIR)
    if pdf_path is None:
        return {"success": False, "error": "PDF変換に失敗しました"}

    slides = extract_text_from_pptx(pptx_path)
    print(f"📊 スライド枚数: {len(slides)}")

    #### 2025.7.30 Add（vision ai）START
    # テキストベース要約
    summaries_from_text = summarize_and_store_slides(file_id, save_filename, slides)
    print(f'✅textベース要約結果👉:{summaries_from_text}')

    # Vision（画像）ベース要約
    summaries_from_image = summarize_pdf_slides_with_vision(file_id, pdf_path, save_filename)
    print(f'✅Visionベース要約結果👉:{summaries_from_image}')

    # slide_index をキーに統合（画像→テキスト優先など判断可能）
    merged_summaries = merge_summaries_by_slide_index(summaries_from_text, summaries_from_image)
    merged_summaries_list = list(merged_summaries.values()) 
    print(f'✅統合した要約結果👉:{summaries_from_image}')
    #### 2025.7.30 Add（vision ai）END

    return {
        "success": True,
        "id": file_id,
        "summaries": merged_summaries_list,
        "pdf_filename": pdf_path.name
    }

@app.post("/update_summary_index") #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
async def update_summary_index():
    new_summaries = []

    for filename in os.listdir(PPTXUPLOAD_DIR):
        if not filename.endswith(".pptx"):
            continue

        result = process_single_file(filename)
        if result:
            new_summaries.append(result)

    return {
        "success": True,
        "processed_files": new_summaries,
        "message": f"{len(new_summaries)} 件のpptxファイルを要約DBに追加しました。"
    }

@app.post("/update_pptx_index")
async def update_pptx_index():
    try:
        build_pptx_index_incremental()
        return {"status": "success", "message": "PPTX index updated with new files."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/search_summaries/")
async def search_summaries(query: str = Query(...)):
    results = search_similar_summaries(query)

    #### 2025.7.30 Mod（ai comment）START
    comment = ""
    if results:
        top_summary = results[0]["summary"]
        comment = generate_ai_reason_comment(query, top_summary, content_type="summary")

    return {"results": results, "comment": comment} # 戻り値を results から型変更
    # return results
    #### 2025.7.30 Mod（ai comment）END

@app.get("/search_pptx/")
async def search_pptx(query: str = Query(...)):
    results = search_similar_pptx(query)

    #### 2025.7.30 Mod（ai comment）START
    comment = ""
    if results:
        comment = generate_ai_reason_comment(query, top_results=results, content_type="slide")

    return {"results": results, "comment": comment} # 戻り値を results から型変更
    # return results
    #### 2025.7.30 Mod（ai comment）END

@app.get("/get_theme/")
async def get_theme(limit: int = 5, source: str = "summary"):
    #### 2025.8.4 Mod（change db for themes）START
    if source == "pptx":
        print("pptxDBから読み込み")
        text = load_pptx_index_text(limit)
    else:
        print("要約DBから読み込み")
        text = load_valid_summaries(limit)
    #### 2025.8.4 Mod（change db for themes）END
    if not text:
        return {"themes": [], "message": "要約がありません"}

    themes = extract_themes_from_text(text, limit=limit)
    return {"themes": themes}
#### 2025.7.30 Mod（pptx defs maintenance）END

#### 2025.7.7 Add（log）START
# Add validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error(f"Validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": exc.body,
            "message": "Invalid request data. Please check the input format and required fields."
        },
    )
#### 2025.7.7 Add（log）END

# 2025.7.9 Add（hashtag trigger）START
# hastag trigger APIを使って、hasttag_actions.jsonを読み込み、ハッシュタグに対応するアクションを実行するAPI
@app.post("/process")
async def process(req: RequestBody, request: Request):
    # ミドルウェアで設定されたユーザーIDを取得
    user_id = request.state.user_id

    tags: List[str] = re.findall(r"#\w+", req.text)
    results = {}

    for tag in tags:
        action_details = hashtag_map.get(tag)
        if not action_details:
            continue
        action_name = action_details.get("name")
        if action_name is not None:
            action_fn = ACTION_MAP.get(action_name)
            if not action_fn:
                raise HTTPException(status_code=500, detail=f"未定義のアクション: {action_name}")
        # Execute the action
            output = await action_fn(req.text, user_id)  # user_id を渡す
            results[tag] = output
        else:
            raise HTTPException(status_code=500, detail=f"タグ {tag} に対応するアクション名が見つかりません。")            

    # ユーザーIDを含めたレスポンスを返す
    return {"user_id": user_id, "original": req.text, "results": results}
# 2025.7.9 Add（hashtag trigger）END

# 2025.7.11 Add（search documents Enhanced）START
@app.post("/search_documents", summary="Search technical documents and products based on user keywords")
async def search_documents(req: ProductQuery, request: Request):
    print("✅ Start of /search_documents")
    try:
        print(f"✅ req: {req}")
        query_text = req.query
        print(f"✅ query_text: {query_text}")

        # 1. ユーザー入力からキーワードを抽出
        keywords = extract_keywords(query_text)
        print(f"🎯 抽出キーワード: {keywords}")

        # 一般性の高いキーワードを除外
        from def_library import load_ignore_keywords, filter_keywords
        ignore_path = os.path.join(DATA_DIR, "ignorekeyword.json")
        ignore_keywords = load_ignore_keywords(ignore_path)
        keywords = filter_keywords(keywords, ignore_keywords)
        print(f"🚫 排除後キーワード: {keywords}")

        # 2. 拡張キーワード生成
        try:
            raw_related = generate_related_keywords_llm(keywords)
            related_keywords = clean_related_keywords(raw_related)
            # 🔄 keywordsをrelated_keywordsに追加（重複除去）
            if isinstance(related_keywords, list):
                related_keywords = list(set(related_keywords + keywords))
            print(f"🧠 拡張キーワード: {related_keywords}")
        except Exception as e:
            print(f"拡張キーワード生成に失敗: {str(e)}")
            related_keywords = keywords  # fallback

        # 3. 技術文書データベースを読み込む
        try:
            tech_db = load_json(os.path.join(DATA_DIR, "techdocumentDB.json"))  # フォルダを指定
        except Exception as e:
            print(f"技術文書データベースの読み込みエラー: {e}")
            tech_db = []

        print(f"✅ 技術文書データベース {len(tech_db)} 件を読み込みました。")

        # 4. 技術文書データベース検索（拡張キーワードで検索）
        tech_search_results = search_database(tech_db, related_keywords, ["name", "description", "keywords"])
        print(f"✅ {len(tech_search_results)} 件の文書を見つけました。")

        # 5. 類似キーワードを持つ技術文書を検索
        similar_tech_documents = search_database(tech_db, related_keywords, ["name", "description", "keywords"])
        print(f"✅ {len(similar_tech_documents)} 件の類似文書を見つけました。")

        # 6. 商品データベースを読み込む（技術文書が見つかった場合でも検索する）
        try:
            product_db = load_json(os.path.join(DATA_DIR, "products.json"))  # フォルダを指定
        except Exception as e:
            print(f"商品データベースの読み込みエラー: {e}")
            product_db = []

        print(f"✅ 商品データベース {len(product_db)} 件を読み込みました。")

        # 商品データベース検索（拡張キーワードで検索）
        product_search_results = search_database(product_db, related_keywords, "description")
        print(f"✅ {len(product_search_results)} 件の商品を見つけました。")

        # 類似キーワードを持つ商品を検索
        similar_products = search_database(product_db, keywords, "description")
        print(f"✅ {len(similar_products)} 件の類似商品を見つけました。")

        # 🔄 フィルタリング処理を追加
        from def_library import filter_results

        category = req.category  # ユーザーが指定したカテゴリ

        # date_rangeの型変換処理
        if req.date_range and isinstance(req.date_range, list) and len(req.date_range) == 2:
            date_range = (req.date_range[0], req.date_range[1])  # List[str] を Tuple[str, str] に変換
        else:
            date_range = None  # フィルタリングをスキップ

        tech_search_results = filter_results(tech_search_results, category=category, date_range=date_range)
        similar_tech_documents = filter_results(similar_tech_documents, category=category, date_range=date_range)
        product_search_results = filter_results(product_search_results, category=category, date_range=date_range)
        similar_products = filter_results(similar_products, category=category, date_range=date_range)

        # 技術文書と商品検索結果をランク付け
        from def_library import rank_results

        tech_search_results = rank_results(tech_search_results, related_keywords)
        similar_tech_documents = rank_results(similar_tech_documents, related_keywords)
        product_search_results = rank_results(product_search_results, related_keywords)
        similar_products = rank_results(similar_products, keywords)

        # 7. 結果を返却する前に検索履歴を保存
        from def_library import save_search_history
        
        # 検索履歴を保存
        all_results = tech_search_results + similar_tech_documents + product_search_results + similar_products
        save_search_history(request.state.user_id, req.query, all_results)
        
        return {
            "user_id": request.state.user_id,
            "query": req.query,
            "keywords": keywords,
            "related_keywords": related_keywords,
            "matching_documents": tech_search_results,
            "similar_documents": similar_tech_documents,
            "matching_products": product_search_results,
            "similar_products": similar_products
        }

    except Exception as e:
        print(f"❌ Search documents endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/export_results")
async def export_results(req: ProductQuery, request: Request):
    from fastapi.responses import Response

    results = search_database(load_json("products.json"), req.query.split(), "description")
    export_format = req.export_format  # "csv" or "json"
    if export_format == "csv":
        # CSV形式でエクスポート
        csv_data = "id,description\n" + "\n".join(f"{r['id']},{r['description']}" for r in results)
        return Response(content=csv_data, media_type="text/csv")
    elif export_format == "json":
        # JSON形式でエクスポート
        return JSONResponse(content=results)
# 2025.7.11 Add（search documents Enhanced）END

# OpenAPI スキーマのカスタマイズ .envでURL等を一元設定・管理
from openai_config import create_custom_openapi
app.openapi = lambda: create_custom_openapi(app)