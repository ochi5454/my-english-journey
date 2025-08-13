# 標準ライブラリ
import base64
import io
import json
from json import JSONDecodeError
import os
import pickle
import platform
import re
import sqlite3
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import unicodedata
import hashlib
from hashlib import sha1
import logging

# サードパーティライブラリ
import docx
import docx2txt
import numpy as np
import openai
import pandas as pd
import pytesseract
import torch
from PIL import Image
from PyPDF2 import PdfReader
from deep_translator import GoogleTranslator
from fastapi import HTTPException
from janome.tokenizer import Tokenizer, Token
from pdf2image import convert_from_path
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Pt
from sentence_transformers import SentenceTransformer, util
from openai import OpenAI
from dotenv import load_dotenv
import fitz
from pydantic import BaseModel
import aiofiles
import orjson

# LangChain関連
from langchain.chains import ConversationChain
from langchain.memory import VectorStoreRetrieverMemory
from langchain.prompts import PromptTemplate
from langchain_core.memory import BaseMemory
from langchain_core.messages import BaseMessage
from langchain_community.vectorstores import FAISS, VectorStore
from langchain_openai import ChatOpenAI

# 設定ファイルなど
from config import (
    OPENAI_API_KEY,
    INITIAL_MESSAGES,
    IMGUPLOAD_DIR,
    COUNTER_FILE,
    VECTORSTORE_DIR,
    SAVE_DIR,
    BASE_DIR,
    FEEDBACK_DIR,
    FILESUMMARY_PATH,
    PPTXUPLOAD_DIR,
    PDFUPLOAD_DIR,
    PPTX_INDEX_PATH,
    RESUME_PATH,
    SKILLS_PATH,
    RESULT_PATH,
    TEMPLATE_INTERVIEWER_PATH,
    TEMPLATE_TODO_PATH,
    TEMPLATE_EMAIL_INTERVIEWER_PATH,
    TEMPLATE_EMAIL_CANDIDATE_PATH,
    INTERVIEWDATE_EACH_CANDIDATE_PATH,
    INTERVIEWER_CHECKSHEET_PATH,
    INTERVIEWER_SKILLS_PATH,
    INTERVIEWER_EVALS_PATH
)

# 型定義
from typing import List, Tuple, Dict, Union, Optional, Any, Iterable

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2') #### 2025.7.18 Add（feedback）
EMBEDDING_MODEL = "text-embedding-3-small" #### 2025.7.29 Add（search pptx from original not summarize）
client = OpenAI() #### 2025.7.29 Add（search pptx from original not summarize）

#### 2025.8.1 Add（reduce api consumption）START
# 必要な初期設定
if Path(".env").exists():
    load_dotenv()

# オプションで画像テキストEmbeddingを制御
ENABLE_IMAGE_EMBEDDING = os.getenv("ENABLE_IMAGE_EMBEDDING", "true").lower() == "true"

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 埋め込みキャッシュをグローバルに
embedding_cache = {}
CACHE_PATH = Path("embedding_cache.json")

# 起動時にロード
if CACHE_PATH.exists():
    try:
        with open(CACHE_PATH, "r") as f:
            embedding_cache = json.load(f)
    except Exception as e:
        logger.warning(f"⚠️ 埋め込みキャッシュの読み込みに失敗しました: {e}")
        embedding_cache = {}
#### 2025.8.1 Add（reduce api consumption）END

#### 2025.7.11 Add（remove identify info）START
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?[\d.\s-]{5,15}')

#### 2025.8.8 Add（resume）START
class InterviewSetupRequest(BaseModel):
    interviewDate: str
    interviewer: str 
    candidate: str 
    todo: str
    candidateMail: str
    interviewerMail: str
    stage: str 
#### 2025.8.8 Add（resume）END

# 新しいベクトルストアを作成して保存する
def create_new_vectorstore(path: str, embedding) -> FAISS:
    """新しいベクトルストアを作成して保存する"""
    try:
        #### 2025.7.8 Mod（history）START 
        #initial_textsを外出し
        #### 2025.7.8 Mod（history）END
        print(f"Creating new vectorstore with initial texts")
        vectorstore = FAISS.from_texts(
            texts=list(INITIAL_MESSAGES),
            embedding=embedding
        )
        
        print(f"Saving vectorstore to: {path}")
        # index.faissファイルを確実に生成
        vectorstore.save_local(path)
        
        # 保存されたことを確認
        index_path = os.path.join(path, "index.faiss")
        if os.path.exists(index_path):
            print(f"Successfully created index.faiss at: {index_path}")
        else:
            print(f"Warning: index.faiss was not created at: {index_path}")
            
        return vectorstore
    except Exception as e:
        print(f"Error creating new vectorstore: {str(e)}")
        raise

# remove number from generated keywords
def clean_related_keywords(raw_lines: List[str]) -> List[str]:
    cleaned = []
    for line in raw_lines:
        # 「1. 春の〇〇」→「春の〇〇」 に変換
        line = line.strip().lstrip("・").strip()
        if '.' in line:
            line = line.split('.', 1)[1].strip()
        if line:
            cleaned.append(line)
    return cleaned

def format_chat_history(history: List[BaseMessage]) -> str:
    formatted = []
    for msg in history:
        formatted.append(f"{msg.type}: {msg.content}")
    return "\n".join(formatted)

def build_conversation_chain(
    memory: BaseMemory,
    temperature: float = 0.7,
    model_name: str = "gpt-3.5-turbo",
    verbose: bool = True,
    custom_prompt: Optional[str] = None
) -> ConversationChain:
    """
    会話チェーンを構築する
    """
    try:
        llm = ChatOpenAI(
            temperature=temperature,
            model=model_name,
            api_key=OPENAI_API_KEY
        )
        
        # プロンプトをカスタマイズ可能にする
        if custom_prompt:
            try:
                prompt = PromptTemplate.from_template(custom_prompt)
            except Exception as prompt_error:
                raise ValueError(f"Invalid custom prompt template: {str(prompt_error)}")
        else:
            prompt = PromptTemplate.from_template("""
            The following is a friendly conversation between a human and an AI. 
            The AI is talkative and provides lots of specific details from its context.
            If the AI does not know the answer to a question, it truthfully says it does not know.

            Current conversation:
            {history}
            Human: {input}
            AI: """)
        
        # メモリの検証
        if not memory:
            raise ValueError("Memory object cannot be None")

        chain = ConversationChain(
            llm=llm,
            memory=memory,
            verbose=verbose,
            prompt=prompt
        )
        
        return chain
        
    except ValueError as ve:
        raise ValueError(f"Configuration error: {str(ve)}")
    except Exception as e:
        raise Exception(f"Failed to build conversation chain: {str(e)}")

# トピックを強化して類似会話をベクトル検索する
def enhance_retrieval_with_topics(
    query: str,
    vectorstore: VectorStore,
    k: int = 3,
    score_threshold: float = 0.7
) -> Tuple[List[str], List[str]]:
    topics = extract_topics(query)
    enhanced_query = f"{query} {' '.join(topics)}"
    retriever = vectorstore.as_retriever(
        search_kwargs={
            "k": k,
            "score_threshold": score_threshold
        }
    )
    similar_docs = retriever.invoke(enhanced_query)
    similar_chunks = [doc.page_content for doc in similar_docs if doc.page_content not in INITIAL_MESSAGES]
    return topics, similar_chunks

#### 2025.7.24 Mod（summarize pptx）START
# Extract keywords using janome
def extract_keywords(text: str) -> List[str]:
    tokenizer = Tokenizer()
    tokens = tokenizer.tokenize(text)
    keywords = []

    # 品詞フィルタ（一般名詞や固有名詞など）
    valid_pos_prefixes = ("名詞,一般", "名詞,固有名詞", "名詞,サ変接続")

    # 拡張ストップワード（あとからJSON化や辞書ファイルにしてもOK）
    stopwords = {
        "こと", "もの", "これ", "それ", "ため", "よう", "ところ", "ほう", "あと", "とき",
        "こちら", "どれ", "何", "誰", "私", "あなた", "する", "ある", "いる", "なる",
        "及び", "および", "など", "ような", "について", "における", "のため", "により"
    }

    for token in tokens:
        if not isinstance(token, Token):
            continue

        pos = token.part_of_speech.split(',')[0:2]
        pos_prefix = ",".join(pos)

        if pos_prefix.startswith(valid_pos_prefixes):
            surface = token.surface
            if surface not in stopwords and len(surface) > 1:
                keywords.append(surface)

    return list(set(keywords))
#### 2025.7.24 Mod（summarize pptx）END

# クエリから簡易的にトピック（キーワード）を抽出する
def extract_topics(text: str) -> List[str]:
    """
    テキストからトピックを抽出する簡易関数。
    実際には、キーワード抽出やトピックモデリングを使用することを推奨。

    Args:
        text (str): 検索クエリや会話内容。

    Returns:
        List[str]: 抽出されたトピックのリスト。
    """
    # 簡易的なキーワード抽出（例: スペース区切りで単語を抽出）
    return text.split()

# generate keywords using keywords which user input
def generate_related_keywords_llm(keywords: List[str]) -> List[str]:
    prompt = f"次のキーワードに関連する語句を10個リストアップしてください：{', '.join(keywords)}"
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "あなたは日本語に精通したアシスタントです。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.6,
            max_tokens=100
        )
        content = response.choices[0].message.content

        if content is not None:
            return [line.strip("・ ") for line in content.splitlines() if line.strip()]
        else:
            return []
        
    except Exception as e:
        status_code = getattr(e, "status_code", None)
        if status_code == 401:
            print("❌ LLM認証エラー: LLM APIキーが無効です。オフラインモードで実行します。")
        else:
            print(f"関連キーワード生成エラー: {str(e)}")
        return []
    
# ユーザー入力・AI応答・推測質問から会話の要点を要約する
def generate_summary(user_message: str, ai_response: str, inferred_question: str) -> str:
    prompt = f"""
以下は、ユーザーとの会話の一部です。この流れをふまえて、AIの応答と推測質問の内容を踏まえ、全体の要点を簡潔に要約してください。

=== ユーザーの入力 ===
{user_message}

=== 最新のAIの回答 ===
{ai_response}

=== 推測されたユーザーの質問 ===
{inferred_question}

要約：
"""

    try:
        summary_result = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "あなたは会話履歴全体を要約するアシスタントです。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.5
        )
        content = summary_result.choices[0].message.content
        return content.strip() if content else "要約の生成に失敗しました"
    except Exception as e:
        print(f"サマリー生成エラー: {str(e)}")
        return f"要約に失敗しました（エラー: {str(e)}）"
    
# ユーザーのメモリを作成または取得する
def get_memory_for_user(user_id: str, embedding, vectorstore: FAISS) -> VectorStoreRetrieverMemory:
    from main import user_memories

    """
    セッションID（ユーザーID）に関連するメモリを取得または作成する。

    Args:
        user_id (str): ユーザーID
        embedding: 埋め込みモデル
        vectorstore (FAISS): ユーザー固有のベクトルストア

    Returns:
        VectorStoreRetrieverMemory: ユーザーのメモリ
    """
    try:
        # ユーザー固有のメモリを取得または作成
        if user_id not in user_memories:
            memory = VectorStoreRetrieverMemory(
                retriever=vectorstore.as_retriever(search_kwargs={"k": 3}),
                memory_key="chat_history"
            )
            user_memories[user_id] = memory
        else:
            memory = user_memories[user_id]

        return memory

    except Exception as e:
        raise RuntimeError(f"Failed to initialize memory for user {user_id}: {str(e)}")
    
def get_next_interquest_id():
    try:
        # ファイルパスを絶対パスで出力（デバッグ用）
        print(f"Trying to access COUNTER_FILE at: {COUNTER_FILE}")

        # ファイルが存在しない場合は自動生成
        if not os.path.exists(COUNTER_FILE):
            with open(COUNTER_FILE, "w") as f:
                f.write("0")
            print(f"Created new counter file at: {COUNTER_FILE}")
            return "interquest_1"

        # ファイルが存在する場合、内容を読み込む
        with open(COUNTER_FILE, "r") as f:
            content = f.read().strip()
            if content.isdigit():
                counter = int(content)
            else:
                counter = 0  # 不正な内容なら0から開始

        # カウンターをインクリメントして保存（新規ID生成時のみ）
        counter += 1
        with open(COUNTER_FILE, "w") as f:
            f.write(str(counter))

        return f"interquest_{counter}"
    except Exception as e:
        print(f"❌ カウンター処理エラー: {str(e)}")
        return "interquest_0"
    
# ベクトルストアとメモリを統合して取得する（主に/chatで使用）
def get_user_memory_and_store(user_id: str, embedding) -> Tuple[VectorStoreRetrieverMemory, FAISS]:
    try:
        # ユーザーIDに基づいてフォルダパスを生成
        user_vs_path = os.path.join(VECTORSTORE_DIR, user_id)
        print(f"Check user_vs_path: {user_vs_path}")

        # フォルダが存在しない場合は作成
        os.makedirs(user_vs_path, exist_ok=True)

        index_path = os.path.join(user_vs_path, "index.faiss")
        if os.path.exists(index_path):
            print(f"Loading existing vectorstore for user: {user_id}")
            vectorstore = FAISS.load_local(
                user_vs_path,
                embedding,
                allow_dangerous_deserialization=True  # 安全性を確認した上で有効化
            )
        else:
            print(f"Creating new vectorstore for user: {user_id}")
            vectorstore = create_new_vectorstore(user_vs_path, embedding)

        # メモリの初期化
        memory = VectorStoreRetrieverMemory(retriever=vectorstore.as_retriever())
        return memory, vectorstore

    except Exception as e:
        raise RuntimeError(f"Failed to initialize memory and vectorstore for user {user_id}: {str(e)}")

# ユーザーIDに紐づくメモリとベクトルストアを取得・初期化する

def get_user_memory(user_id, embedding):
    from main import user_memories, user_vectorstores

    if user_id not in user_memories:
        # Get or create a vectorstore for this user
        if user_id not in user_vectorstores:
            # Create user-specific vectorstore path
            user_vs_path = os.path.join(VECTORSTORE_DIR, user_id)
            
            # Check if a saved vectorstore exists for this user
            if os.path.exists(user_vs_path):
                vectorstore = FAISS.load_local(user_vs_path, embedding)
            else:
                # Initialize a new vectorstore with an empty text
                vectorstore = FAISS.from_texts(
                    texts=[""], 
                    embedding=embedding
                )
                # Save it
                os.makedirs(user_vs_path, exist_ok=True)
                vectorstore.save_local(user_vs_path)
            
            user_vectorstores[user_id] = vectorstore
        
        # Now we can create the memory with the user's vectorstore
        user_memories[user_id] = get_memory_for_user(
            user_id=user_id, 
            embedding=embedding,
            vectorstore=user_vectorstores[user_id]
        )
    
    return user_memories[user_id]

# ユーザーのベクトルストアを初期化または読み込む
def initialize_vectorstore(user_id: str, embedding) -> VectorStore:
    """ベクトルストアの初期化と読み込みを行う"""
    user_vs_path = os.path.join(VECTORSTORE_DIR, user_id)
    try:        
        print(f"Vectorstore path: {user_vs_path}")

        # まずディレクトリの作成を確実に行う
        os.makedirs(user_vs_path, exist_ok=True)
        print(f"Created directory: {user_vs_path}")

        index_path = os.path.join(user_vs_path, "index.faiss")
        print(f"Index path: {index_path}")

        if os.path.exists(index_path):
            print("Loading existing vectorstore")
            try:
                # ファイルが信頼できる場合のみ読み込む
                return FAISS.load_local(user_vs_path, embedding)
            except Exception as load_error:
                print(f"Error loading existing vectorstore: {str(load_error)}")
                # 読み込みに失敗した場合は新規作成する
                print("Creating new vectorstore due to load failure")
                return create_new_vectorstore(user_vs_path, embedding)
        else:
            print("Creating new vectorstore")
            return create_new_vectorstore(user_vs_path, embedding)

    except Exception as e:
        print(f"Error in initialize_vectorstore: {str(e)}")
        # エラーが発生した場合でもベクトルストアを返す
        return create_new_vectorstore(user_vs_path, embedding)
    
