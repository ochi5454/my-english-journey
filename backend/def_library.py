from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.prompts import PromptTemplate
from langchain_core.memory import BaseMemory
from langchain_community.vectorstores import VectorStore, FAISS
from langchain.memory import VectorStoreRetrieverMemory
from config import OPENAI_API_KEY,INITIAL_MESSAGES, COUNTER_FILE, VECTORSTORE_DIR, SAVE_DIR, BASE_DIR, FEEDBACK_DIR, FILESUMMARY_PATH
from typing import List, Tuple, Dict, Union, Optional
from janome.tokenizer import Tokenizer, Token
from fastapi import HTTPException
from datetime import datetime, timezone
import pandas as pd
from PyPDF2 import PdfReader
import docx
from pptx.util import Pt
from deep_translator import GoogleTranslator
from sentence_transformers import SentenceTransformer, util
import torch
from pptx import Presentation
import sqlite3

import os
import openai
import json
import re

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2') #### 2025.7.18 Add（feedback）

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

#### 2025.7.11 Add（remove identify info）START
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?[\d.\s-]{5,15}')

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

#### 2025.7.22 Add（summarize pptx）START
def init_filedb():
    conn = sqlite3.connect(FILESUMMARY_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT,
            filename TEXT,
            slide_index INTEGER,
            summary TEXT,
            embedding BLOB
        );
    """)
    conn.close()

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
#### 2025.7.22 Add（summarize pptx）END