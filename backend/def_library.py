from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.prompts import PromptTemplate
from langchain_core.memory import BaseMemory
from langchain.vectorstores import VectorStore, FAISS
from langchain.memory import VectorStoreRetrieverMemory
from config import OPENAI_API_KEY,INITIAL_MESSAGES, COUNTER_FILE, VECTORSTORE_DIR, SAVE_DIR
from typing import List, Tuple, Dict, Union, Optional
from janome.tokenizer import Tokenizer, Token
from fastapi import HTTPException
from datetime import datetime, timezone

import os
import openai
import json

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

# Extract keywords using janome
def extract_keywords(text: str) -> List[str]:
    tokenizer = Tokenizer()
    tokens = tokenizer.tokenize(text)
    keywords = []

    for token in tokens:
        # ① isinstance で Token 型を絞り込む
        if not isinstance(token, Token):
            continue

        # ここでは tok が Token として扱われるので part_of_speech が認識される
        part_of_speech = token.part_of_speech.split(',')[0]
        if part_of_speech == "名詞":
            keywords.append(token.surface)

    return list(set(keywords))

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
def recommend_items_with_llm(keywords: List[str], search_results: List[Dict], history_snippets: List[str]) -> str:
    history_text = "\n".join(f"- {h}" for h in history_snippets)
    prompt = f"""

🔁 ユーザーの過去履歴:
{history_text}

🔑 キーワード: {', '.join(keywords)}

📦 該当商品候補:
{json.dumps(search_results, ensure_ascii=False)}

📝 以下のルールを**厳密に**守って商品をおすすめしてください：

1. 商品は最大3つまで。
2. ユーザーの履歴に言及してください（例：「以前〜とおっしゃっていましたね」）。
3. 各商品には、必ず「id=itemXXX」の形式で**idを本文中に明記**してください。
4. 商品の名前と説明、なぜおすすめなのかを自然な日本語で説明してください。
5. **idを省略したり、idだけまとめて書いたりしないでください。必ず各商品の説明の中に含めてください。**

例：
「以前、夏に使えるグッズをお探しとおっしゃっていましたね。id=item011『速乾冷感タオル』は...」

これを参考に、自然な文章でおすすめしてください。
"""
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

# Search products based on keywords
def search_items(keywords: List[str], db: List[Dict]) -> List[Dict]:
    results = []
    for item in db:
        if any(kw.lower() in item["description"].lower() for kw in keywords):
            results.append(item)
    return results

# 汎用的なデータベース検索関数
def search_database(database: List[Dict], keywords: List[str], field: str) -> List[Dict]:
    """
    汎用的なデータベース検索関数（型安全性を向上）
    """
    results = []
    for entry in database:
        field_value = entry.get(field, "")
        
        # フィールド値が文字列でない場合の処理
        if isinstance(field_value, list):
            # リストの場合、各要素を文字列として結合
            search_text = " ".join(str(item) for item in field_value).lower()
        elif isinstance(field_value, str):
            # 文字列の場合、そのまま使用
            search_text = field_value.lower()
        else:
            # その他の型の場合、文字列に変換
            search_text = str(field_value).lower() if field_value else ""
        
        # キーワード検索を実行
        if any(kw.lower() in search_text for kw in keywords):
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