# Load product database
def load_json(file_path: str = "products.json") -> List[Dict]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Product database not found")

# Generate recommendations using ChatGPT
def recommend_items_with_llm(keywords: List[str], search_results: List[Dict], history_snippets: List[str], search_level: str) -> str:    
    # search_resultsが空である場合
    if not search_results:
        return "該当する商品は1件もありませんでした。"

    #### 2025.7.17 Mod（radio checkbox）START
    if search_level in ["basic", "expanded"]:
        history_text = ""  # ← ここでブランクにする
        history_mention = "ユーザーの過去の会話履歴への言及は不要です。"
        example_text = """
    【例①（1件のみの場合）】
    「id=item011『速乾冷感タオル』は、...」

    【例②（2件あった場合）】
    「以下の2つの商品をおすすめします。

    1. id=item021『●●』は〜。
    2. id=item022『▲▲』は〜。
    」
    """
    else:  # conversation
        history_text = "\n".join(f"- {h}" for h in history_snippets)
        history_mention = "以前、〇〇について話されていましたね。と伝えるようにしてください。"
        example_text = """
    【例①（1件のみの場合）】
    「以前、暑さ対策をお探しでしたね。それも考慮すると、id=item011『速乾冷感タオル』は、...」

    【例②（2件あった場合）】
    「以前、〇〇について話されていましたね。過去の話も考慮すると、以下の2つの商品をおすすめします。

    1. id=item021『●●』は〜。
    2. id=item022『▲▲』は〜。
    」
    """

    prompt = f"""

🔁 ユーザーの過去履歴:
{history_text}

🔑 キーワード: {', '.join(keywords)}

📦 該当商品候補（スコアが高い順に最大3件まで表示）:
{json.dumps(search_results[:3], ensure_ascii=False)}

📝 以下のルールを**厳密に**守って商品をおすすめしてください：

1. 商品は search_results の中からのみ選んでください。**それ以外の商品を補完・追加してはいけません。**
2. 商品の数は search_results の数と完全に一致させてください（最大3件まで）。1件しかなければ、1件のみを紹介してください。
3. {history_mention}
4. 各商品には、必ず「id=itemXXX」の形式で**idを本文中に明記**してください。
5. 商品の名前・特徴・おすすめ理由を自然な日本語で説明してください。
6. **idだけをまとめて書いたり、箇条書きから省略したりしないでください。**各商品の紹介文の中に組み込んでください。
7. 商品候補には「score」フィールドがあり、**数値が高いほど関連性が高いことを意味します。scoreの高い商品を優先的におすすめしてください。**

{example_text}

このルールに従って、おすすめ文を自然に生成してください。
""" 
#### 2025.7.17 Mod（radio checkbox）END
    try:
        chatgpt_response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an assistant that recommends products based on user input and their past conversation history."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=400,
            temperature=0.7
        )
        if chatgpt_response.choices[0].message.content is not None:
            return chatgpt_response.choices[0].message.content
        else:
            return "おすすめの生成に失敗しました。"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)}")

# 会話ログをJSONファイルに保存する（重複チェック付き）
def save_conversation_to_file(
    user_id,
    user_message,
    assistant_response,
    inferred_question=None,
    summary=None,
    duplicate_check_limit=5
):
    try:
        filename = os.path.join(SAVE_DIR, f"{user_id}.json")
        messages = []

        # ✅ summary がある場合のみ context として保存
        if summary:
            messages.append({
                "role": "context",
                "content": f"要約: {summary}"
            })

        # 💬 ユーザーとアシスタントの発言
        messages.append({"role": "user", "content": user_message})
        messages.append({"role": "assistant", "content": assistant_response})

        # 🧠 推測質問がある場合
        if inferred_question:
            messages.append({"role": "gpt_inferred", "content": inferred_question})

        # 🕒 タイムスタンプ付きの記録データ
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "messages": messages
        }

        # 📁 既存ファイルがあれば読み込む（なければ空）
        if os.path.exists(filename):
            with open(filename, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = []
        else:
            data = []

        # 🚫 重複チェック（直近N件）
        for prev in data[-duplicate_check_limit:]:
            prev_user = next((m for m in prev["messages"] if m["role"] == "user"), {}).get("content", "")
            prev_assistant = next((m for m in prev["messages"] if m["role"] == "assistant"), {}).get("content", "")
            if user_message.strip() == prev_user.strip() and assistant_response.strip() == prev_assistant.strip():
                print("⚠️ 重複する会話（N件内）なので保存をスキップ")
                return

        # ✅ データを追加して保存
        data.append(entry)

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"✅ Successfully saved conversation to {filename}")

    except Exception as e:
        print(f"❌ Error saving conversation: {str(e)}")
        raise

#### 2025.7.18 Mod（feedback）START
# Search products based on keywords
def search_items_in_json(
    basic_keywords: List[str],
    expanded_keywords: List[str],
    history_keywords: List[str],
    db: List[Dict]
) -> List[Dict]:
    results = []
    
    # 重み設定（必要に応じて調整）
    weights = {
        "basic": 3.0,
        "expanded": 1.5,
        "history": 1.0
    }

    for item in db:
        score = 0.0
        text = f"{item.get('name', '')} {item.get('description', '')}".lower()

        for kw in basic_keywords:
            if kw.lower() in text:
                score += weights["basic"]

        for kw in expanded_keywords:
            if kw.lower() in text:
                score += weights["expanded"]

        for kw in history_keywords:
            if kw.lower() in text:
                score += weights["history"]

        if score > 0:
            item["score"] = score
            results.append(item)

    # スコアの高い順に並べる
    results.sort(key=lambda x: x["score"], reverse=True)

    return results
#### 2025.7.18 Mod（feedback）END

# 汎用的なデータベース検索関数
def search_database(database: List[Dict], keywords: List[str], fields: Union[str, List[str]]) -> List[Dict]:
    """
    汎用的なデータベース検索関数（複数フィールド対応）
    fields: 検索対象フィールド名（strまたはList[str]）
    DB上に存在しないフィールドは無視する
    """
    if isinstance(fields, str):
        fields = [fields]
    # DBに存在するフィールドのみ抽出
    if database and isinstance(database, list):
        valid_fields = set()
        for entry in database:
            valid_fields.update(entry.keys())
        fields = [f for f in fields if f in valid_fields]
    results = []
    for entry in database:
        search_texts = []
        for field in fields:
            field_value = entry.get(field, "")
            if isinstance(field_value, list):
                search_texts.append(" ".join(str(item) for item in field_value).lower())
            elif isinstance(field_value, str):
                search_texts.append(field_value.lower())
            else:
                search_texts.append(str(field_value).lower() if field_value else "")
        combined_text = " ".join(search_texts)
        if any(kw.lower() in combined_text for kw in keywords):
            results.append(entry)
    return results

def rank_results(results: List[Dict], keywords: List[str]) -> List[Dict]:
    """TF-IDF風のより高度なスコアリング"""
    import math
    
    total_docs = len(results)
    lower_keywords = [kw.lower() for kw in keywords if kw]
    
    # 各キーワードの文書頻度を計算
    doc_freq = {}
    for kw in lower_keywords:
        doc_freq[kw] = sum(1 for result in results 
                          if kw in result.get("description", "").lower())
    
    for result in results:
        description = result.get("description", "").lower()
        score = 0
        
        for kw in lower_keywords:
            tf = description.count(kw)  # Term Frequency
            if tf > 0 and doc_freq[kw] > 0:
                idf = math.log(total_docs / doc_freq[kw])  # Inverse Document Frequency
                score += tf * idf
        
        result["score"] = score
    
    return sorted(results, key=lambda x: x.get("score", 0), reverse=True)

def filter_results(
    results: List[Dict], 
    category: Optional[str] = None, 
    date_range: Optional[Union[Tuple[str, str], List[str]]] = None,
    field_existence_threshold: float = 0.5  # フィールド存在率の閾値
) -> List[Dict]:
    if not results:
        return []
    
    # カテゴリフィルタリング
    if category:
        # categoryフィールドを持つアイテムの比率をチェック
        category_count = sum(1 for result in results if "category" in result and result["category"])
        category_ratio = category_count / len(results)
        
        if category_ratio >= field_existence_threshold:
            print(f"🔍 カテゴリフィルタリング実行: {category} (存在率: {category_ratio:.2%})")
            results = [r for r in results if r.get("category", "").lower() == category.lower()]
        else:
            print(f"⚠️ categoryフィールドの存在率が低いため、フィルタリングをスキップ (存在率: {category_ratio:.2%})")
    
    # 日付フィルタリング
    if date_range:
        # dateフィールドを持つアイテムの比率をチェック
        date_count = sum(1 for result in results if "date" in result and result["date"])
        date_ratio = date_count / len(results)
        
        if date_ratio >= field_existence_threshold:
            try:
                if isinstance(date_range, list) and len(date_range) == 2:
                    start_date, end_date = date_range[0], date_range[1]
                elif isinstance(date_range, tuple) and len(date_range) == 2:
                    start_date, end_date = date_range
                else:
                    return results
                    
                print(f"🔍 日付フィルタリング実行: {start_date} - {end_date} (存在率: {date_ratio:.2%})")
                results = [r for r in results if start_date <= r.get("date", "") <= end_date]
            except Exception as e:
                print(f"日付フィルタリングエラー: {e}")
        else:
            print(f"⚠️ dateフィールドの存在率が低いため、フィルタリングをスキップ (存在率: {date_ratio:.2%})")
    
    return results

def save_search_history(user_id: str, query: str, results: List[Dict]):
    history_file = os.path.join(SAVE_DIR, f"{user_id}_search_history.json")
    history = {"query": query, "results": results, "timestamp": datetime.now(timezone.utc).isoformat()}
    if os.path.exists(history_file):
        with open(history_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []
    data.append(history)
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_excel(file_path: str, sheet_name: Optional[str] = None) -> Union[List[Dict], Dict[str, List[Dict]]]:
    import pandas as pd
    """
    エクセルファイルを読み込んでリスト形式で返す
    :param file_path: エクセルファイルのパス
    :param sheet_name: 読み込むシート名（省略可能）
    :return: シート名を指定した場合はリスト、指定しない場合は辞書形式でデータを返す
    """
    try:
        # pandasを使ってエクセルを読み込む
        df_result = pd.read_excel(file_path, sheet_name=sheet_name, engine="openpyxl")
        
        # 単一シートの場合
        if isinstance(df_result, pd.DataFrame):
            return df_result.to_dict(orient="records")
        
        # 複数シートの場合
        return {sheet: df.to_dict(orient="records") 
                for sheet, df in df_result.items()}
                
    except Exception as e:
        print(f"エクセルファイルの読み込みエラー: {str(e)}")
        return [] if sheet_name else {}
    
def load_document(file_path: str) -> str:
    """
    PDFまたはWordファイルを読み込んで文字列として返す
    :param file_path: ファイルパス
    :return: 抽出されたテキスト
    """
    try:
        file_ext = file_path.lower().split('.')[-1]
        
        if file_ext == 'pdf':
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text
            
        elif file_ext in ['doc', 'docx']:
            import docx
            doc = docx.Document(file_path)
            return "\n".join([paragraph.text for paragraph in doc.paragraphs])
            
        else:
            raise ValueError(f"Unsupported file format: {file_ext}")
            
    except Exception as e:
        print(f"ドキュメント読み込みエラー: {str(e)}")
        return ""

# SharePointからドキュメントを読み込む関数
from O365 import Account
from O365.sharepoint import Site as SharePointSite
from O365.utils.token import FileSystemTokenBackend

def load_sharepoint_document(site_url: str, file_path: str, drive_name: str = "Documents") -> str:
    """
    SharePointからドキュメントを読み込む
    
    Args:
        site_url (str): SharePointのサイトURL
        file_path (str): ファイルの相対パス
        drive_name (str, optional): ドキュメントライブラリ名. Defaults to "Documents"
        
    Returns:
        str: 抽出されたテキスト
        
    Raises:
        ValueError: 認証情報が見つからない、またはサイトに接続できない場合
        Exception: その他のエラー
    """
    try:
        # 認証情報の設定と検証
        CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
        CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
        
        if not CLIENT_ID or not CLIENT_SECRET:
            raise ValueError("SharePoint認証情報が環境変数に設定されていません")
        
        # get_token_backendを使用してトークンを設定
        token_backend = get_token_backend(token_dir="secure_sharepoint_tokens")        
        
        # アカウント認証
        credentials = (str(CLIENT_ID), str(CLIENT_SECRET))
        account = Account(credentials, token_backend=token_backend)
        
        if not account.authenticate():
            raise Exception("SharePoint認証に失敗しました")

        sharepoint = account.sharepoint()
        site_raw = sharepoint.get_site(site_url)
        if site_raw is None:
            raise ValueError(f"SharePointサイトに接続できません: {site_url}")
        site: SharePointSite = site_raw  # 型を明示

        storage = getattr(site, "storage", None)
        if not storage:
            raise ValueError(f"SharePointサイトのストレージ情報を取得できません: {site_url}")

        drives = list(storage.get_drives())

        target_drive = next((drive for drive in drives if drive.name == drive_name), None)

        if not target_drive:
            available_drives = [d.name for d in drives]
            raise ValueError(f"指定されたドライブ '{drive_name}' が見つかりません。利用可能なドライブ: {available_drives}")

        # ファイルの取得
        file = target_drive.get_item_by_path(file_path)
        if not file:
            raise ValueError(f"ファイルが見つかりません: {file_path}")

        # ファイルの種類に応じた処理
        content = get_sharepoint_content(file)
        if content is None:
            raise ValueError(f"ファイルの内容を取得できません: {file_path}")
            
        return content

    except Exception as e:
        error_msg = f"SharePointファイル読み込みエラー: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)

def get_sharepoint_content(item) -> Optional[str]:
    """
    SharePointのアイテム種別に応じてコンテンツを取得
    :param item: SharePointのアイテム（File, Folder, Image, Photo）
    :return: 取得したテキストコンテンツ、取得できない場合はNone
    """
    try:
        if hasattr(item, 'download'):
            content = item.download()
            if isinstance(content, bytes):
                return content.decode('utf-8')
            return content
        elif hasattr(item, 'get_items'):  # Folder
            items = item.get_items()
            return "\n".join([f"- {i.name}" for i in items])
        elif hasattr(item, 'download_binary'):  # Image, Photo
            metadata = {
                "name": item.name,
                "type": "image",
                "size": getattr(item, 'size', 'unknown'),
                "created_date": getattr(item, 'created_date', 'unknown')
            }
            return str(metadata)
        else:
            return None
    except Exception as e:
        print(f"コンテンツ取得エラー: {str(e)}")
        return None

def get_token_backend(token_dir: str = "secure_tokens") -> FileSystemTokenBackend:
    os.makedirs(token_dir, exist_ok=True)
    return FileSystemTokenBackend(
        token_path=token_dir,
        token_filename='sharepoint_token.txt'
    )

#### 2025.7.10 Add（generate items）START
# check item number
def get_max_id_num(items: List[Dict]) -> int:
    max_num = 0
    for item in items:
        try:
            num = int(item["id"].replace("item", ""))
            if num > max_num:
                max_num = num
        except Exception:
            continue
    return max_num

# save generated items
def assign_sequential_ids(items: List[Dict], start_num: int) -> List[Dict]:
    for i, item in enumerate(items, start=start_num):
        item["id"] = f"item{i:03d}"
        # sourceがなければgeneratedをつける
        item.setdefault("source", "generated")
    return items

# ChatGPTで商品をweb検索させ、商品DBに保存できる形にする
def recommend_generate_items(keywords: List[str], history: List[str]) -> List[Dict]:
    urls = [
        "https://www.amazon.co.jp",
        "https://www.rakuten.co.jp",
        "https://shopping.yahoo.co.jp"
    ]
    
    history_text = "\n".join(f"- {h}" for h in history)
    
    prompt = f"""
以下のウェブサイトの情報を参考にして、商品情報を最大3件、JSON形式で出力してください。

🔗 参考URL:
- {urls[0]}
- {urls[1]}
- {urls[2]}

必ずJSON形式のみで返してください。説明文や補足は不要です。

出力フォーマット（1〜3件）:
[
  {{
    "id": "item999",
    "name": "商品名",
    "category": "カテゴリ名",
    "description": "商品説明（日本語で自然に）",
    "source": "generated",
    "url": "参考にしたURL"
  }},
  ...
]
"""
    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "あなたは構造化された商品データを生成するアシスタントです。最新のWeb情報を元に提案してください。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000
        )
        content = (response.choices[0].message.content or "").strip()

        # JSON部分だけ抜き出し（角括弧で囲まれた配列形式を想定）
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if not match:
            print("❌ JSON形式のデータが見つかりません")
            return []

        json_str = match.group(0)
        items = json.loads(json_str)
        return items if isinstance(items, list) else []

    except Exception as e:
        print(f"❌ Web商品生成失敗: {e}")
        return []
#### 2025.7.10 Add（generate items）END

#### 2025.7.11 Add（一般性の高いキーワードの除外）START
# 排除キーワードのロード関数
def load_ignore_keywords(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"ignorekeyword.jsonの読み込みエラー: {e}")
        return []

# 排除キーワードでフィルタリングする関数
def filter_keywords(keywords, ignore_keywords):
    return [kw for kw in keywords if kw not in ignore_keywords]
#### 2025.7.11 Add（一般性の高いキーワードの除外）END

#### 2025.7.16 Add（remove identify info）START
def load_company_names() -> list[str]:
    try:
        company_file_path = BASE_DIR.parent / "data" / "ng_company_names.txt"
        
        with company_file_path.open("r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except Exception as e:
        print(f"⚠️ 会社名ファイルの読み込み失敗: {e}")
        return []

def mask_company_names(text: str, company_names: list[str]) -> str:
    for name in company_names:
        if name in text:
            text = text.replace(name, '＜会社名削除＞')
    return text
#### 2025.7.16 Add（remove identify info）END

def mask_personal_info(text: str) -> str:
    # メールアドレスと電話番号をマスク
    text = EMAIL_REGEX.sub('＜メールアドレス削除＞', text)
    text = PHONE_REGEX.sub('＜電話番号削除＞', text)

    # 人名をマスク
    tokenizer = Tokenizer()
    tokens = tokenizer.tokenize(text)
    masked_words = []

    for token in tokens:
        if not isinstance(token, Token):
            continue

        pos_parts_origina = token.part_of_speech
        pos_parts = (pos_parts_origina or "").split(',')

        if pos_parts[0] == "名詞" and len(pos_parts) > 2 and pos_parts[1] == "固有名詞" and pos_parts[2] == "人名":
            masked_words.append('＜人名削除＞') #### 2025.7.16 Mod（remove identify info）
        else:
            masked_words.append(token.surface)
    #### 2025.7.16 Mod（remove identify info）START
    masked_text = ''.join(masked_words)

    # 会社名をマスク
    company_names = load_company_names()
    masked_text = mask_company_names(masked_text, company_names)

    return masked_text
    #### 2025.7.16 Mod（remove identify info）END
#### 2025.7.11 Add（remove identify info）END

#### 2025.7.15 Add（search files）START
#### 2025.7.16 Add（mapping input）START
def extract_items_from_excel(filepath: str) -> list[dict]:
    items = []

    try:
        df = pd.read_excel(filepath)

        # 小文字で統一
        df.columns = [str(c).strip().lower() for c in df.columns]

        # 列名のマッピング（柔軟に対応）
        column_map = {
            "id": ["id", "商品id", "product_id", "ID", "Id"],
            "name": ["name", "商品名", "title", "名前", "名"],
            "category": ["category", "カテゴリ", "カテゴリー", "分類"],
            "description": ["description", "説明", "詳細"],
            "price": ["price", "価格", "値段", "金額"]
        }

        mapped = {}
        for key, candidates in column_map.items():
            for candidate in candidates:
                if candidate.lower() in df.columns:
                    mapped[key] = candidate.lower()
                    break
            else:
                mapped[key] = None

        for _, row in df.iterrows():
            price_val = row.get(mapped["price"], 0) if mapped["price"] else 0
            if isinstance(price_val, pd.Series):
                price_val = price_val.iloc[0]
            try:
                price = float(price_val) if not pd.isna(price_val) else 0
            except Exception:
                price = 0            
            items.append({
                "id": str(row.get(mapped["id"], "")).strip() if mapped["id"] else "",
                "name": str(row.get(mapped["name"], "")).strip() if mapped["name"] else "",
                "category": str(row.get(mapped["category"], "未分類")).strip() if mapped["category"] else "未分類",
                "text": str(row.get(mapped["description"], "")).strip() if mapped["description"] else "",
                "price": price,
                "filename": os.path.basename(filepath)
            })

    except Exception as e:
        print(f"❌ Excel読込エラー（{filepath}）: {e}")

    return items
#### 2025.7.16 Add（mapping input）END

def extract_text_from_pdf(file_path):
    try:
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""

def extract_text_from_docx(file_path):
    try:
        doc = docx.Document(file_path)
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception:
        return ""

def load_all_documents_texts(folder_path):
    result = []

    for filename in os.listdir(folder_path):
        filepath = os.path.join(folder_path, filename)

        #### 2025.7.16 Mod（mapping input）START
        if filename.endswith(".xlsx"):
            result.extend(extract_items_from_excel(filepath))  # Excelはすでに整形済みで返す
            continue

        elif filename.endswith(".pdf"):
            text = extract_text_from_pdf(filepath)
        elif filename.endswith(".docx"):
            text = extract_text_from_docx(filepath)
        else:
            continue  # 対象外の拡張子はスキップ

        if text:
            doc_id = extract_id_from_text(text)

            # 🔽 この時点で text の整形を実施
            cleaned = clean_text_for_words_pdf(text)

            result.append({
                "id": doc_id,
                "filename": filename,
                "text": cleaned["text"],
                "category": cleaned["category"],
                "name": cleaned.get("name", "商品名無し"),
                "price": cleaned.get("price", 0) 
            })
            #### 2025.7.16 Mod（mapping input）END

    return result

#### 2025.7.18 Mod（feedback）START
def search_items_in_documents(
    basic_keywords: List[str],
    expanded_keywords: List[str],
    history_keywords: List[str],
    documents: List[Dict]
) -> List[Dict]:
    results = []

    weights = {
        "basic": 3.0,
        "expanded": 1.5,
        "history": 1.0
    }

    for doc in documents:
        text = doc.get("text", "").lower()
        score = 0.0

        for kw in basic_keywords:
            if kw.lower() in text:
                score += weights["basic"]

        for kw in expanded_keywords:
            if kw.lower() in text:
                score += weights["expanded"]

        for kw in history_keywords:
            if kw.lower() in text:
                score += weights["history"]

        if score > 0:
            item = {
                "id": doc.get("id", ""),
                "name": doc.get("name", "商品名無し"),  # 変更なし
                "text": doc["text"],
                "category": doc.get("category", "未分類"),
                "filename": doc.get("filename", "不明"),
                "price": doc.get("price", 0),
                "score": score  # 👈 スコアを追加
            }
            results.append(item)

    # スコア順に並べる（降順）
    results.sort(key=lambda x: x["score"], reverse=True)

    return results
#### 2025.7.18 Mod（feedback）END
#### 2025.7.15 Add（search files）END

#### 2025.7.15 Add（attachment files）START
def extract_id_from_text(text: str) -> str:
    match = re.search(r'item\d{3}', text)
    return match.group(0) if match else ""

def extract_ids_from_llm_text(text: str) -> list[str]:
    raw_matches = re.findall(r'(?:id|ID|Id)[\s:=\-：]*item\d{3}|"item\d{3}"|「item\d{3}」',
    text, re.IGNORECASE)
    ids: list[str] = []
    for m in raw_matches:
        match = re.search(r'item\d{3}', m, re.IGNORECASE)
        if match:
            ids.append(match.group(0))
    return ids
#### 2025.7.15 Add（attachment files）END

#### 2025.7.16 Add（mapping input）START
def clean_text_for_words_pdf(raw_text: str) -> dict:
    result = {
        "category": "未分類",
        "text": raw_text.strip(),
        "name": "商品名無し",
        "price": 0  # 価格を初期化
    }

    lines = result["text"].splitlines()
    cleaned_lines = []

    category_keywords = ["カテゴリ", "カテゴリー", "分類", "category"]
    name_keywords = ["商品名", "名前", "name", "title", "見出し（タイトル）", "見出し", "タイトル"]
    price_keywords = ["価格", "値段", "price", "金額"]

    ids = extract_ids_from_llm_text(raw_text)

    for line in lines:
        line_strip = line.strip()

        # カテゴリ抽出
        if result["category"] == "未分類":
            for keyword in category_keywords:
                cat_match = re.match(rf"{keyword}(?:\s*[：:;；]?\s*)(.+)", line_strip, re.IGNORECASE)
                if cat_match:
                    result["category"] = cat_match.group(1).strip()
                    line_strip = ""
                    break

        # 名前抽出
        if result["name"] == "商品名無し":
            for keyword in name_keywords:
                name_match = re.match(rf"{keyword}(?:\s*[：:;；]?\s*)(.+)", line_strip, re.IGNORECASE)
                if name_match:
                    result["name"] = name_match.group(1).strip()
                    line_strip = ""
                    break

        # 価格抽出（数字を含む部分を抜き出す例）
        if result["price"] == 0:
            for keyword in price_keywords:
                price_match = re.match(rf"{keyword}(?:\s*[：:;；]?\s*)(.+)", line_strip, re.IGNORECASE)
                if price_match:
                    # 数字だけ抽出（カンマや小数点も考慮）
                    price_str = price_match.group(1).strip()
                    price_num_match = re.search(r"[\d,\.]+", price_str)
                    if price_num_match:
                        price_val = price_num_match.group(0).replace(",", "")
                        try:
                            result["price"] = float(price_val)
                        except:
                            result["price"] = 0
                    line_strip = ""
                    break

        # ID行の除去
        id_line_match = re.match(r"(?:id|ID|Id)\s*[：:;；=‐\-]?\s*item\d{3}", line_strip, re.IGNORECASE)
        if id_line_match:
            continue

        if any(id_val.lower() in line_strip.lower() for id_val in ids):
            continue

        if line_strip:
            cleaned_lines.append(line_strip)

    result["text"] = "\n".join(cleaned_lines).strip()
    return result
#### 2025.7.16 Add（mapping input）END

#### 2025.7.17 Mod（radio checkbox）START
def translate_to_english(text: str) -> str:
    return GoogleTranslator(source='ja', target='en').translate(text)
#### 2025.7.17 Mod（radio checkbox）END

#### 2025.7.18 Add（feedback）START
def get_negative_feedbacks(user_id: str, current_message: str, similarity_threshold: float = 0.7) -> List[Dict]:
    """
    指定ユーザーのフィードバック履歴から、現在の質問に意味的に類似し、
    かつ「dislike」された商品を抽出する。
    """
    file_path = os.path.join(FEEDBACK_DIR, f"{user_id}.json")
    if not os.path.exists(file_path):
        return []

    with open(file_path, "r", encoding="utf-8") as f:
        feedbacks = json.load(f)

    # 現在の質問の埋め込みを取得
    query_embedding = model.encode(current_message, convert_to_tensor=True)

    similar_dislikes = []
    for fb in feedbacks:
        if fb.get("feedback") != "dislike":
            continue

        fb_message = fb.get("message", "")
        if not fb_message.strip():
            continue

        # 埋め込みと類似度計算
        fb_embedding = model.encode(fb_message, convert_to_tensor=True)
        similarity = float(util.cos_sim(query_embedding, fb_embedding))

        if similarity >= similarity_threshold:
            similar_dislikes.append({
                "question": fb_message,
                "product_id": fb.get("product_id"),
                "product_name": fb.get("product_name"),
                "product_description": fb.get("product_description"),
                "reason": "過去にミスマッチとフィードバックされました。",
                "similarity": similarity
            })

    # 類似度でソート（高い順）
    return sorted(similar_dislikes, key=lambda x: x["similarity"], reverse=True)   
#### 2025.7.18 Add（feedback）END

#### 2025.7.25 Add（public feedback）START
def get_public_like_feedbacks_by_product(
    filtered_items: List  # List[Dict] or List[Product]
) -> Dict[str, List[Dict]]:
    """
    FEEDBACK_DIR配下のすべてのJSONファイルを読み込み、
    filtered_items に含まれる product_name または product_id に一致し、
    public かつ like なフィードバックを返す。

    戻り値の形式：
    {
        "UVカット帽子": [ {...}, {...} ],
        "冷感タオル": [ {...} ]
    }
    """

    # ✅ すべてのJSONファイルからフィードバックを読み込む
    all_feedbacks = []
    for file in FEEDBACK_DIR.glob("*.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    all_feedbacks.extend(data)
                elif isinstance(data, dict):
                    all_feedbacks.append(data)
        except Exception as e:
            print(f"❌ {file.name} の読み込みエラー: {e}")

    print(f"📥 全フィードバック件数: {len(all_feedbacks)}")

    result = {}

    for item in filtered_items:
        name = item.get("name") or ""
        pid = item.get("id") or ""
        print(f"🧪 item check: name={name}, id={pid}")

        matches = []
        for f in all_feedbacks:
            if f.get("public") is not True:
                continue
            if f.get("feedback") != "like":
                continue

            fname = f.get("product_name", "")
            fpid = f.get("product_id", "")

            match_by_name = (fname != "" and name != "" and fname == name)
            match_by_id = (fpid != "" and pid != "" and fpid == pid)

            print(f"🔍 比較対象: product_name={fname}, product_id={fpid}")
            print(f"   → 判定: by_name={match_by_name}, by_id={match_by_id}")

            if match_by_name or match_by_id:
                print("✅ マッチ！")
                matches.append(f)

            if matches:
                result[pid] = matches
            print(f"🎯 マッチ件数: {len(matches)}")
        else:
            print("❌ マッチなし")

    return result
#### 2025.7.25 Add（public feedback）END

#### 2025.7.30 Mod（pptx defs maintenance）START
#### 2025.8.1 Add（reduce api consumption）START
# ----- API過剰消費対策 ------
def normalize_text(text: str) -> str: 
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'\s+', '', text).lower()
    return re.sub(r'[^\w\u4E00-\u9FFF]', '', text)  # 記号削除（オプション）

def text_hash(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def file_hash(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()

def get_embedding(text):
    h = text_hash(text)
    if h in embedding_cache:
        return embedding_cache[h]
    else:
        embedding = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=[text]
        ).data[0].embedding
        embedding_cache[h] = embedding
        return embedding
#### 2025.8.1 Add（reduce api consumption）END

# ----- DB初期化・読込作業 ------
def init_filedb():
    conn = sqlite3.connect(FILESUMMARY_PATH)
    #### 2025.7.30 Mod（hard filter）
    # is_summary_valid フラグの追加
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT,
            filename TEXT,
            slide_index INTEGER,
            summary TEXT,
            embedding BLOB,
            is_summary_valid INTEGER
        );
    """)
    #### 2025.8.1 Mod（reduce api consumption）
    conn.execute("CREATE INDEX IF NOT EXISTS idx_valid_summary ON summaries(is_summary_valid);")
    conn.close()

def is_informative(text: str, min_char: int = 30) -> bool:
    text = text.strip()
    
    if len(text) < min_char:
        return False

    normalized = unicodedata.normalize('NFKC', text)  #### 2025.8.1 Mod（reduce api consumption）
    normalized = re.sub(r'\s+', '', normalized).lower()

    common_titles = [
        "タイトル", "目次", "表紙", "概要", "参考資料", "謝辞", "ご清聴ありがとうございました",
        "agenda", "title", "contents", "references", "thank you", "thanks"
    ]

    for keyword in common_titles:
        if keyword.lower() in normalized:
            return False

    # 記号のみ or 1語しかない短いものの除外 #### 2025.8.1 Mod（reduce api consumption）
    if re.fullmatch(r'[^\w\u4E00-\u9FFF]+', text):
        return False
    if len(text.split()) == 1 and len(text) < 10:
        return False

    return True

def is_already_summarized(filename: str) -> bool: #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
    conn = sqlite3.connect(FILESUMMARY_PATH)
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(1) FROM summaries WHERE filename = ?", (filename,))
        count = cur.fetchone()[0]
        return count > 0
    finally:
        conn.close()

def process_single_file(filename: str) -> dict | None: #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
    if is_already_summarized(filename):
        print(f"✅ 要約済みスキップ: {filename}")
        return None

    pptx_path = PPTXUPLOAD_DIR / filename
    pdf_path = convert_pptx_to_pdf(pptx_path, PDFUPLOAD_DIR)
    if not pdf_path:
        return None

    slides = get_valid_slides(pptx_path)
    if not slides:
        print(f"⚠️ 有効なスライドなし（スキップ）: {filename}")
        return None

    file_id = str(uuid.uuid4())
    merged_summaries = summarize_file(file_id, filename, slides, pdf_path)
    if not merged_summaries:
        return None

    save_summary(filename, merged_summaries)

    return {
        "filename": filename,
        "summary_count": len(merged_summaries)
    }

def build_pptx_index_incremental():
    print("🔍 インデックス更新処理開始")

    if PPTX_INDEX_PATH.exists():
        with open(PPTX_INDEX_PATH, "r") as f:
            index = json.load(f)
        print(f"📁 既存インデックス読み込み: {len(index)}件")
    else:
        index = []
        print("📁 新規インデックス作成")

    indexed_files = {item["filename"] for item in index}
    new_items = []

    for filename in os.listdir(PPTXUPLOAD_DIR):
        print(f"📝 チェック中: {filename}")
        if filename.endswith(".pptx") and filename not in indexed_files:
            pptx_path = PPTXUPLOAD_DIR / filename
            print(f"✅ 新規ファイル検出: {filename}")

            pdf_filename = filename.rsplit(".", 1)[0] + ".pdf"
            pdf_path = PDFUPLOAD_DIR / pdf_filename

            if not pdf_path.exists():
                print(f"❌ PDFファイルが見つかりません: {pdf_path}")
                continue
            else:
                print(f"📄 対応PDFファイル発見: {pdf_path}")

            image_output_dir = IMGUPLOAD_DIR / pdf_filename.replace(".pdf", "")
            if not image_output_dir.exists() or not any(image_output_dir.glob("*.png")):
                print(f"⚠️ 画像フォルダがないか空なので画像生成します: {image_output_dir}")
                image_paths = convert_pdf_to_images(pdf_path, image_output_dir)
            else:
                image_paths = sorted(image_output_dir.glob("*.png"))
                print(f"🖼️ 既存画像を利用します: {len(image_paths)}枚")
            if not image_paths:
                print(f"❌ スライド画像生成失敗: {filename}")
                continue
            else:
                print(f"🖼️ スライド画像数: {len(image_paths)}")

            try:
                prs = Presentation(pptx_path)
            except Exception as e:
                print(f"❌ プレゼン読み込み失敗: {e}")
                continue

            for i, slide in enumerate(prs.slides):
                print(f"🧩 スライド{i+1} 処理中")

                # --- PPTXテキスト抽出 ---
                slide_text = []
                for shape in slide.shapes:
                    if hasattr(shape, "text"):
                        slide_text.append(shape.text)
                full_text = "\n".join(slide_text).strip()
                print(f"📝 テキスト抽出（{len(full_text)}文字）")

                # --- OCR処理 ---
                image_text = ""
                if i < len(image_paths):
                    try:
                        image = Image.open(image_paths[i])
                        image_text = pytesseract.image_to_string(image, lang="jpn+eng").strip()
                        print(f"🔡 OCR文字数（スライド{i+1}）: {len(image_text)}")
                    except Exception as e:
                        print(f"⚠️ OCRエラー（{filename} スライド{i+1}）: {e}")
                else:
                    print(f"⚠️ OCR対象画像なし（スライド{i+1}）")

                if not full_text and not image_text:
                    print(f"⚠️ スライド{i+1}はテキストも画像も空のためスキップ")
                    continue

                # --- 情報量フィルタ（スキップ条件） --- #### 2025.7.31 Mod（filter before save json）
                if not is_informative(full_text) and not is_informative(image_text):
                    print(f"⚠️ スライド{i+1} 情報量が少ないためスキップ")
                    continue

                # OCRが多すぎる or 無意味そうなら捨てる
                if len(image_text) > 2000 and len(set(image_text)) < 20:
                    print(f"⚠️ OCRノイズっぽいのでスキップ（スライド{i+1}）")
                    continue

                if len(full_text.split()) > 3000:
                    print(f"⚠️ スライド{i+1}が長すぎるためスキップ: {filename}")
                    continue

                try:
                    #### 2025.8.1 Add（reduce api consumption）START
                    text_embedding = get_embedding(full_text or "")
                    # OCRテキストのEmbeddingは条件付き（無ければスキップ or 代用）
                    if image_text:
                        image_embedding = get_embedding(image_text)
                    else:
                        image_embedding = text_embedding  # fallbackやNoneでも可
                        #### 2025.8.1 Add（reduce api consumption）END
                except Exception as e:
                    print(f"❌ 埋め込み生成失敗（スライド{i+1}）: {e}")
                    continue

                new_items.append({
                    "id": str(uuid.uuid4()),
                    "filename": filename,
                    "slide_index": i,
                    "text": full_text,
                    "image_text": image_text,
                    "embedding_text": text_embedding,
                    "embedding_image_text": image_embedding
                })

    if new_items:
        index.extend(new_items)
        try:
            with open(PPTX_INDEX_PATH, "w") as f:
                json.dump(index, f, ensure_ascii=False, indent=2)
            print(f"✅ 新規PPTX {len(new_items)}件をインデックスに追加しました。")

            #### 2025.8.1 Add（reduce api consumption）START
            # ←★ここでembedding_cacheを保存する
            with open(CACHE_PATH, "w") as f:
                json.dump(embedding_cache, f)
            print("🧠 埋め込みキャッシュを保存しました。")
            #### 2025.8.1 Add（reduce api consumption）END

        except Exception as e:
            print(f"❌ インデックス保存失敗: {e}")
    else:
        print("ℹ️ 追加すべき新規PPTXはありませんでした。")

# pending #
def build_text_only_pptx_index(): #### 2025.8.6 Add（no use image）
    print("📂 テキスト専用PPTXインデックス作成開始")

    if PPTX_INDEX_PATH.exists():
        with open(PPTX_INDEX_PATH, "r") as f:
            index = json.load(f)
        print(f"📁 既存インデックス読み込み: {len(index)}件")
    else:
        index = []
        print("📁 新規インデックス作成")

    indexed_files = {item["filename"] for item in index}
    new_items = []

    for filename in os.listdir(PPTXUPLOAD_DIR):
        if not filename.endswith(".pptx") or filename in indexed_files:
            continue

        pptx_path = PPTXUPLOAD_DIR / filename
        print(f"✅ 新規ファイル検出: {filename}")

        try:
            prs = Presentation(pptx_path)
        except Exception as e:
            print(f"❌ プレゼン読み込み失敗: {e}")
            continue

        for i, slide in enumerate(prs.slides):
            slide_text = []
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    slide_text.append(shape.text)
            full_text = "\n".join(slide_text).strip()

            if not is_informative(full_text):
                print(f"⚠️ スライド{i+1} 情報量が少ないためスキップ")
                continue

            try:
                embedding = get_embedding(full_text)
            except Exception as e:
                print(f"❌ 埋め込み生成失敗（スライド{i+1}）: {e}")
                continue

            new_items.append({
                "id": str(uuid.uuid4()),
                "filename": filename,
                "slide_index": i,
                "text": full_text,
                "embedding_text": embedding
            })

    if new_items:
        index.extend(new_items)
        try:
            with open(PPTX_INDEX_PATH, "w") as f:
                json.dump(index, f, ensure_ascii=False, indent=2)
            print(f"✅ テキスト専用インデックスに{len(new_items)}件追加")

            with open(CACHE_PATH, "w") as f:
                json.dump(embedding_cache, f)
            print("🧠 埋め込みキャッシュ保存完了")
        except Exception as e:
            print(f"❌ インデックス保存失敗: {e}")
    else:
        print("ℹ️ 新規追加対象のPPTXはありませんでした。")
# pending #

def load_valid_summaries(limit: int = 50) -> str:
    conn = sqlite3.connect(FILESUMMARY_PATH)
    cursor = conn.execute(
        "SELECT summary FROM summaries WHERE is_summary_valid = 1 ORDER BY RANDOM() LIMIT ?", 
        (limit,)
    )
    
    seen = set()
    unique_summaries = []
    for row in cursor.fetchall():
        s = row[0].strip()
        if s and s not in seen:
            seen.add(s)
            unique_summaries.append(s[:500])  # 長さ制限 #### 2025.8.1 Mod（reduce api consumption）

    conn.close()
    return " ".join(unique_summaries).strip()

def load_pptx_index_text(limit: int = 50) -> str:
    if not PPTX_INDEX_PATH.exists():
        return ""

    import json
    with open(PPTX_INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    summaries = []
    seen = set()

    for item in data:
        text = item.get("text", "").strip()
        image_text = item.get("image_text", "").strip()
        combined = (text + " " + image_text).strip()

        if combined and combined not in seen:
            seen.add(combined)
            summaries.append(combined[:500])  # 長さ制限

        if len(summaries) >= limit:
            break

    return " ".join(summaries).strip()

# ----- ファイル生成・保存作業 -----
def save_pptx_file(filename: str, content: bytes):
    file_id = str(uuid4())
    os.makedirs(PPTXUPLOAD_DIR, exist_ok=True)

    #### 2025.8.1 Mod（reduce api consumption）START
    file_md5 = file_hash(content)
    save_filename = f"{file_md5}_{filename.replace('/', '_')}"
    pptx_path = PPTXUPLOAD_DIR / save_filename

    if pptx_path.exists():
        print("⚠️ 同一内容のpptxが既に存在しています（スキップ可能）")
    #### 2025.8.1 Mod（reduce api consumption）END

    with open(pptx_path, "wb") as f:
        f.write(content)

    print("✅ pptx保存済")
    return file_id, save_filename, pptx_path

def convert_pptx_to_pdf(pptx_path: Path, output_dir: Path) -> Path | None:
    print(f"✅ convert_pptx_to_pdf called with {pptx_path}")
    print(f"📂 pptx_path.exists(): {pptx_path.exists()}")
    print(f"📂 pdf_output_dir.exists(): {output_dir.exists()}")

    # 出力先を確実に作る
    output_dir.mkdir(parents=True, exist_ok=True)

    #### 2025.8.1 Add（reduce api consumption）START
    stem = pptx_path.stem
    pdf_path = output_dir / f"{stem}.pdf"
    if pdf_path.exists():
        print(f"📄 既存PDFを再利用します: {pdf_path}")
        return pdf_path
    #### 2025.8.1 Add（reduce api consumption）END

    system_name = platform.system()
    if system_name == "Darwin":  # macOS
        print("✅OSチェック：mac")
        libreoffice_path = "/opt/homebrew/bin/soffice"
    else:
        print("✅OSチェック：other")
        libreoffice_path = "soffice"

    cmd = [
        libreoffice_path,
        "--headless",
        "--convert-to", "pdf",
        "--outdir", str(output_dir),
        str(pptx_path)
    ]

    print("📤 変換コマンド:", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)

    print("📤 stdout:", result.stdout)
    print("📤 stderr:", result.stderr)

    if result.returncode != 0:
        print("❌ 変換エラー:", result.stderr)
        return None

    # 変換直後にファイルシステムへ反映が遅れるケースに備えて、少し待つ（任意）
    time.sleep(0.2)

    # stem で始まる pdf（拡張子大文字も考慮）
    stem = pptx_path.stem
    candidates = list(output_dir.glob(f"{stem}*.pdf")) + list(output_dir.glob(f"{stem}*.PDF"))

    if not candidates:
        # 念のため、出力ディレクトリ内の最近できた PDF を拾う fallback
        pdfs = sorted(output_dir.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
        pdfs_upper = sorted(output_dir.glob("*.PDF"), key=lambda p: p.stat().st_mtime, reverse=True)
        candidates = (pdfs + pdfs_upper)[:1]

    if not candidates:
        print("❌ PDF が見つかりませんでした")
        return None

    pdf_path = candidates[0]
    print("✅ PDF保存済:", pdf_path)
    return pdf_path

def convert_pdf_to_images(pdf_path: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    #### 2025.8.1 Add（reduce api consumption）START
    existing_images = sorted(output_dir.glob("slide_*.png"))
    
    if len(existing_images) > 0:
        print(f"🖼️ 既存スライド画像 {len(existing_images)} 枚を再利用します")
        return existing_images

    print(f"🛠️ PDFからスライド画像を生成します: {pdf_path}")
    #### 2025.8.1 Add（reduce api consumption）END
    images = convert_from_path(str(pdf_path), dpi=150)
    image_paths = []

    for i, image in enumerate(images):
        image_path = output_dir / f"slide_{i + 1}.png"
        image.save(image_path, "PNG")
        image_paths.append(image_path)

    return image_paths

def save_summary(filename: str, merged_summaries: list): #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
    """
    要約済スライド（merged_summaries）を SQLite に保存し、
    embedding_cache を永続化して APIコストを最小化する。
    """
    file_id = str(uuid4())
    conn = sqlite3.connect(FILESUMMARY_PATH)

    for item in merged_summaries:
        slide_index = item.get("slide_index")
        summary = item.get("summary", "").strip()

        if not summary:
            print(f"⚠️ スライド{slide_index} に summary がないためスキップ")
            continue

        try:
            embedding_vector = get_embedding(summary)  # キャッシュ付き
            embedding_blob = pickle.dumps(embedding_vector)
        except Exception as e:
            print(f"⚠️ embedding生成失敗（スライド{slide_index}）: {e}")
            embedding_blob = None

        conn.execute(
            """
            INSERT INTO summaries (
                id, filename, slide_index, summary, embedding, is_summary_valid
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (file_id, filename, slide_index, summary, embedding_blob, 1)
        )

    conn.commit()
    conn.close()

    # ✅ 埋め込みキャッシュを永続化
    try:
        with open(CACHE_PATH, "w") as f:
            json.dump(embedding_cache, f)
        print("🧠 embedding_cache を保存しました。")
    except Exception as e:
        print(f"⚠️ embedding_cache 保存失敗: {e}")

    print(f"✅ 要約DBに保存完了: {filename}")

def get_valid_slides(pptx_path: Path) -> list[str]: #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
    slides = extract_text_from_pptx(pptx_path)
    if isinstance(slides[0], str):
        return [s for s in slides if is_informative(s)]
    else:
        return [s["text"] for s in slides if is_informative(s.get("text", ""))]

def summarize_file(file_id: str, filename: str, slides: list[str], pdf_path: Path) -> list[dict]: #### 2025.8.4 Mod（/upload_and_index_pptx/ →/update_summary_index in ui）
    try:
        summaries_from_text = summarize_and_store_slides(file_id, filename, slides)
    except Exception as e:
        print(f"❌ テキスト要約失敗: {e}")
        return []

    try:
        summaries_from_image = summarize_pdf_slides_with_vision(file_id, pdf_path, filename)
    except Exception as e:
        print(f"⚠️ Vision要約失敗: {e}")
        summaries_from_image = []

    merged = merge_summaries_by_slide_index(summaries_from_text, summaries_from_image)
    return list(merged.values())

# ----- テキスト/画像抽出・ファイルの解釈作業 -----
def extract_text_from_pptx(path):
    prs = Presentation(path)
    slides = []
    for slide in prs.slides:
        text = ""
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                text += shape.text + "\n"
        slides.append(text.strip())
    return slides

def summarize_slide_image(client: OpenAI, image_path: Path) -> tuple[str | None, int]:
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    image_data = {
        "type": "image_url",
        "image_url": {"url": f"data:image/png;base64,{base64_image}"}
    }

    try:
        res = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": (
                    "あなたは優秀なスライド要約アシスタントです。画像内の内容を要約し、"
                    "有効かどうかを JSON で答えてください（例：{\"summary\": \"...\", \"is_valid\": true}）。"
                )},
                {"role": "user", "content": [
                    {"type": "text", "text": "このスライドを要約してください。"},
                    image_data
                ]}
            ],
            max_tokens=500,
            temperature=0.5,
        )

        response_text = res.choices[0].message.content.strip()
        parsed = json.loads(response_text)
        summary = parsed.get("summary", "").strip()
        is_valid = 1 if parsed.get("is_valid", False) else 0

        return summary, is_valid

    except Exception as e:
        print(f"⚠️ Vision要約失敗: {e}")
        return None, 0
    
def summarize_pdf_slides_with_vision(file_id: str, pdf_path: Path, save_filename: str) -> list[dict]:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    image_dir = IMGUPLOAD_DIR / file_id
    image_paths = convert_pdf_to_images(pdf_path, image_dir)

    conn = sqlite3.connect(FILESUMMARY_PATH)
    summaries = []

    MAX_VALID_SUMMARIES = 10
    valid_count = 0

    #### 2025.8.1 Mod（reduce api consumption）START
    vision_cache_dir = Path("vision_cache")
    vision_cache_dir.mkdir(exist_ok=True)

    def image_hash(image_path: Path) -> str:
        with open(image_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    #### 2025.8.1 Mod（reduce api consumption）END

    for i, image_path in enumerate(image_paths[:20]):  # 最大20枚
        print(f"🖼 Visionでスライド{i+1}を要約中...")

        #### 2025.8.1 Mod（reduce api consumption）START
        # ハッシュベースでキャッシュ確認
        img_hash = image_hash(image_path)
        cache_file = vision_cache_dir / f"{img_hash}.json"

        if cache_file.exists():
            with open(cache_file, "r") as f:
                cached = json.load(f)
            summary = cached.get("summary")
            is_valid = cached.get("is_valid", 0)
            print(f"📦 キャッシュから要約取得（スライド{i+1}）")
        else:
            summary, is_valid = summarize_slide_image(client, image_path)
            with open(cache_file, "w") as f:
                json.dump({"summary": summary, "is_valid": is_valid}, f, ensure_ascii=False)
        #### 2025.8.1 Mod（reduce api consumption）END

        if summary and not is_informative(summary):
            print(f"⚠️ スライド {i+1} の要約は情報量不足のためスキップ")
            continue

        embedding_blob = None
        if is_valid and summary:
            #### 2025.8.1 Mod（reduce api consumption）START
            h = text_hash(summary)
            if h in embedding_cache:
                embedding_vector = embedding_cache[h]
            else:
                emb_res = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=summary
                )
                embedding_vector = emb_res.data[0].embedding
                embedding_cache[h] = embedding_vector
            #### 2025.8.1 Mod（reduce api consumption）END
            embedding_blob = pickle.dumps(embedding_vector)

        conn.execute(
            "INSERT INTO summaries (id, filename, slide_index, summary, embedding, is_summary_valid) VALUES (?, ?, ?, ?, ?, ?)",
            (file_id, save_filename, i + 1, summary, embedding_blob, is_valid)
        )

        if is_valid:
            summaries.append({
                "id": file_id,
                "filename": save_filename,
                "slide_index": i + 1,
                "summary": summary,
                "pdf_filename": pdf_path.name,
            })
            valid_count += 1

        if valid_count >= MAX_VALID_SUMMARIES:
            print(f"✅ 有効スライドが上限 {MAX_VALID_SUMMARIES} に達したため終了")
            break

    conn.commit()
    conn.close()

    #### 2025.8.1 Add（reduce api consumption）START
    # ✅ 追加：キャッシュ保存
    with open(CACHE_PATH, "w") as f:
        json.dump(embedding_cache, f)
    #### 2025.8.1 Add（reduce api consumption）END
    return summaries

def summarize_and_store_slides(file_id: str, save_filename: str, slides: list[str]) -> list[dict]:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    summaries = []
    conn = sqlite3.connect(FILESUMMARY_PATH)

    #### 2025.8.1 Mod（reduce api consumption）START
    summary_cache_dir = Path("text_summary_cache")
    summary_cache_dir.mkdir(exist_ok=True)

    for slide_index, slide_text in enumerate(slides[:10]):  # 最大10枚
        print(f"📝 スライド {slide_index + 1} 要約開始")

        if not slide_text.strip() or not is_informative(slide_text):
            print(f"⚠️ スライド {slide_index + 1} は情報量が少ないためスキップ")
            continue

        h = text_hash(slide_text)
        cache_file = summary_cache_dir / f"{h}.json"

        if cache_file.exists():
            with open(cache_file, "r") as f:
                cached = json.load(f)
            summary = cached.get("summary")
            is_valid = cached.get("is_valid", 0)
            print(f"📦 キャッシュから要約取得（スライド{slide_index + 1}）")
        else:
            try:
                res = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": (
                            "あなたは優秀なスライド要約アシスタントです。与えられたスライドテキストを要約し、"
                            "JSON形式で {\"summary\": \"...\", \"is_valid\": true} のように返答してください。"
                        )},
                        {"role": "user", "content": f"スライドの内容: {slide_text}"}
                    ],
                    max_tokens=500,
                    temperature=0.5
                )

                response_text = res.choices[0].message.content.strip()
                parsed = json.loads(response_text)
                summary = parsed.get("summary", "").strip()
                is_valid = 1 if parsed.get("is_valid", False) else 0
                with open(cache_file, "w") as f:
                    json.dump({"summary": summary, "is_valid": is_valid}, f, ensure_ascii=False)

            except Exception as e:
                print(f"⚠️ スライド {slide_index + 1} の要約失敗: {e}")
                continue

        embedding_blob = None
        if is_valid and summary:
            eh = text_hash(summary)
            if eh in embedding_cache:
                embedding_vector = embedding_cache[eh]
            else:
                emb_res = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=summary
                )
                embedding_vector = emb_res.data[0].embedding
                embedding_cache[eh] = embedding_vector

            embedding_blob = pickle.dumps(embedding_vector)

        conn.execute(
            "INSERT INTO summaries (id, filename, slide_index, summary, embedding, is_summary_valid) VALUES (?, ?, ?, ?, ?, ?)",
            (file_id, save_filename, slide_index + 1, summary, embedding_blob, is_valid)
        )

        if is_valid:
            summaries.append({
                "id": file_id,
                "filename": save_filename,
                "slide_index": slide_index + 1,
                "summary": summary,
            })

        print(f"✅ スライド {slide_index + 1} 処理完了（valid: {is_valid}）")
        #### 2025.8.1 Mod（reduce api consumption）END

    conn.commit()
    conn.close()

    #### 2025.8.1 Add（reduce api consumption）START
    # ✅ 追加：キャッシュ保存
    with open(CACHE_PATH, "w") as f:
        json.dump(embedding_cache, f)
    #### 2025.8.1 Add（reduce api consumption）END
    return summaries

def summarize_slide_with_validation(client: OpenAI, slide_text: str) -> tuple[str | None, int]:
    #### 2025.8.1 Add（reduce api consumption）START
    summary_cache_dir = Path("text_summary_cache")
    summary_cache_dir.mkdir(exist_ok=True)
    
    h = text_hash(slide_text)
    cache_file = summary_cache_dir / f"{h}.json"

    if cache_file.exists():
        with open(cache_file, "r") as f:
            cached = json.load(f)
        summary = cached.get("summary")
        is_valid = cached.get("is_valid", 0)
        print("📦 要約キャッシュを利用しました")
        return summary, is_valid
    #### 2025.8.1 Add（reduce api consumption）END
    try:
        res = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": (
                    "あなたは優秀な要約アシスタントです。与えられたスライドを要約し、"
                    "それが有効かどうかを判定してください。有効とは、情報量が十分で、"
                    "意味・内容があることを指します。以下のJSON形式で答えてください：\n"
                    "{\"summary\": \"...\", \"is_valid\": true}"
                )},
                {"role": "user", "content": f"このスライドを要約してください:\n{slide_text}"},
            ],
            max_tokens=500,
            temperature=0.5
        )
        response_text = res.choices[0].message.content.strip()

        try:
            parsed = json.loads(response_text)
            summary = parsed.get("summary", "").strip()
            is_valid = 1 if parsed.get("is_valid", False) else 0

        #### 2025.8.1 Add（reduce api consumption）START
            # キャッシュ保存
            with open(cache_file, "w") as f:
                json.dump({"summary": summary, "is_valid": is_valid}, f, ensure_ascii=False)

            return summary, is_valid

        except json.JSONDecodeError:
            print(f"⚠️ JSON解析失敗: {response_text}")
            return None, 0
        #### 2025.8.1 Add（reduce api consumption）END

    except Exception as e:
        print(f"⚠️ 要約失敗: {e}")
        return None, 0

def merge_summaries_by_slide_index(
    summaries_from_text: list[dict],
    summaries_from_image: list[dict]
) -> dict[int, dict]:
    """
    slide_index をキーにテキストと画像の要約を統合する。

    - テキスト要約を優先。
    - 同一スライドに画像要約があれば `summary_image` として追記。

    Returns:
        統合されたスライド要約の辞書。
    """
    merged = {}

    for s in summaries_from_text:
        merged[s["slide_index"]] = s

    for s in summaries_from_image:
        idx = s["slide_index"]
        if idx not in merged:
            merged[idx] = s
        else:
            # summary_image として画像からの要約を追加
            merged[idx]["summary_image"] = s["summary"]

    return merged

# ----- 検索・整形作業 -----
def cosine_similarity(vec1, vec2):
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

def search_similar_summaries(query: str):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    query_vector = np.array(get_embedding(query)) #### 2025.8.1 Add（reduce api consumption）

    # --- データベースから有効なsummary情報を取得
    conn = sqlite3.connect(FILESUMMARY_PATH)
    cursor = conn.execute(
        "SELECT filename, slide_index, summary, embedding FROM summaries WHERE is_summary_valid = 1"
    )

    SIMILARITY_THRESHOLD = 0.45
    results = []

    for filename, slide_index, summary, emb_blob in cursor.fetchall():
        embedding_vector = np.array(pickle.loads(emb_blob))
        similarity = cosine_similarity(query_vector, embedding_vector)

        if similarity >= SIMILARITY_THRESHOLD:
            print(f'👍類似度クリア: {similarity:.4f}')
            results.append({
                "filename": filename,
                "pdf_filename": filename.replace(".pptx", ".pdf"),
                "slide_index": slide_index,
                "summary": summary,
                "score": similarity
            })

    conn.close()
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:3]

def search_similar_pptx(query: str, k: int = 5):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # --- クエリのベクトル（キャッシュ対応）
    query_embedding = np.array(get_embedding(query)) #### 2025.8.1 Add（reduce api consumption）

    with open(PPTX_INDEX_PATH, "r", encoding="utf-8") as f:
        index_data = json.load(f)

    SIMILARITY_THRESHOLD = 0.45
    combined_scores = []

    for entry in index_data:
        # --- テキストEmbedding
        try:
            text_emb = np.array(entry["embedding_text"])
            if text_emb.shape[0] != len(query_embedding):
                continue

            score_text = cosine_similarity(query_embedding, text_emb)
            if score_text >= SIMILARITY_THRESHOLD:
                print(f'👍Text類似度クリア: {score_text:.4f}')
                combined_scores.append({
                    "filename": entry["filename"],
                    "slide_index": entry["slide_index"],
                    "summary": entry["text"],
                    "score": score_text,
                    "source": "text"
                })
        except Exception as e:
            print(f"⚠️ Text embedding error: {e}")
            continue

        # --- OCR画像Embedding（任意）
        try:
            image_emb_raw = entry.get("embedding_image_text")
            if image_emb_raw is None:
                continue

            image_emb = np.array(image_emb_raw)
            if image_emb.shape[0] != len(query_embedding):
                continue

            score_img = cosine_similarity(query_embedding, image_emb)
            if score_img >= SIMILARITY_THRESHOLD:
                print(f'👍Image類似度クリア: {score_img:.4f}')
                combined_scores.append({
                    "filename": entry["filename"],
                    "slide_index": entry["slide_index"],
                    "summary": entry["image_text"],
                    "score": score_img,
                    "source": "image"
                })
        except Exception as e:
            print(f"⚠️ Image embedding error: {e}")
            continue

    top_results = sorted(combined_scores, key=lambda x: x["score"], reverse=True)[:k]
    return top_results

# pending #
def search_text_pptx_index(query: str, top_k: int = 5): #### 2025.8.6 Add（no use image）
    if not PPTX_INDEX_PATH.exists():
        raise FileNotFoundError("PPTXインデックスが存在しません。")

    with open(PPTX_INDEX_PATH, "r") as f:
        index = json.load(f)

    query_embedding = get_embedding(query)

    results = []
    for item in index:
        emb = item.get("embedding_text")
        if not emb:
            continue
        score = cosine_similarity(query_embedding, emb)
        results.append({
            "filename": item["filename"],
            "slide_index": item["slide_index"],
            "text": item["text"],
            "score": round(score, 4)
        })

    # スコアで降順ソートして上位K件返す
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
# pending #

def extract_themes_from_text(text: str, limit: int = 5) -> list[str]:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    #### 2025.8.1 Add（reduce api consumption）START
    theme_cache_dir = Path("theme_cache")
    theme_cache_dir.mkdir(exist_ok=True)

    th = text_hash(text)
    cache_file = theme_cache_dir / f"{th}.json"

    if cache_file.exists():
        with open(cache_file, "r") as f:
            themes = json.load(f).get("themes", [])
        print("📦 テーマキャッシュ使用")
        return themes[:limit]
    #### 2025.8.1 Add（reduce api consumption）END

    prompt = (
        "以下の文章全体のテーマを、簡潔な日本語のキーワードまたはフレーズで5つ挙げてください。\n\n"
        f"{text}\n\n"
        "テーマ一覧:\n1."
    )

    try:
        res = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=50,
            stop=["\n\n"]
        )
        raw_output = res.choices[0].message.content.strip()
        #### 2025.8.1 Add（reduce api consumption）START
        themes = parse_theme_list(raw_output, limit)

        with open(cache_file, "w") as f:
            json.dump({"themes": themes}, f, ensure_ascii=False)

        return themes
        #### 2025.8.1 Add（reduce api consumption）END
    except Exception as e:
        print(f"⚠️ OpenAIリクエスト失敗: {e}")
        return []

def parse_theme_list(text: str, limit: int = 5) -> list[str]:
    themes = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # 例: "1. テーマ" → "テーマ"
        if '.' in line:
            parts = line.split('.', 1)
            theme = parts[1].strip()
        else:
            theme = line
        themes.append(theme)
        if len(themes) >= limit:
            break
    return themes

# ----- 理由づけ作業 -----
def generate_ai_reason_comment(
    query: str,
    content: Optional[str] = None,
    top_results: Optional[List[dict]] = None,
    content_type: str = "summary"
) -> str:
    """
    クエリと検索結果に基づいて、AIによる関連性の理由コメントを生成する（キャッシュ対応版）。
    """
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    #### 2025.8.1 Mod（reduce api consumption）START
    cache_dir = Path("reason_cache")
    cache_dir.mkdir(exist_ok=True)

    # --- キャッシュキー作成
    if content_type == "summary" and content:
        key_source = f"{query}||{normalize_text(content)}"
    elif content_type == "slide" and top_results:
        key_source = query + "||" + "||".join(normalize_text(item["summary"]) for item in top_results)
    else:
        return "説明用の情報が不足しています。"

    cache_hash = text_hash(key_source)
    cache_file = cache_dir / f"{cache_hash}.txt"

    if cache_file.exists():
        with open(cache_file, "r") as f:
            print("📦 理由コメントキャッシュ利用")
            return f.read().strip()

    #### 2025.8.1 Mod（reduce api consumption）END
    # --- プロンプト生成
    if content_type == "summary":
        prompt = f"""ユーザーが「{query}」と検索しました。以下のサマリーが特に関連性が高いと考えられる理由を一言で説明してください。

サマリー:
{content}"""
    else:  # content_type == "slide"
        slide_samples = "\n".join(
            f"- {truncate(item['summary'])}" for item in top_results
        )
        prompt = f"""ユーザーが「{query}」と検索しました。以下のスライド情報との関連性が高いと判断された理由を要約してください。

スライド候補:
{slide_samples}

簡潔に一言で説明してください。
"""

    # --- GPT実行
    res = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    result = res.choices[0].message.content.strip()

    #### 2025.8.1 Add（reduce api consumption）START
    # --- キャッシュ保存
    with open(cache_file, "w") as f:
        f.write(result)
    #### 2025.8.1 Add（reduce api consumption）END

    return result

def truncate(text: str, max_chars: int = 300) -> str:
    return text[:max_chars] + "..." if len(text) > max_chars else text
#### 2025.7.30 Mod（pptx defs maintenance）END

#### 2025.8.4 Add（Resume）START
def extract_text_from_pdf_resume(file_path: str) -> str:
    doc = fitz.open(file_path)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text

def extract_text_from_docx_resume(file_path: str) -> str:
    return docx2txt.process(file_path)

def extract_text_from_xlsx_resume(file_path: str) -> str:
    try:
        dfs = pd.read_excel(file_path, sheet_name=None)
        text = ""
        for sheet_name, df in dfs.items():
            text += f"[{sheet_name}]\n"
            text += df.astype(str).to_string(index=False)
            text += "\n"
        return text
    except Exception as e:
        return f"Excel読み込みエラー: {str(e)}"

def extract_text_from_resume(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf_resume(file_path)
    elif ext == ".docx":
        return extract_text_from_docx_resume(file_path)
    elif ext in [".xls", ".xlsx"]:
        return extract_text_from_xlsx_resume(file_path)
    else:
        return "対応していないファイル形式です。"

def check_must_requirements_llm(content: str, common_path: Path) -> dict:
    with open(common_path, encoding='utf-8') as f:
        data = json.load(f)
    must_keywords = data.get("must_requirements", [])

    prompt = f"""
以下はある候補者の履歴書情報です：
---
{content}
---

以下のマスト条件を満たしているか、それぞれTrueまたはFalseで判定し、その根拠となる理由も併記してください。

条件: {', '.join(must_keywords)}

回答形式:
JSON形式で次のように返してください：
{{
  "大卒": {{"result": true, "reason": "東京大学卒業と明記されているため"}},
  "3年以上の職務経験": {{"result": true, "reason": "合計6年の職歴が記載されているため"}},
  ...
}}
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    try:
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        return {k: {"result": False, "reason": "判定失敗"} for k in must_keywords}

def load_division_profiles(skills_dir: Path) -> list:
    profiles = []
    for json_file in skills_dir.glob("*.json"):
        if json_file.name == "common.json":
            continue
        with open(json_file, encoding='utf-8') as f:
            data = json.load(f)
            profiles.append(data)
    return profiles

def load_division_names(skills_dir: Path) -> list[str]:
    divisions = []
    for json_file in skills_dir.glob("*.json"):
        if json_file.name == "common.json":
            continue
        with open(json_file, encoding="utf-8") as f:
            data = json.load(f)
            if "division" in data:
                divisions.append(data["division"])
    return divisions

def save_result_to_file(result: dict, candidate_id: str):
    out_path = RESULT_PATH / f"{candidate_id}_result.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

def score_resume(file_path: str, candidate_id: str) -> dict:
    content = extract_text_from_resume(file_path)
    common_path = SKILLS_PATH / "common.json"
    must_results = check_must_requirements_llm(content, common_path)

    if not all(item["result"] for item in must_results.values()):
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None
        }
        save_result_to_file(result, candidate_id)
        return result

    division_profiles = load_division_profiles(SKILLS_PATH)
    scores = []

    for profile in division_profiles:
        prompt = f"""
あなたは人事担当者です。
以下の履歴書情報を読み、部門「{profile['division']}」の人物像にどの程度合致するかを10点満点で評価してください。
理想の特徴: {', '.join(profile['desired_traits'])}

候補者の履歴書:
{content}

回答形式:
JSONで以下のように返してください：
{{"division": "{profile['division']}", "score": 数値, "reason": "理由"}}
"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )

        try:
            json_data = json.loads(response.choices[0].message.content)
            scores.append(json_data)
        except Exception as e:
            scores.append({
                "division": profile["division"],
                "score": 0,
                "reason": f"解析エラー: {str(e)}"
            })

    recommended = max(scores, key=lambda x: x["score"])

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended["division"]
    }
    save_result_to_file(result, candidate_id)
    return result

#### 2025.8.5 Add（resume review）START
def generate_score_review_prompt(messages: list[dict], valid_divisions: list[str]) -> list[dict]:
    system_prompt = {
        "role": "system",
        "content": (
            "あなたは人事のサポートAIで、候補者の部門別スコア評価の再検討を行います。\n\n"
            "以下の情報をもとに、候補者のスコアを再評価してください：\n"
            "- 対象部門一覧（スコア評価対象）: " + ", ".join(valid_divisions) + "\n"
            "- 各部門の現在スコアと理由（形式: 【部門】現在スコア: ◯点, 理由: ◯◯）\n"
            "- 人事担当者によるコメント（評価変更の意図が含まれることがあります）\n\n"
            "コメントをもとにスコアを変更すべきだと判断した場合は、以下の形式で出力してください：\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=◯, 理由=◯◯\n"
            "※ 部門は複数でも構いません。\n"
            "※ 「スコアを上げたい」「下げてほしい」などの指示がある場合はそれに従ってください。\n"
            "※ ただし、整合しない場合（例：Excelができると記載があるのに「スキル不足」と結論づけるなど）は避けてください。\n"
            "※ 点数を変更しない判断の場合でも、以下のように明示的に出力してください：\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=（変更なし）, 理由=（変更不要と判断した理由）"
        )
    }
    return [system_prompt] + messages[-5:]

def call_openai_chat(prompt: list[dict], model: str = "gpt-3.5-turbo") -> str:
    try:
        response = client.chat.completions.create(
            model=model,
            messages=prompt,
            temperature=0.3
        )
        # contentがNoneでもstrとして返すように防御
        return response.choices[0].message.content or ""
    except Exception as e:
        return f"AI応答に失敗しました: {str(e)}"

def parse_score_adjustments(
    reply: Optional[str],
    original_scores: dict,
    allow_nochange: bool = True,
) -> List[dict]:
    if not reply or not isinstance(reply, str):
        return []

    # 全角→半角などのゆれを吸収
    text = (reply.replace("，", ",")
                    .replace("：", ":")
                    .replace("．", "。")
                    .replace("　", " "))

    # 複数行対応。「変更なし」もパースできるように
    pattern = r"""
        \[スコア調整\]\s*:\s*
        部門\s*=\s*(.+?)\s*,\s*
        変更後スコア\s*=\s*(変更なし|-?\d+)\s*,\s*
        理由\s*=\s*(.+?)
        (?:[。．]?\s*(?:\r?\n|$))
    """
    matches = re.findall(pattern, text, flags=re.VERBOSE)

    results: List[dict] = []
    for division, score_str, reason in matches:
        division = division.strip()
        reason = reason.strip()

        # 「変更なし」は保存しない（履歴汚し防止）
        if allow_nochange and score_str.strip() == "変更なし":
            continue

        if not re.fullmatch(r"-?\d+", score_str.strip()):
            continue

        new_score = int(score_str)
        old_score = original_scores.get(division)

        # 実質変更なしはスキップ
        if old_score is not None and new_score == old_score:
            continue

        results.append({"division": division, "score": new_score, "reason": reason})

    return results

def extract_original_scores_from_message(text: str) -> dict:
    """
    「【部門名】現在スコア: X点, 理由: ...」という形式から部門ごとのスコアを抽出
    """
    results = {}
    lines = text.splitlines()
    for line in lines:
        match = re.match(r"【(.+?)】現在スコア: (\d+)点", line)
        if match:
            division = match.group(1).strip()
            score = int(match.group(2))
            results[division] = score
    return results

def load_single_result(candidate_id: str) -> Optional[dict]:
    path = RESULT_PATH / f"{candidate_id}_result.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save_result_with_timestamp(result: dict, candidate_id: str) -> str:
    """タイムスタンプ付きで保存し、ファイル名を返す"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = RESULT_PATH / f"{candidate_id}_{timestamp}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return out_path.name

def update_score_in_result(result: dict, division: str, new_score: int, new_reason: str,
                            second_reviewer: Optional[str] = None,
                            second_reviewed_at: Optional[str] = None) -> bool:
    for s in result.get("scores", []):
        if s["division"] == division:
            # 保存前に元の値を original_〜 に残す（なければ）
            if "original_score" not in s:
                s["original_score"] = s["score"]
            if "original_reason" not in s:
                s["original_reason"] = s["reason"]

            s["score"] = new_score
            s["reason"] = new_reason

            if second_reviewer:
                s["second_reviewer"] = second_reviewer
            if second_reviewed_at:
                s["second_reviewed_at"] = second_reviewed_at
            return True
    return False

def update_recommended_division_from_history(result: dict):
    history = result.get("score_history", {})
    latest_scores = []
    for division, records in history.items():
        if records:
            latest_scores.append({"division": division, "score": records[-1]["score"]})
    if latest_scores:
        recommended = max(latest_scores, key=lambda x: x["score"])
        result["recommended_division"] = recommended["division"]

def save_score_to_history(candidate_id: str, new_scores: List[dict], updated_by: str, source: str):
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    now = datetime.now().isoformat()

    # ✅ グローバルスコア履歴
    if "score_history" not in result:
        result["score_history"] = {}

    for new_score in new_scores:
        division = new_score["division"]
        entry = {
            "score": new_score["score"],
            "reason": new_score["reason"],
            "updated_by": updated_by,
            "updated_at": now,
            "source": source
        }

        # ✅ 全体の履歴
        result["score_history"].setdefault(division, []).append(entry)

        # ✅ scores[] にも反映
        for s in result.get("scores", []):
            if s.get("division") == division:
                s["score"] = new_score["score"]
                s["reason"] = new_score["reason"]
                # スコア履歴を反映（なければ初期化）
                if "score_history" not in s:
                    s["score_history"] = []
                s["score_history"].append({
                    "score": new_score["score"],
                    "reason": new_score["reason"],
                    "reviewer": updated_by,
                    "reviewed_at": now
                })

    # 推奨部門の更新
    update_recommended_division_from_history(result)

    save_result_to_file(result, candidate_id)
    return result
#### 2025.8.5 Add（resume review）END
#### 2025.8.4 Add（Resume）END

#### 2025.8.7 Add（interview modal）START
def load_interview_config() -> dict:
    """UI用：設定取得"""
    try:
        with open(TEMPLATE_INTERVIEWER_PATH, "r", encoding="utf-8") as f:
            interviewers = json.load(f)
        with open(TEMPLATE_TODO_PATH, "r", encoding="utf-8") as f:
            todos = json.load(f)
        with open(TEMPLATE_EMAIL_INTERVIEWER_PATH, "r", encoding="utf-8") as f:
            template_interviewer = json.load(f)
        with open(TEMPLATE_EMAIL_CANDIDATE_PATH, "r", encoding="utf-8") as f:
            template_candidate = json.load(f)

        return {
            "interviewers": interviewers,
            "todos": todos,
            "email_templates": {
                "to_interviewer": template_interviewer,
                "to_candidate": template_candidate
            }
        }

    except Exception as e:
        raise RuntimeError(f"設定ファイルの読み込みに失敗: {str(e)}")

def send_interview_emails(req: InterviewSetupRequest):
    send_email({
        "to": req.interviewer,
        "subject": "【面談のご案内】",
        "body": req.interviewerMail
    })

    send_email({
        "to": req.candidate,
        "subject": "【面談のご案内】",
        "body": req.candidateMail
    })

def send_email(email: dict):
    """
    email = {
        "to": "example@example.com",
        "subject": "件名",
        "body": "本文"
    }
    """
    print(f"📧 Sending email to: {email['to']}")
    print(f"📨 Subject: {email['subject']}")
    print(f"📝 Body:\n{email['body']}")
    # 実際の送信処理（SMTPなど）はここに追加

def save_interview_schedule(req: InterviewSetupRequest) -> dict:
    key_map = {
        "面談・1次": "interview_1_date",
        "面談・2次": "interview_2_date",
        "最終面談": "interview_final_date"
    }

    interview_key = key_map.get(req.stage, "interview_date_other")
    data_path = os.path.join(INTERVIEWDATE_EACH_CANDIDATE_PATH, f"{req.candidate}.json")

    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = {}

    existing[interview_key] = req.interviewDate
    existing["last_updated"] = datetime.now().isoformat()

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return {
        "saved_stage": req.stage,
        "saved_date": req.interviewDate
    }
#### 2025.8.7 Add（interview modal）END

#### 2025.8.13 Add（interview sheet）START
def get_divisions(result: dict) -> List[str]:
    return [s.get("division") for s in result.get("scores", []) if s.get("division")]

def _shape_block(raw: Dict[str, Any], stage: str) -> Dict[str, Any]:
    stages = (raw.get("stages") or {})
    block = stages.get(stage) or {}
    return {
        "prepItems": block.get("prepItems", []),
        "reviewedResume": bool(block.get("reviewedResume", False)),
        "qualitative": block.get("qualitative") or {},
        "quantitative": block.get("quantitative") or {},
        "updated_at": block.get("updated_at"),
    }

async def get_checksheet_one_async(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    base: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    interviewer_checksheet_files/<iid>/<cid>.json から該当 stage ブロックだけ返す（非同期I/O版）
    返り値: { prepItems, reviewedResume, qualitative, quantitative, updated_at } or {}
    例外:
        - FileNotFoundError: ファイルが無い
        - ValueError: 入力不正
        - RuntimeError: JSON読込に失敗
    """
    if not interviewer_id or not candidate_id or not stage:
        raise ValueError("interviewer_id, candidate_id, stage は必須です")

    base = base or INTERVIEWER_CHECKSHEET_PATH
    fp = (base / interviewer_id / f"{candidate_id}.json")

    if not fp.exists():
        # exists() 自体は同期だが軽い stat。必要なら anyio.to_thread に逃がせる
        raise FileNotFoundError(str(fp))

    try:
        # テキストではなく bytes を読み、orjson.loads で高速デコード
        async with aiofiles.open(fp, "rb") as f:
            data_bytes = await f.read()
        doc = orjson.loads(data_bytes) if data_bytes else {}
    except FileNotFoundError:
        raise
    except Exception as e:
        # デコード失敗や I/O エラーをまとめて RuntimeError に
        raise RuntimeError(f"JSON read failed: {e}")

    return _shape_block(doc, stage)

def list_checksheet_by_interviewer(interviewer_id: str) -> Dict[str, Dict[str, Any]]:
    """
    指定面接官の配下にある全候補者ファイルを {candidate_id: doc} で返す。
    """
    base = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    if not base.exists():
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for jf in base.glob("*.json"):
        try:
            with open(jf, encoding="utf-8") as f:
                doc = json.load(f)
            cid = doc.get("candidate_id") or jf.stem
            out[cid] = doc
        except Exception as e:
            print("読み込み失敗:", jf, e)
    return out
#### 2025.8.13 Add（interview sheet）END

#### 2025.8.12 Add（candidate score update after interview）START
def review_with_interview_checksheet(
    candidate_id: str,
    reviewer_id: str,     # = interviewer_id
    stage: str,
    prep_items: List[dict],
    reviewed_resume: bool = False,
    qualitative: dict | None = None,
    quantitative: dict | None = None,
) -> dict:
    """
    面談シートを考慮してスコアを再評価し、履歴も更新。
    さらに面談シートそのものを interviewer_checksheet_files に保存（新レイアウト）。
    """
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # 部門候補と現在スコア
    division_profiles = load_division_profiles(SKILLS_PATH)
    valid_divisions = [p["division"] for p in division_profiles]
    current_map = {s["division"]: s.get("score", 0) for s in result.get("scores", [])}

    # 🔹 プロンプト生成に定性・定量を追加
    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=valid_divisions,
        current_scores=current_map,
        qualitative=qualitative or {},
        quantitative=quantitative or {},
    )
    reply = call_openai_chat(prompt)

    # スコア調整
    adjustments = parse_score_adjustments(reply, current_map, allow_nochange=True)
    if adjustments:
        result = save_score_to_history(
            candidate_id=candidate_id,
            new_scores=adjustments,
            updated_by=reviewer_id,
            source="interview_review",
        )

    # 🔹 ステージ別フラグ・タイムスタンプ
    now_str = datetime.now().isoformat()
    result[f"{stage}_reviewed_resume"] = reviewed_resume
    result[f"chat_review_{stage}_at"] = now_str
    result[f"chat_reviewer_{stage}"] = reviewer_id
    result["updated_by"] = reviewer_id
    result["updated_at"] = now_str
    save_result_to_file(result, candidate_id)

    now_str = datetime.now().isoformat()
    # 既存ブロックを取得
    try:
        existing_block = get_checksheet_one(reviewer_id, candidate_id, stage) or {}
    except Exception:
        existing_block = {}

    incoming_block = {
        "prepItems": prep_items,
        "reviewedResume": reviewed_resume,
        "qualitative": qualitative or {},
        "quantitative": quantitative or {},
    }

    # ← ここで壊さずマージ
    merged_block = merge_block(existing_block, incoming_block)
    merged_block["updated_at"] = now_str

    upsert_checksheets_block(
        interviewer_id=reviewer_id,
        candidate_id=candidate_id,
        stage=stage,
        block=merged_block,
    )

    return result

def _shape_block(raw: Dict[str, Any], stage: str) -> Dict[str, Any]:
    stages = (raw.get("stages") or {})
    block = stages.get(stage) or {}
    return {
        "prepItems": block.get("prepItems", []),
        "reviewedResume": bool(block.get("reviewedResume", False)),
        "qualitative": block.get("qualitative") or {},
        "quantitative": block.get("quantitative") or {},
        "updated_at": block.get("updated_at"),
    }

async def get_checksheet_one_async(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    base: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    interviewer_checksheet_files/<iid>/<cid>.json から該当 stage ブロックだけ返す（非同期I/O版）
    返り値: { prepItems, reviewedResume, qualitative, quantitative, updated_at } or {}
    例外:
        - FileNotFoundError: ファイルが無い
        - ValueError: 入力不正
        - RuntimeError: JSON読込に失敗
    """
    if not interviewer_id or not candidate_id or not stage:
        raise ValueError("interviewer_id, candidate_id, stage は必須です")

    base = base or INTERVIEWER_CHECKSHEET_PATH
    fp = (base / interviewer_id / f"{candidate_id}.json")

    if not fp.exists():
        # exists() 自体は同期だが軽い stat。必要なら anyio.to_thread に逃がせる
        raise FileNotFoundError(str(fp))

    try:
        # テキストではなく bytes を読み、orjson.loads で高速デコード
        async with aiofiles.open(fp, "rb") as f:
            data_bytes = await f.read()
        doc = orjson.loads(data_bytes) if data_bytes else {}
    except FileNotFoundError:
        raise
    except Exception as e:
        # デコード失敗や I/O エラーをまとめて RuntimeError に
        raise RuntimeError(f"JSON read failed: {e}")

    return _shape_block(doc, stage)

def get_checksheet_one(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    base: Path | None = None,
) -> Dict[str, Any]:
    """
    interviewer_checksheet_files/<iid>/<cid>.json から該当 stage ブロックだけ返す。
    返り値: { prepItems, reviewedResume, qualitative, quantitative, updated_at } or {}
    例外:
        - FileNotFoundError: ファイルが無い
        - ValueError: 入力不正
        - RuntimeError: JSON読込に失敗
    """
    if not interviewer_id or not candidate_id or not stage:
        raise ValueError("interviewer_id, candidate_id, stage は必須です")

    base = base or INTERVIEWER_CHECKSHEET_PATH
    fp = (base / interviewer_id / f"{candidate_id}.json")

    if not fp.exists():
        raise FileNotFoundError(str(fp))

    try:
        with fp.open(encoding="utf-8") as f:
            doc = json.load(f) or {}
    except Exception as e:
        raise RuntimeError(f"JSON read failed: {e}")

    block = (doc.get("stages") or {}).get(stage) or {}
    # 最小セットで整形
    return {
        "prepItems": block.get("prepItems", []),
        "reviewedResume": bool(block.get("reviewedResume", False)),
        "qualitative": block.get("qualitative") or {},
        "quantitative": block.get("quantitative") or {},
        "updated_at": block.get("updated_at"),
    }

def get_current_scores_map(result: dict) -> Dict[str, int]:
    """
    いまの表示スコアを部門→点数で返す。
    scores[].score_history があれば最後、なければ scores[].score を使う。
    """
    cur: Dict[str, int] = {}
    for s in result.get("scores", []):
        hist = s.get("score_history")
        if isinstance(hist, list) and hist:
            # ※ history が時系列で末尾が最新という前提
            cur[s["division"]] = int(hist[-1]["score"])
        else:
            cur[s["division"]] = int(s.get("score", 0))
    return cur

def generate_interview_review_prompt(
    *,
    prep_items: List[dict],
    valid_divisions: List[str],
    current_scores: Dict[str, int],
    qualitative: Dict[str, Any] | None = None,
    quantitative: Dict[str, Any] | None = None,
) -> List[dict]:
    """
    面談Q&A（prep_items）に加えて、定性(qualitative)・定量(quantitative)も渡して
    スコア再評価用の messages を作る。
    """
    qualitative = qualitative or {}
    quantitative = quantitative or {}

    system = {
        "role": "system",
        "content": (
            "あなたは人事のサポートAIです。以下の面談Q&Aと評価メモを踏まえて、"
            "【列挙された全ての部門】について、再評価が必要かを必ず部門ごとに1行ずつ出力してください。\n"
            "出力は次の形式のみ（他の文章・前置き・後置きは禁止）：\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=◯ または 変更なし, 理由=◯◯\n"
            "※ 全部門ぶんを必ず出力（変更なしの場合も1行）\n"
            "※ 改行で部門ごとに区切る\n"
        )
    }

    # --- QA（prep_items） ---
    qa_lines: List[str] = []
    for i, it in enumerate(prep_items or [], 1):
        q = (it.get("question") or "").strip()
        a = (it.get("answer") or "").strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")

    qa_block = "\n\n".join(qa_lines) if qa_lines else "（メモなし）"

    # --- Qualitative（定性） ---
    qual_keys = [
        "hiringDecision", "recommendedTitle", "recommendedDivision",
        "careerGoals", "otherApps", "overall", "assignmentPlan",
    ]
    qual_lines: List[str] = []
    for k in qual_keys:
        v = qualitative.get(k)
        if v:
            qual_lines.append(f"- {k}: {v}")
    qual_block = "\n".join(qual_lines) if qual_lines else "（記載なし）"

    # --- Quantitative（定量 1-5 + コメント） ---
    quant_lines: List[str] = []
    for k, v in quantitative.items():
        if isinstance(v, dict):
            lv = v.get("level")
            cm = v.get("comment", "")
            if lv or cm:
                quant_lines.append(f"- {k}: level={lv}, comment={cm}")
    quant_block = "\n".join(quant_lines) if quant_lines else "（記載なし）"

    # --- 現在スコアを並べる ---
    current_scores_lines = "\n".join(
        f"- {d}: {current_scores.get(d, 0)}点" for d in valid_divisions
    )

    user = {
        "role": "user",
        "content": (
            "■評価対象部門（全て出力対象）: " + ", ".join(valid_divisions) + "\n"
            "■現在スコア:\n" + current_scores_lines + "\n\n"
            "■面談メモ(Q&A):\n" + qa_block + "\n\n"
            "■定性メモ:\n" + qual_block + "\n\n"
            "■定量メモ(1-5 + コメント):\n" + quant_block
        )
    }
    return [system, user]

#### 2025.8.13 Add（interview sheet）START
def upsert_checksheet(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    payload: dict,
) -> bool:
    """interviewer_checksheet_files/<iid>/<cid>.json をステージ単位で upsert"""
    base: Path = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    base.mkdir(parents=True, exist_ok=True)
    fp = base / f"{candidate_id}.json"

    doc = {}
    if fp.exists():
        try:
            with open(fp, encoding="utf-8") as f:
                doc = json.load(f)
        except Exception:
            doc = {}

    # ルート情報を補完
    doc.setdefault("interviewer_id", interviewer_id)
    doc.setdefault("candidate_id", candidate_id)
    stages = doc.setdefault("stages", {})

    # ステージの中身を上書き/追記
    block = stages.get(stage, {})
    block.update({
        "prepItems": payload.get("prepItems", []),
        "reviewedResume": bool(payload.get("reviewedResume", False)),
        "qualitative": payload.get("qualitative") or {},
        "quantitative": payload.get("quantitative") or {},
        "updated_at": datetime.now().isoformat(),
    })
    stages[stage] = block

    # アトミックに保存
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(base))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp_path, fp)
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except Exception: pass

    return True

def upsert_checksheets_block(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    block: dict,                              # {prepItems, reviewedResume, qualitative, quantitative, updated_at, ...}
) -> None:
    """
    interviewer_checksheet_files/<interviewer_id>/<candidate_id>.json に
    stages[stage] を upsert（他ステージは保持）
    """
    base = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    base.mkdir(parents=True, exist_ok=True)
    jf = base / f"{candidate_id}.json"

    doc = {}
    if jf.exists():
        try:
            with open(jf, encoding="utf-8") as f:
                doc = json.load(f)
        except Exception:
            doc = {}

    # メタは上書き補完
    doc.setdefault("interviewer_id", interviewer_id)
    doc.setdefault("candidate_id", candidate_id)
    stages = doc.setdefault("stages", {})

    stages[stage] = {**(stages.get(stage) or {}), **block}

    with open(jf, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

def merge_quant(old: dict, new: dict) -> dict:
    """
    quantitative をマージ。level/comment が new にあれば優先、なければ old を保持。
    """
    old = old or {}
    new = new or {}
    out = dict(old)
    for key, nv in new.items():
        if not isinstance(nv, dict):
            continue
        ov = old.get(key, {}) if isinstance(old.get(key), dict) else {}
        out[key] = {
            "level": nv.get("level", ov.get("level", 0)),
            "comment": nv.get("comment", ov.get("comment", "")),
        }
    return out

def merge_block(existing: dict, incoming: dict) -> dict:
    """
    prepItems / reviewedResume / qualitative / quantitative を壊さずマージ。
    incoming が「空/None」の場合は existing を残す。
    """
    existing = existing or {}
    incoming = incoming or {}

    # prepItems（空配列なら保持）
    prep = incoming.get("prepItems")
    if isinstance(prep, list) and len(prep) > 0:
        prepItems = prep
    else:
        prepItems = existing.get("prepItems", [])

    # reviewedResume（bool はそのまま。未指定(None)なら既存）
    if "reviewedResume" in incoming:
        reviewedResume = bool(incoming.get("reviewedResume"))
    else:
        reviewedResume = bool(existing.get("reviewedResume", False))

    # qualitative（シャローに new 優先でマージ。ただし new が None/{} なら既存）
    ql_new = incoming.get("qualitative")
    if isinstance(ql_new, dict) and ql_new:
        qualitative = {**(existing.get("qualitative") or {}), **ql_new}
    else:
        qualitative = existing.get("qualitative", {})

    # quantitative（キーごとに level/comment をマージ）
    qt_new = incoming.get("quantitative")
    if isinstance(qt_new, dict) and qt_new:
        quantitative = merge_quant(existing.get("quantitative") or {}, qt_new)
    else:
        quantitative = existing.get("quantitative", {})

    return {
        "prepItems": prepItems,
        "reviewedResume": reviewedResume,
        "qualitative": qualitative,
        "quantitative": quantitative,
    }
#### 2025.8.13 Add（interview sheet）END
#### 2025.8.12 Add（candidate score update after interview）END

#### 2025.8.12 Add（interviewer score after interview）START
# ① 取得系ヘルパー
def get_resume_or_empty(candidate_id: str) -> dict:
    """候補者の最新結果を取得。なければ空dict。"""
    return load_single_result(candidate_id) or {}

def load_prep_map_with_owner() -> Dict[str, Dict[str, List[dict]]]:
    """
    新構成のみ対応:
        interviewer_checksheet_files/<interviewer_id>/<candidate_id>.json

        返り値の正規化フォーマット:
        { candidate_id: { stage: [ { ...面談ブロック..., "interviewer_id": <iid> }, ... ] } }

        各ファイルの推奨スキーマ:
        {
        "interviewer_id": "user123",        # 省略可（無ければディレクトリ名で補完）
        "candidate_id": "cand_xxx",         # 省略可（無ければファイル名で補完）
        "stages": {
            "面談・1次": {
            "prepItems": [...],
            "reviewedResume": true,
            "qualitative": {...},
            "quantitative": {...},
            "updated_at": "ISO8601"
            },
            ...
        }
    }
    """
    merged: Dict[str, Dict[str, List[dict]]] = {}
    base: Path = INTERVIEWER_CHECKSHEET_PATH
    if not base.exists():
        return merged

    for iid_dir in base.glob("*"):
        if not iid_dir.is_dir():
            continue
        iid = iid_dir.name

        for jf in iid_dir.glob("*.json"):
            try:
                with open(jf, encoding="utf-8") as f:
                    doc = json.load(f)
            except Exception as e:
                print("読み込み失敗:", jf, e)
                continue

            cid = (doc.get("candidate_id") or jf.stem)
            interviewer_id = (doc.get("interviewer_id") or iid)
            stages = doc.get("stages") or {}

            stage_map = merged.setdefault(cid, {})
            for stage, block in (stages or {}).items():
                enriched = {**(block or {}), "interviewer_id": interviewer_id}
                stage_map.setdefault(stage, []).append(enriched)

    return merged

def pick_qa_block_for(
    prep_map: Dict[str, Dict[str, List[dict]]],
    candidate_id: str,
    stage: str,
    interviewer_id: Optional[str]
) -> dict:
    """
    候補者×ステージのQAを1件選ぶ。
    interviewer_id があればその人のものを優先、なければ先頭。
    見つからなければ空dict。
    """
    blocks = (prep_map.get(candidate_id, {}).get(stage, []) or [])
    if interviewer_id:
        for b in blocks:
            if b.get("interviewer_id") == interviewer_id:
                return b
    return blocks[0] if blocks else {}

def load_interviewer_skills(path: Path = INTERVIEWER_SKILLS_PATH) -> dict:
    """面談者評価のルーブリック(JSON)を読み込み"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def iter_all_prep(prep_map: Dict[str, Dict[str, List[dict]]]
                    ) -> Iterable[tuple[str, str, dict]]:
    """prep_map を (candidate_id, stage, qa_block) の列挙にフラット化"""
    for cid, stages in (prep_map or {}).items():
        for stage, blocks in (stages or {}).items():
            for b in (blocks or []):
                yield cid, stage, b

def _row_key(cid: str, iid: str, stage: str) -> str:
    return f"{cid}::{stage}::{iid}"

def _cache_file_for(iid: str) -> Path:
    INTERVIEWER_EVALS_PATH.mkdir(parents=True, exist_ok=True)
    safe = iid.replace("/", "_")
    return INTERVIEWER_EVALS_PATH / f"{safe}.json"

def _empty_cache(iid: str | None = None) -> dict:
    return {"version": "1", "generated_at": None, "interviewer_id": iid, "rows": []}

def load_evals_cache_for(iid: str) -> dict:
    p = _cache_file_for(iid)
    if not p.exists():
        return _empty_cache(iid)
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        # 古い形式のファイルでも rows だけあれば救う
        if "interviewer_id" not in data:
            data["interviewer_id"] = iid
        return data
    except Exception:
        # 破損は退避して空を返す
        try:
            p.rename(p.with_suffix(p.suffix + f".bak.{int(time.time())}"))
        except Exception:
            pass
        return _empty_cache(iid)

def save_evals_cache_for(iid: str, cache: dict) -> None:
    p = _cache_file_for(iid)
    cache = {**cache, "version": "1", "interviewer_id": iid, "generated_at": datetime.now().isoformat()}
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(INTERVIEWER_EVALS_PATH))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp_path, p)
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except Exception: pass

def iter_cache_files() -> Iterable[Path]:
    if not INTERVIEWER_EVALS_PATH.exists():
        return []
    return INTERVIEWER_EVALS_PATH.glob("*.json")

def load_evals_cache_aggregate() -> dict:
    """全ファイルを合算（閲覧用途）。"""
    rows, latest = [], None
    for fp in iter_cache_files():
        try:
            with open(fp, encoding="utf-8") as f:
                d = json.load(f)
            rows.extend(d.get("rows") or [])
            ga = d.get("generated_at")
            if ga and (latest is None or ga > latest):
                latest = ga
        except Exception:
            continue
    return {"version": "1", "generated_at": latest, "rows": rows}

def index_rows(rows: list[dict]) -> dict[str, dict]:
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

def calc_source_sig(
    cid: str, stage: str, qa_block: dict, resume: dict, rubric: dict
) -> str:
    payload = {
        "cid": cid,
        "stage": stage,
        "qa_updated_at": qa_block.get("updated_at"),
        "qa_items": qa_block.get("prepItems", []),

        # 🔽 追加（定性・定量も差分対象に）
        "qa_qualitative": qa_block.get("qualitative", {}),
        "qa_quantitative": qa_block.get("quantitative", {}),

        "resume_updated_at": (resume or {}).get("updated_at"),
        "resume_scores": (resume or {}).get("scores", []),
        "rubric_version": rubric.get("version"),
    }
    j = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return sha1(j.encode("utf-8")).hexdigest()

def default_interviewer_rubric() -> dict:
    """ファイルが無い/壊れている場合のデフォルト."""
    return {
        "version": "default",
        "max_score": 10,
        "criteria": [
            {"key": "prep",           "label": "事前準備",     "weight": 0.25, "guidance": ""},
            {"key": "coverage",       "label": "論点網羅",     "weight": 0.20, "guidance": ""},
            {"key": "depth",          "label": "深掘り",       "weight": 0.20, "guidance": ""},
            {"key": "evidence",       "label": "エビデンス活用","weight": 0.20, "guidance": ""},
            {"key": "professionalism","label": "プロ意識",     "weight": 0.15, "guidance": ""},
        ],
    }

def read_interviewer_rubric_file(path: Path = INTERVIEWER_SKILLS_PATH) -> dict:
    """ルーブリックJSONをそのまま読む（存在しなければ例外）。"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def make_rubric_etag(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return sha1(body).hexdigest()[:16]

# ② 評価ロジック（計算・生成）
def compute_weighted_total(rubric: dict, criteria: List[dict]) -> int:
    """criteria のスコアを rubric.weight で合成して 0-10 に丸める"""
    weights = {c["key"]: float(c.get("weight", 0)) for c in rubric.get("criteria", [])}
    acc, wsum = 0.0, 0.0
    for c in criteria or []:
        w = weights.get(c.get("key"), 0.0)
        acc += float(c.get("score", 0)) * w
        wsum += w
    return int(max(0, min(10, round(acc / wsum)))) if wsum > 0 else 0

def normalize_interviewer_eval_output(
    raw_json: dict,
    rubric: dict,
    interviewer_id: str,
    candidate_id: str,
    stage: str
) -> dict:
    """
    LLMの出力(JSON)をAPIレスポンス形に正規化。
    ・重み合成をサーバで最終確定
    ・rubricのlabel付け
    """
    criteria = raw_json.get("criteria", [])
    total = compute_weighted_total(rubric, criteria)

    labeled = []
    label_map = {c["key"]: c["label"] for c in rubric.get("criteria", [])}
    for c in criteria:
        labeled.append({
            "key": c.get("key"),
            "label": label_map.get(c.get("key"), c.get("key")),
            "score": c.get("score", 0),
            "note": c.get("note")
        })

    return {
        "score": total,
        "reasons": raw_json.get("reasons", []),
        "suggestions": raw_json.get("suggestions", []),
        "rubric": labeled,
        "evaluated_at": datetime.now().isoformat(),
        "evaluated_by": interviewer_id,
        "candidate_id": candidate_id,
        "stage": stage,
    }

def build_interviewer_eval_prompt(
    interviewer_id: str,
    stage: str,
    resume_result: dict,
    qa_block: dict,
    rubric: dict
) -> list[dict]:
    """面談QA + 直前スコア + ルーブリックから評価用プロンプトを生成"""
    # QA整形
    items = (qa_block or {}).get("prepItems", [])
    qa_lines = []
    for i, it in enumerate(items, 1):
        q = (it.get("question") or "").strip()
        a = (it.get("answer") or "").strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")
    qa_text = "\n\n".join(qa_lines) if qa_lines else "（面談QAの記録なし）"

    # 🔽 定性/定量を追記
    qual = qa_block.get("qualitative") or {}
    qual_lines = []
    for k in ("careerGoals", "otherApps", "overall", "assignmentPlan"):
        v = (qual.get(k) or "").strip()
        if v: qual_lines.append(f"- {k}: {v}")
    qual_text = "\n".join(qual_lines) if qual_lines else "（定性メモなし）"

    quant = qa_block.get("quantitative") or {}
    q_rows = []
    for k, row in (quant.items() if isinstance(quant, dict) else []):
        lv = row.get("level")
        cm = (row.get("comment") or "").strip()
        if lv or cm:
            q_rows.append(f"- {k}: Lv{lv or 0} / {cm}")
    quant_text = "\n".join(q_rows) if q_rows else "（定量メモなし）"

    # 直前スコア（部門別）
    scores = resume_result.get("scores", [])
    score_lines = [f"- {s.get('division')}: {s.get('score')}点（理由: {s.get('reason','')}）" for s in scores]
    scores_text = "\n".join(score_lines) if score_lines else "（スコアなし）"

    # ルーブリック説明
    crit_lines = []
    for c in rubric.get("criteria", []):
        crit_lines.append(f"- {c['label']}({c['key']}): 重み {c['weight']} → {c['guidance']}")

    system = {
        "role": "system",
        "content": (
            "あなたは採用プロセスの監査官です。"
            "面談者が面談前の準備と適切な質問設計で候補者を適正評価できているかを採点します。"
        )
    }
    user = {
        "role": "user",
        "content": (
            f"【評価対象面談者】{interviewer_id}\n"
            f"【ステージ】{stage}\n\n"
            "■ 候補者の直前スコア\n"
            f"{scores_text}\n\n"
            "■ 面談QA（質問と回答）\n"
            f"{qa_text}\n\n"
            "■ 定性メモ\n"
            f"{qual_text}\n\n"
            "■ 定量メモ（各項目のレベルと根拠）\n"
            f"{quant_text}\n\n"
            "■ 評価ルーブリック\n" + "\n".join(crit_lines) + "\n\n"
            "出力は必ずJSONで、次の形式：\n"
            "{\n"
            '  "score": 0-10 の整数,\n'
            '  "criteria": [{"key":"prep","score":0-10,"note":"..."}, ...],\n'
            '  "reasons": ["...","..."],\n'
            '  "suggestions": ["...","..."]\n'
            "}\n"
            "総合scoreは各criteriaのscoreを重みで合成し四捨五入（0-10）。"
        )
    }
    return [system, user]

def eval_interviewer_once(
    interviewer_id: str,
    stage: str,
    resume_result: dict,
    qa_block: dict,
    rubric: dict,
    model: str = "gpt-4"
) -> dict:
    """LLMで面談者を1名分採点し、重みで総合点を補正"""
    prompt = build_interviewer_eval_prompt(interviewer_id, stage, resume_result, qa_block, rubric)
    raw = call_openai_chat(prompt, model=model)  # 既存のOpenAI呼び出しを再利用

    try:
        data = json.loads(raw)
    except Exception:
        data = {"score": 0, "criteria": [], "reasons": [f"解析失敗: {raw[:200]}"], "suggestions": []}

    # LLMの合成がズレてもサーバー側で重み合成し直す
    weights = {c["key"]: float(c["weight"]) for c in rubric.get("criteria", [])}
    acc = 0.0
    wsum = 0.0
    for c in data.get("criteria", []):
        k = c.get("key")
        s = float(c.get("score", 0))
        w = weights.get(k, 0.0)
        acc += s * w
        wsum += w
    if wsum > 0:
        total = round(acc / wsum)
        data["score"] = int(max(0, min(10, total)))

    return data

def to_row_from_llm_json(
    cid: str, iid: str, stg: str, raw_json: dict, rubric: dict, source_sig: str
) -> dict:
    total = compute_weighted_total(rubric, raw_json.get("criteria", []))
    breakdown = {c.get("key"): c.get("score", 0) for c in raw_json.get("criteria", [])}
    return {
        "candidate_id": cid,
        "interviewer_id": iid,
        "stage": stg,
        "total": total,
        "breakdown": breakdown,
        "reasons": raw_json.get("reasons", []),
        "evaluated_at": datetime.now().isoformat(),
        "source_sig": source_sig,   # ← 材料のスナップショット署名
    }

def normalize_rubric(raw: dict) -> dict:
    """
    形と値を整える:
    - version / max_score の補完
    - criteria を正規化（欠損/型違い除外、weightの範囲クリップ）
    - 重み合計が0なら等分に再配分
    """
    if not isinstance(raw, dict):
        raw = {}

    version = str(raw.get("version") or "unknown")
    max_score = int(raw.get("max_score") or 10)

    crits = raw.get("criteria") or []
    norm = []
    for c in crits:
        if not isinstance(c, dict):
            continue
        key = str(c.get("key") or "").strip()
        label = str(c.get("label") or key or "").strip()
        if not key or not label:
            continue
        try:
            w = float(c.get("weight", 0.0))
        except Exception:
            w = 0.0
        w = max(0.0, min(1.0, w))
        norm.append({
            "key": key,
            "label": label,
            "weight": w,
            "guidance": c.get("guidance") or "",
        })

    # 重み合計が0なら等分
    wsum = sum(c["weight"] for c in norm)
    if norm and wsum == 0:
        eq = 1.0 / len(norm)
        for c in norm:
            c["weight"] = eq

    return {"version": version, "max_score": max_score, "criteria": norm}

# ③ 評価サービス（アプリケーション層）
def evaluate_interviewer_single(
    candidate_id: str,
    interviewer_id: str,
    stage: str,
    resume_result: Optional[dict] = None,
    qa_block: Optional[dict] = None,
    model: str = "gpt-4",
) -> dict:
    """
    面談者1名×1ステージの評価を完結させるサービス関数。
    入力が無ければ自動で取りに行く。
    """
    resume = resume_result or get_resume_or_empty(candidate_id)
    if qa_block is None:
        prep_map = load_prep_map_with_owner()
        qa_block = pick_qa_block_for(prep_map, candidate_id, stage, interviewer_id)

    rubric = load_interviewer_skills(INTERVIEWER_SKILLS_PATH)
    raw = eval_interviewer_once(interviewer_id, stage, resume, qa_block, rubric, model=model)

    # LLMが壊れても最低限の形に
    if not isinstance(raw, dict):
        try:
            raw = json.loads(raw)  # 念のため
        except Exception:
            raw = {"score": 0, "criteria": [], "reasons": ["LLM出力の解析に失敗"], "suggestions": []}

    return normalize_interviewer_eval_output(raw, rubric, interviewer_id, candidate_id, stage)

def list_diff_targets(stage: str|None=None, q: str|None=None, limit: int|None=None) -> dict:
    prep_map = load_prep_map_with_owner()
    rubric = load_interviewer_skills(INTERVIEWER_SKILLS_PATH)

    # すべての shard を合算して index
    agg = load_evals_cache_aggregate()
    idx = index_rows(agg.get("rows") or [])

    resume_cache: dict[str, dict] = {}
    missing, stale = [], []
    needle = (q or "").strip().lower()

    for cid, stg, block in iter_all_prep(prep_map):
        if stage and stg != stage:
            continue
        iid = block.get("interviewer_id", "unknown")
        if needle and (needle not in iid.lower() and needle not in cid.lower()):
            continue

        if cid not in resume_cache:
            resume_cache[cid] = get_resume_or_empty(cid)
        resume = resume_cache[cid]

        sig = calc_source_sig(cid, stg, block, resume, rubric)
        k = _row_key(cid, iid, stg)
        cached = idx.get(k)

        if not cached:
            missing.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})
        elif cached.get("source_sig") != sig:
            stale.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})

        if limit and (len(missing) + len(stale)) >= limit:
            break

    return {"missing": missing, "stale": stale}

def refresh_targets_and_upsert(targets: list[dict]) -> list[dict]:
    if not targets: return []

    rubric = load_interviewer_skills(INTERVIEWER_SKILLS_PATH)
    prep_map = load_prep_map_with_owner()
    resume_cache: dict[str, dict] = {}

    # 面談者ごとに束ねて1ファイルずつ更新
    by_iid: dict[str, list[dict]] = {}
    for t in targets:
        by_iid.setdefault(t["interviewer_id"], []).append(t)

    updated_rows: list[dict] = []

    for iid, iid_targets in by_iid.items():
        cache = load_evals_cache_for(iid)
        idx = index_rows(cache.get("rows") or [])

        for t in iid_targets:
            cid, stg = t["candidate_id"], t["stage"]
            if cid not in resume_cache:
                resume_cache[cid] = get_resume_or_empty(cid)
            resume = resume_cache[cid]

            blocks = (prep_map.get(cid, {}).get(stg, []) or [])
            qa_block = next((b for b in blocks if b.get("interviewer_id") == iid),
                            (blocks[0] if blocks else {}))

            sig = calc_source_sig(cid, stg, qa_block, resume, rubric)
            raw = eval_interviewer_once(iid, stg, resume, qa_block, rubric)
            if not isinstance(raw, dict):
                try: raw = json.loads(raw)
                except Exception:
                    raw = {"score": 0, "criteria": [], "reasons": ["LLM出力の解析に失敗"], "suggestions": []}

            row = to_row_from_llm_json(cid, iid, stg, raw, rubric, sig)
            idx[_row_key(cid, iid, stg)] = row
            updated_rows.append(row)

        # idx → rows に戻してこの面談者ファイルにだけ保存
        rows = list(idx.values())
        rows.sort(key=lambda r: (r["stage"], r["interviewer_id"], r["candidate_id"]))
        save_evals_cache_for(iid, {"rows": rows})

    return updated_rows

def get_interviewer_rubric_or_default(path: Path = INTERVIEWER_SKILLS_PATH) -> dict:
    """
    ファイル → 正規化。失敗時はデフォルト → 正規化。
    UIがそのまま使える形を保証して返す。
    """
    try:
        raw = read_interviewer_rubric_file(path)
    except FileNotFoundError:
        raw = default_interviewer_rubric()
    except Exception:
        # 破損等は安全側でデフォルト
        raw = default_interviewer_rubric()
    return normalize_rubric(raw)

def load_rubric_for_http(path: Path = INTERVIEWER_SKILLS_PATH) -> tuple[dict, str]:
    """
    HTTP レスポンス向けに (data, etag) を用意。
    """
    data = get_interviewer_rubric_or_default(path)
    return data, make_rubric_etag(data)
#### 2025.8.12 Add（interviewer score after interview）END