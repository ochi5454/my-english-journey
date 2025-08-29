from __future__ import annotations
import io
import json
import os
import re
import sqlite3
import tempfile
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from hashlib import sha1
import logging
from collections import Counter, defaultdict
import docx
import docx2txt
import openai
import pandas as pd
from fastapi import HTTPException
from janome.tokenizer import Tokenizer, Token
from sentence_transformers import SentenceTransformer
from openai import OpenAI
from dotenv import load_dotenv
import fitz
import aiofiles
from math import isnan
from pydantic import BaseModel
import orjson
import openpyxl
import chromadb
import pdfplumber
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam,
)
from config import (
    BASE_DIR,
    SKILLS_PATH,
    RESULT_PATH,
    TEMPLATE_INTERVIEWER_PATH,
    TEMPLATE_TODO_PATH,
    TEMPLATE_EMAIL_INTERVIEWER_PATH,
    TEMPLATE_EMAIL_CANDIDATE_PATH,
    INTERVIEWDATE_EACH_CANDIDATE_PATH,
    INTERVIEWER_CHECKSHEET_PATH,
    INTERVIEWER_COMMONSKILLS_PATH,
    INTERVIEWER_EVALS_PATH,
    INTERVIEWER_SKILLS_PATH,
    INTERVIEWER_META_PATH,
    RESUME_MASKED_PATH
)
from typing import List, Dict, Optional, Any, Iterable, TypedDict, cast, Sequence, Mapping, Union

# ============================================
# ✅ 1. 環境変数の読み込み & OpenMPエラー回避
# ============================================

if Path(".env").exists():
    load_dotenv()

# ============================================
# ✅ 2. ロギング設定
# ============================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================
# ✅ 3. モデル・トークナイザー初期化
# ============================================

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
rag_embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2') 
client = OpenAI()
tokenizer = Tokenizer()

# ============================================
# ✅ 4. 正規表現・ホワイトリスト定義
# ============================================

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(0\d{1,4}-\d{1,4}-\d{4})|(0\d{9,10})')
NON_NAME_WHITELIST = {
    "リード", "マネージャー", "エンジニア", "ディレクター", "デザイナー",
    "プロデューサー", "マーケター", "アーキテクト", "CTO", "CEO", "COO"
}

# ============================================
# 📊 1. 面接準備・面談設定・HR評価関連のリクエストモデル
# ============================================

class InterviewSetupRequest(BaseModel):
    interviewDate: str
    interviewer: str 
    candidate: str 
    todo: str
    candidateMail: str
    interviewerMail: str
    stage: str 

class PrepItemDict(TypedDict):
    question: str
    answer: str
    tags: List[str]

# ============================================
# 🧠 1. 個人情報マスキング・正規化ユーティリティ
# ============================================

def mask_names_by_label(text: str) -> str:
    # ラベルの候補
    name_labels = ["氏名", "姓名", "名前", "Name", "Full Name"]
    
    for label in name_labels:
        # 改行や空白を挟んで氏名が続くパターンにマッチ
        pattern = rf"({label}\s*[\r\n]*)[^\s\n]+[\s　]+[^\s\n]+"
        text = re.sub(pattern, r"\1＜人名削除＞", text)

    return text

def mask_name_headline(text: str) -> str:
    # 文頭〜2行目くらいを対象にする
    lines = text.splitlines()
    for i in range(min(3, len(lines))):
        line = lines[i].strip()
        if re.match(r"^[\u4E00-\u9FFF]{1,4}[\s　][\u3040-\u9FFF]{1,4}$", line):
            lines[i] = '＜人名削除＞'
            break
    return '\n'.join(lines)

def normalize_pdf_text(text: str) -> str:
    text = text.replace('\u3000', ' ')  # 全角スペースを半角に
    text = re.sub(r'(?<=[^\n])\n(?=[^\n])', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def mask_personal_info(text: str) -> str:
    # ステップ1: ラベル付き氏名をマスク
    text = mask_names_by_label(text)

    # ステップ2: 文頭のラベルなし氏名をマスク
    text = mask_name_headline(text)

    # ステップ3: メールアドレスと電話番号をマスク
    text = EMAIL_REGEX.sub('＜メールアドレス削除＞', text)
    text = PHONE_REGEX.sub('＜電話番号削除＞', text)

    # ステップ4: 人名（文中）をマスク
    tokens = tokenizer.tokenize(text)
    masked_words = []
    in_name = False

    for token in tokens:
        if not isinstance(token, Token):
            continue

        surface = token.surface
        pos_parts = (token.part_of_speech or "").split(',')

        is_name = (
            pos_parts[0] == "名詞" and
            (
                (len(pos_parts) > 2 and pos_parts[1] == "固有名詞" and pos_parts[2] == "人名") or
                (len(pos_parts) > 3 and pos_parts[1] == "固有名詞" and pos_parts[2] == "名") or
                (len(pos_parts) > 3 and pos_parts[1] == "固有名詞" and pos_parts[2] == "姓")
            )
        )

        if is_name:
            # ホワイトリストに含まれていたらスキップ（＝そのまま出力）
            if surface in NON_NAME_WHITELIST:
                masked_words.append(surface)
                in_name = False
            else:
                if not in_name:
                    masked_words.append("＜人名削除＞")
                    in_name = True
                # 連続人名はスキップ
        else:
            masked_words.append(surface)
            in_name = False

    masked_text = ''.join(masked_words)

    # 会社名マスク（必要なら再有効化）
    # company_names = load_company_names()
    # masked_text = mask_company_names(masked_text, company_names)

    return masked_text

# --- 📄 * 必要に応じて会社名マスク ---------------

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

# ============================================
# 🧠 2. 履歴書スコアリング & 部門推薦ロジック
# ============================================

# --- 📄 パタン1 履歴書をそのまま保存し、スコア判定 ---------------

def extract_text_from_pdf_resume(file_path: str) -> str:
    doc = fitz.open(file_path)  # type: ignore[attr-defined]
    text = "\n".join(page.get_text() for page in doc)  # type: ignore[attr-defined]
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

def score_resume(file_path: str, candidate_id: str) -> dict:
    content = extract_text_from_resume(file_path)
    common_path = SKILLS_PATH / "common.json"
    must_results = check_must_requirements_llm(content, common_path)

    # マスト条件NGなら即返す
    if not all(bool(item.get("result")) for item in must_results.values()):
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None,
        }
        save_result_to_file(result, candidate_id)
        return result

    division_profiles = load_division_profiles(SKILLS_PATH)

    # 複数部門を1つの文字列にまとめる
    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    # GPTへの一括プロンプト
    prompt = f"""
あなたは人事担当者です。
以下の履歴書情報を読み、複数の部門ごとに適合度を10点満点で評価してください。

各部門の理想像は以下の通りです：

{division_descriptions}

候補者の履歴書:
{content}

【出力形式（JSON配列）】
[
  {{"division": "部門A", "score": 数値, "reason": "理由"}},
  ...
]
"""

    # GPT呼び出し：1回だけ（Noneセーフ）
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    # 応答をパース（配列）。content は str | None → 空文字にフォールバック
    raw = (response.choices[0].message.content or "").strip()
    scores: List[Dict[str, Any]]
    try:
        parsed = json.loads(raw)
        # もし単一オブジェクトで返ってきたら配列化
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("JSON is not a list")
        # 要素型を正規化（division: str, score: float, reason: str）
        norm: List[Dict[str, Any]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            division = str(item.get("division", "")).strip()
            # scoreは数値化（NaNはスキップ）
            sc = item.get("score", 0)
            try:
                score_val = float(sc)
                if isnan(score_val):
                    continue
            except Exception:
                continue
            reason = str(item.get("reason", "")).strip()
            if division:
                norm.append({"division": division, "score": score_val, "reason": reason})
        scores = norm if norm else [{
            "division": "N/A",
            "score": 0,
            "reason": "解析エラー: 空または不正なJSON",
        }]
    except Exception as e:
        scores = [{
            "division": "N/A",
            "score": 0,
            "reason": f"解析エラー: {e}",
        }]

    # 推奨部門の抽出（scores が空でも安全）
    recommended = max(scores, key=lambda x: x.get("score", -1), default={"division": None})

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended.get("division"),
    }

    save_result_to_file(result, candidate_id)
    return result

# --- 📄 パタン2 履歴書をマスクし、ベクトルDB、SQLに保存し、スコア判定 ------

def extract_resume_text_from_pdf(file_stream: io.BytesIO) -> str:
    try:
        with pdfplumber.open(file_stream) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        return normalize_pdf_text(text)
    except Exception as e:
        print(f"❌ PDF抽出エラー: {e}")
        return ""

def extract_resume_text_from_docx(file_stream: io.BytesIO) -> str:
    try:
        document = docx.Document(file_stream)
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())
    except Exception as e:
        print(f"❌ DOCX抽出エラー: {e}")
        return ""

def extract_resume_text_from_xlsx(file_stream: io.BytesIO) -> str:
    try:
        wb = openpyxl.load_workbook(file_stream, data_only=True)
        text = ""

        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                for cell in row:
                    if cell is not None:
                        text += str(cell).strip() + "\n"

        return text
    except Exception as e:
        print(f"❌ XLSX抽出エラー: {e}")
        return ""

def score_resume_from_text(text: str, candidate_id: str) -> dict:
    common_path = SKILLS_PATH / "common.json"
    must_results = check_must_requirements_llm(text, common_path)

    # マスト条件NGなら即保存・返却
    if not all(bool(item.get("result")) for item in must_results.values()):
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None,
        }
        save_result_to_file(result, candidate_id)
        return result

    division_profiles = load_division_profiles(SKILLS_PATH)

    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    prompt = f"""
あなたは人事担当者です。
以下の履歴書情報を読み、複数の部門ごとに適合度を10点満点で評価してください。

各部門の理想像は以下の通りです：

{division_descriptions}

候補者の履歴書（マスク済み）:
{text}

【出力形式（JSON配列で）】
[
  {{"division": "部門A", "score": 数値, "reason": "理由"}},
  ...
]
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    # ★ None セーフにしてからパース
    raw = (response.choices[0].message.content or "").strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("JSON is not a list")

        # 要素の正規化
        scores: List[Dict[str, Any]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            division = str(item.get("division", "")).strip()
            reason = str(item.get("reason", "")).strip()

            sc = item.get("score", 0)
            try:
                score_val = float(sc)
                if isnan(score_val):
                    continue
            except Exception:
                continue

            if division:
                scores.append({"division": division, "score": score_val, "reason": reason})

        if not scores:
            scores = [{
                "division": "N/A",
                "score": 0,
                "reason": "解析エラー: 空または不正なJSON",
            }]

    except Exception as e:
        scores = [{
            "division": "N/A",
            "score": 0,
            "reason": f"解析エラー: {e}",
        }]

    recommended = max(scores, key=lambda x: x.get("score", -1), default={"division": None})

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended.get("division"),
    }

    save_result_to_file(result, candidate_id)
    return result

def save_masked_resume_embedding_local(candidate_id: str, text: str):
    """
    マスク済み履歴書テキストをローカルEmbeddingし、Chromaに保存する。
    OpenAIは一切使用しない。

    Parameters:
        candidate_id (str): 候補者ID（例：cand_0001）
        text (str): マスク済み履歴書の全文
    """
    # 1. Chromaクライアントとコレクション取得
    chroma_client = chromadb.Client()
    collection = chroma_client.get_or_create_collection("resumes_local")

    # 2. チャンク分割（簡易。必要であればtiktoken系にも変更可）
    chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]

    # 3. SentenceTransformerでベクトル化（OpenAIは一切使わない）
    embeddings = rag_embedding_model.encode(chunks)

    # 4. Chromaに保存（candidate_idをメタデータとして追加）
    for i, chunk in enumerate(chunks):
        doc_id = f"{candidate_id}_{i}_{str(uuid4())[:8]}"  # UUIDで衝突回避
        collection.add(
            documents=[chunk],
            ids=[doc_id],
            embeddings=[embeddings[i]],
            metadatas=[{
                "candidate_id": candidate_id,
                "chunk_index": i
            }]
        )

def generate_resume_sql(masked_text: str, candidate_id: str) -> str:
    prompt = f"""
あなたは人事用のデータ構造化AIです。
以下の履歴書情報（個人情報マスク済み）を読み、以下の3つのテーブルに分けてINSERT文を出力してください。

【候補者ID】
{candidate_id}

【テーブル構造】
1. resumes（基本情報）:
CREATE TABLE resumes (
  id TEXT,
  name_masked TEXT,
  email_masked TEXT,
  phone_masked TEXT,
  skills TEXT,
  notes TEXT
);

2. education_history（学歴）:
CREATE TABLE education_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id TEXT,
  institution TEXT,
  degree TEXT,
  start_date TEXT,
  end_date TEXT
);

3. work_history（職歴）:
CREATE TABLE work_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id TEXT,
  company TEXT,
  position TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT
);

【履歴書内容】
{masked_text}

【出力形式】
各テーブルについて、1つずつINSERT文を出力してください。
複数の学歴や職歴があれば、複数行のINSERT文で構いません。

注意：
- resumesテーブルの `id` = `{candidate_id}`
- education_history, work_history の `resume_id` も `{candidate_id}` にしてください。
- 履歴書には「＜人名削除＞」「＜メールアドレス削除＞」「＜電話番号削除＞」などのマスク済み表記があります。
- これらの表記はそのままSQLに埋め込んでください。
- 「＜削除＞」や空文字列に変換してはいけません。
- SQLコードのみ出力し、解説や囲いなどは不要です。
"""
    response = openai.chat.completions.create(
        model="gpt-3.5-turbo",  # ダウングレード済
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    # ★ Noneセーフ化
    return (response.choices[0].message.content or "").strip()

def save_sql_to_sqlite(sql: str):
    try:
        db_path = str(RESUME_MASKED_PATH)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 複数の INSERT 文がある前提で split & 実行
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        for stmt in statements:
            cursor.execute(stmt)

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ SQL実行エラー: {e}")

# --- 📄 パタン1,2 共通関数 ----------------------------

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
        temperature=0.2,
    )

    try:
        # Noneセーフ化
        raw_content = response.choices[0].message.content or ""
        result = json.loads(raw_content)
        return result
    except Exception as e:
        # JSONパース失敗時は全て False 扱い
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

# ============================================
# 🧠 3. スコア再評価・調整ロジック（AI・担当者コメント反映）
# ============================================

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

def _coerce_messages(prompt: List[Dict[str, Any]]) -> List[ChatCompletionMessageParam]:
    """ゆるいdictの配列をChatCompletionMessageParamに正規化"""
    out: List[ChatCompletionMessageParam] = []
    for m in prompt:
        role = m.get("role")
        content = m.get("content")
        if role == "user":
            out.append(cast(ChatCompletionUserMessageParam, {"role": "user", "content": content}))
        elif role == "system":
            out.append(cast(ChatCompletionSystemMessageParam, {"role": "system", "content": content}))
        elif role == "assistant":
            out.append(cast(ChatCompletionAssistantMessageParam, {"role": "assistant", "content": content}))
        else:
            # 未知のroleはuser扱いにフォールバック
            out.append(cast(ChatCompletionUserMessageParam, {"role": "user", "content": content}))
    return out

def call_openai_chat(prompt: List[Dict[str, Any]], model: str = "gpt-3.5-turbo") -> str:
    try:
        messages: List[ChatCompletionMessageParam] = _coerce_messages(prompt)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
        )
        return (response.choices[0].message.content or "")
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
    scores = result.get("scores", [])
    if not scores:
        result["recommended_division"] = None
        return

    recommended = max(scores, key=lambda x: x.get("score", -1))
    result["recommended_division"] = recommended.get("division")

def save_score_to_history(candidate_id: str, new_scores: List[dict], updated_by: str, source: str):
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    now = datetime.now().isoformat()

    # ✅ グローバルスコア履歴（divisionごとに）
    if "score_history" not in result:
        result["score_history"] = {}

    for new_score in new_scores:
        division = new_score["division"]

        # --------------------------
        # 🔁 グローバル履歴の重複チェック
        # --------------------------
        global_history = result["score_history"].setdefault(division, [])
        if not global_history or (
            global_history[-1]["score"] != new_score["score"] or
            global_history[-1]["reason"] != new_score["reason"]
        ):
            global_history.append({
                "score": new_score["score"],
                "reason": new_score["reason"],
                "updated_by": updated_by,
                "updated_at": now,
                "source": source
            })

        # --------------------------
        # 🎯 scores[] に反映（上書き前に履歴）
        # --------------------------
        for s in result.get("scores", []):
            if s.get("division") == division:
                # 履歴初期化
                if "score_history" not in s:
                    s["score_history"] = []

                # 🔁 上書き前の内容を履歴に保存（重複チェックあり）
                last_entry = s["score_history"][-1] if s["score_history"] else None
                if not last_entry or (
                    last_entry["score"] != s["score"] or
                    last_entry["reason"] != s["reason"]
                ):
                    s["score_history"].append({
                        "score": s["score"],
                        "reason": s["reason"],
                        "reviewer": result.get("updated_by", updated_by),
                        "reviewed_at": result.get("updated_at", now)
                    })

                # 🎯 現在のスコア・理由を上書き
                s["score"] = new_score["score"]
                s["reason"] = new_score["reason"]

    # ✅ 推奨部門の更新ロジック（変わらず）
    update_recommended_division_from_history(result)

    save_result_to_file(result, candidate_id)
    return result

# ============================================
# 🧠 4. 面談日程調整の構成・送信・保存ロジック
# ============================================

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

# ============================================
# 🧠 5. 面接シートの読み込み・一覧化ロジック
# ============================================

def get_divisions(result: dict) -> List[str]:
    return [s.get("division") for s in result.get("scores", []) if s.get("division")]

def _load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}

def _safe_load_json(path: Union[str, Path]) -> Dict[str, Any]:
    data: Any = _load_json(path)
    if isinstance(data, Mapping):
        try:
            return {str(k): v for k, v in data.items()}
        except Exception:
            return dict(data)  # type: ignore[arg-type]
    return {}

def _safe_load_json_list(path: Union[str, Path]) -> list:
    data = _load_json(path)
    if isinstance(data, list):
        return data
    return []

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

def list_all_checksheet_blocks():
    results = []

    for interviewer_dir in INTERVIEWER_CHECKSHEET_PATH.iterdir():
        if not interviewer_dir.is_dir():
            continue

        for file in interviewer_dir.glob("*.json"):
            try:
                with open(file, encoding="utf-8") as f:
                    data = json.load(f)

                # ファイル名: {candidate_id}_{stage}.json を分解
                name_parts = file.stem.split("_")
                if len(name_parts) < 2:
                    continue
                candidate_id = "_".join(name_parts[:-1])
                stage = name_parts[-1]

                results.append({
                    "candidate_id": candidate_id,
                    "interviewer_id": interviewer_dir.name,
                    "stage": stage,
                    **data
                })
            except Exception:
                continue  # 読み込みエラーはスキップ

    return results

def _as_non_empty_str(x: Any) -> Optional[str]:
    """値を非空strに正規化。空/None/非strは None を返す。"""
    if isinstance(x, str):
        s = x.strip()
        return s if s else None
    return None

# ============================================
# 🧠 6. 面談シート評価・スコア補正ロジック
# ============================================

def review_with_interview_checksheet(
    candidate_id: str,
    reviewer_id: str,     # = interviewer_id
    stage: str,
    prep_items: List[PrepItemDict],  # ← ✅ 型を明示
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

    # 🔥 推奨部門をスコアから再設定
    if result.get("scores"):
        top_div = max(result["scores"], key=lambda x: x.get("score", -1))
        result["recommended_division"] = top_div.get("division", None)

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
        "prepItems": to_serializable(prep_items),
        "reviewedResume": reviewed_resume,
        "qualitative": qualitative or {},
        "quantitative": quantitative or {},
    }

    # ← ここで壊さずマージ
    merged_block = merge_block(existing_block, incoming_block)
    merged_block["ai_score_reviewed"] = True
    merged_block["eval_required"] = True
    merged_block["updated_at"] = now_str

    upsert_checksheets_block(
        interviewer_id=reviewer_id,
        candidate_id=candidate_id,
        stage=stage,
        block=merged_block,
    )

    return result

def to_serializable(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return obj.dict()
    if isinstance(obj, list):
        return [to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    return obj

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
    prep_items: Sequence[Mapping[str, Any]],  # ★ ここを List[Dict...] → Sequence[Mapping...] に変更
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
        q = str(it.get("question", "")).strip()
        a = str(it.get("answer", "")).strip()
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
        if v is not None and str(v).strip():
            qual_lines.append(f"- {k}: {v}")
    qual_block = "\n".join(qual_lines) if qual_lines else "（記載なし）"

    # --- Quantitative（定量 1-5 + コメント） ---
    quant_lines: List[str] = []
    for k, v in (quantitative or {}).items():
        if isinstance(v, dict):
            lv = v.get("level")
            cm = v.get("comment", "")
            if lv is not None or (isinstance(cm, str) and cm.strip()):
                quant_lines.append(f"- {k}: level={lv}, comment={cm}")
    quant_block = "\n".join(quant_lines) if quant_lines else "（記載なし）"

    # --- 現在スコアを並べる ---
    current_scores_lines = "\n".join(
        f"- {d}: {int(current_scores.get(d, 0))}点" for d in valid_divisions
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

def _to_prep_item_dict(pi: Any) -> PrepItemDict:
    """PrepItem(Pydantic)・dict・その他を PrepItemDict へ正規化"""
    if hasattr(pi, "model_dump"):           # Pydantic v2
        d = pi.model_dump()
    elif hasattr(pi, "dict"):               # Pydantic v1
        d = pi.dict()
    elif isinstance(pi, dict):              # すでにdict
        d = pi
    else:
        d = {}

    return {
        "question": str(d.get("question", "") or ""),
        "answer":  str(d.get("answer", "") or ""),
        "tags":    d.get("tags", []) or [],
    }

# ============================================
# 🧠 7. 面接官評価キャッシュ・ルーブリック管理
# ============================================

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

def load_interviewer_skills(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
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
    cid: str, stage: str, qa_block: dict, resume: dict, rubric: dict, rolefit: dict | None = None
) -> str:
    payload = {
        "cid": cid,
        "stage": stage,
        "qa_updated_at": qa_block.get("updated_at"),
        "qa_items": qa_block.get("prepItems", []),
        "qa_qualitative": qa_block.get("qualitative", {}),
        "qa_quantitative": qa_block.get("quantitative", {}),
        "resume_updated_at": (resume or {}).get("updated_at"),
        "resume_scores": (resume or {}).get("scores", []),
        "rubric_version": rubric.get("version"),

        # 🔽 差分に使うフィールドを増やす
        "rolefit_score": rolefit.get("score") if rolefit else 0,
        "rolefit_matched": rolefit.get("matched", []) if rolefit else [],
        "rolefit_missing": rolefit.get("missing", []) if rolefit else [],
        "rolefit_violated": rolefit.get("violated", []) if rolefit else [],
        "rolefit_comment": rolefit.get("comment", "") if rolefit else "",
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

def read_interviewer_rubric_file(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
    """ルーブリックJSONをそのまま読む（存在しなければ例外）。"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def make_rubric_etag(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return sha1(body).hexdigest()[:16]

def get_interviewer_meta(interviewer_id: str) -> dict:
    """
    面接官IDから部署・ロールなどのメタ情報を取得。
    全員分が1ファイルにまとまっている形式に対応。
    """
    meta_file: Path = INTERVIEWER_META_PATH  # ← JSONファイルそのもの
    if not meta_file.exists():
        return {}
    try:
        with open(meta_file, encoding="utf-8") as f:
            all_meta = json.load(f)
            return all_meta.get(interviewer_id, {})
    except Exception as e:
        print(f"[WARN] 面接官メタ情報の読み込み失敗 ({interviewer_id}): {e}")
        return {}

# ============================================
# 🧠 8. 面接官評価ロジック（LLM採点・ルーブリック補正）
# ============================================

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
    criteria = raw_json.get("criteria", [])
    total = compute_weighted_total(rubric, criteria)

    full_criteria = rubric.get("criteria", [])
    label_map = {c["key"]: c["label"] for c in full_criteria}
    weight_map = {c["key"]: c["weight"] for c in full_criteria}
    guide_map = {c["key"]: c["guidance"] for c in full_criteria}

    labeled = []
    breakdown = {}
    for c in criteria:
        key = c.get("key")
        score = c.get("score", 0)
        breakdown[key] = score  # 👈 各項目のスコアを辞書に追加
        labeled.append({
            "key": key,
            "label": label_map.get(key, key),
            "score": score,
            "note": c.get("note", ""),
            "weight": weight_map.get(key),
            "guidance": guide_map.get(key),
        })

    return {
        "total": total,                    # 👈 一貫性のため "score" → "total" にしてもOK
        "breakdown": breakdown,            # ✅ 各観点のスコアを追加
        "reasons": raw_json.get("reasons", []),
        "suggestions": raw_json.get("suggestions", []),
        "rubric": labeled,
        "evaluated_at": datetime.now().isoformat(),
        "evaluated_by": interviewer_id,
        "candidate_id": candidate_id,
        "stage": stage,
        "skipped": raw_json.get("skipped", False),
        "note": raw_json.get("note", ""),
    }

def build_interviewer_eval_prompt(
    interviewer_id: str,
    stage: str,
    resume_result: dict,
    qa_block: dict,
    rubric: dict,
    include_reasons: bool = True
) -> list[dict]:
    """面談QA + 直前スコア + ルーブリックから評価用プロンプトを生成"""
    # QA整形
    items = (qa_block or {}).get("prepItems", [])
    qa_lines = []
    for i, it in enumerate(items, 1):
        q = (it["question"] or "").strip()
        a = (it["answer"] or "").strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")
    qa_text = "\n\n".join(qa_lines) if qa_lines else "（面談QAの記録なし）"

    # 定性メモ
    qual = qa_block.get("qualitative") or {}
    qual_lines = []
    for k in ("careerGoals", "otherApps", "overall", "assignmentPlan"):
        v = (qual.get(k) or "").strip()
        if v:
            qual_lines.append(f"- {k}: {v}")
    qual_text = "\n".join(qual_lines) if qual_lines else "（定性メモなし）"

    # 定量メモ
    quant = qa_block.get("quantitative") or {}
    q_rows = []
    for k, row in (quant.items() if isinstance(quant, dict) else []):
        lv = row.get("level")
        cm = (row.get("comment") or "").strip()
        if lv or cm:
            q_rows.append(f"- {k}: Lv{lv or 0} / {cm}")
    quant_text = "\n".join(q_rows) if q_rows else "（定量メモなし）"

    # 直前スコア
    scores = resume_result.get("scores", [])
    score_lines = [f"- {s.get('division')}: {s.get('score')}点（理由: {s.get('reason','')}）" for s in scores]
    scores_text = "\n".join(score_lines) if score_lines else "（スコアなし）"

    # ルーブリック説明
    crit_lines = []
    for c in rubric.get("criteria", []):
        crit_lines.append(f"- {c['label']}({c['key']}): 重み {c['weight']} → {c['guidance']}")

    if not include_reasons:
        output_format = (
            "出力は必ずJSONで、次の形式：\n"
            "{\n"
            '  "score": 0-10 の整数,\n'
            '  "criteria": [{"key":"prep","score":0-10,"note":"..."}, ...],\n'
            '  "reasons": ["...","..."],\n'
            '  "suggestions": ["...","..."]\n'
            "}\n"
        )
    else:
        output_format = (
            "出力は必ずJSONで、次の形式：\n"
            "{\n"
            '  "score": 0-10 の整数,\n'
            '  "criteria": [{"key":"prep","score":0-10,"note":"..."}, ...]\n'
            "}\n"
        )

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
            + output_format +
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
    model: str = "gpt-4",
    include_reasons: bool = True
) -> dict:
    """LLMで面談者を1名分採点し、重みで総合点を補正"""
    prompt = build_interviewer_eval_prompt(
        interviewer_id, 
        stage, 
        resume_result, 
        qa_block, 
        rubric,
        include_reasons=include_reasons
    )
    raw = call_openai_chat(prompt, model=model)

    # 🔽 ここに print を追加！
    print("\n========== [DEBUG] LLM raw output ==========")
    print(raw)
    print("============================================\n")

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
    cid: str, iid: str, stg: str, result: dict, rubric: dict, source_sig: str
) -> dict:
    return {
        "candidate_id": cid,
        "interviewer_id": iid,
        "stage": stg,
        "total": result.get("total", 0),
        "breakdown": result.get("breakdown", {}),
        "reasons": result.get("reasons", []),
        "suggestions": result.get("suggestions", []),
        "rubric": result.get("rubric", []),
        "evaluated_at": result.get("evaluated_at"),
        "source_sig": source_sig,
        "role_expectation": result.get("role_expectation", {}),
        "skipped": result.get("skipped", False),
        "note": result.get("note", ""),
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

def calc_role_score(role_expectation: dict) -> float:
    """
    role_expectation から柔らかいロールスコア（float）を計算する。
    violated があっても最低4点を保証する優しい評価。
    """
    if not role_expectation:
        return 0.0

    matched = len(role_expectation.get("matched", []))
    missing = len(role_expectation.get("missing", []))
    violated = len(role_expectation.get("violated", []))
    total = matched + missing

    if total == 0:
        return 0.0

    # 優しい段階スコア + 減点（最低4点保証）
    ratio = matched / total
    if matched == 0:
        score = 4
    elif ratio < 0.34:
        score = 6
    elif ratio < 0.67:
        score = 8
    elif ratio < 1.0:
        score = 9
    else:
        score = 10

    return max(score - violated * 1, 4.0)

# ============================================
# 🎯 9. 面接官評価サービス（評価・保存・差分再計算）
# ============================================

def evaluate_interviewer_single(
    candidate_id: str,
    interviewer_id: str,
    stage: str,
    resume_result: Optional[dict] = None,
    qa_block: Optional[dict] = None,
    model: str = "gpt-4",
    include_reasons: bool = True,
    skip_eval: bool = False
) -> dict:
    """
    面談者1名×1ステージの評価を完結させるサービス関数。
    入力が無ければ自動で取りに行く。
    """
    print(f"✅モデル/理由スキップ/基礎スコアスキップ： {model}/ {include_reasons}/ {skip_eval}")
    resume = resume_result or get_resume_or_empty(candidate_id)
    if qa_block is None:
        prep_map = load_prep_map_with_owner()
        qa_block = pick_qa_block_for(prep_map, candidate_id, stage, interviewer_id)

    rubric = load_interviewer_skills(INTERVIEWER_COMMONSKILLS_PATH)
    if not skip_eval:
        raw = eval_interviewer_once(
            interviewer_id, stage, 
            resume, 
            qa_block, 
            rubric, 
            model=model,
            include_reasons=include_reasons
        )

        # LLMが壊れても最低限の形に
        if not isinstance(raw, dict):
            try:
                raw = json.loads(raw)  # 念のため
            except Exception:
                raw = {"score": 0, "criteria": [], "reasons": ["LLM出力の解析に失敗"], "suggestions": []}
    else:
        raw = {"score": 0, "criteria": [], "reasons": [], "suggestions": [], "skipped": True, "note": "このスコアはLLMによる基礎スコア評価をスキップしたため、実スコアではありません"}  # 👈 スコアは0点固定

    result = normalize_interviewer_eval_output(raw, rubric, interviewer_id, candidate_id, stage)
    print("\n========== [DEBUG] Evaluated result before role_expectation ==========")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("=======================================================================\n")

    # 🔽 追加: 部署×ロール適合度を計算して追記
    rolefit = evaluate_role_expectation_match(interviewer_id, qa_block)
    # 🔽 スコアを計算して明示的に追加（冪等ではあるが確実にする）
    expected_count = len(rolefit.get("matched", [])) + len(rolefit.get("missing", []))
    rolefit["score"] = round(len(rolefit.get("matched", [])) / max(expected_count, 1) * 10, 1)

    result["role_expectation"] = rolefit

    return result

def list_diff_targets(stage: str|None=None, q: str|None=None, limit: int|None=None) -> dict:
    prep_map = load_prep_map_with_owner()
    rubric = load_interviewer_skills(INTERVIEWER_COMMONSKILLS_PATH)

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

        if not block.get("eval_required", False):
            continue
        if needle and (needle not in iid.lower() and needle not in cid.lower()):
            continue

        if cid not in resume_cache:
            resume_cache[cid] = get_resume_or_empty(cid)
        resume = resume_cache[cid]

        rolefit = evaluate_role_expectation_match(iid, block)
        sig = calc_source_sig(cid, stg, block, resume, rubric, rolefit=rolefit)
        k = _row_key(cid, iid, stg)
        cached = idx.get(k)

        if not cached:
            missing.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})
        elif cached.get("source_sig") != sig:
            stale.append({"candidate_id": cid, "interviewer_id": iid, "stage": stg})

        if limit and (len(missing) + len(stale)) >= limit:
            break

    return {"missing": missing, "stale": stale}

def refresh_targets_and_upsert(
        targets: list[dict], 
        model: str = "gpt-4",
        include_reasons: bool = True,
        skip_eval: bool = False
    ) -> list[dict]:
    if not targets: return []

    rubric = load_interviewer_skills(INTERVIEWER_COMMONSKILLS_PATH)
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
            
            if not qa_block.get("eval_required", False):
                continue

            result = evaluate_interviewer_single(
                candidate_id=cid,
                interviewer_id=iid,
                stage=stg,
                resume_result=resume,
                qa_block=qa_block,
                model=model,
                include_reasons=include_reasons,
                skip_eval=skip_eval
            )

            sig = calc_source_sig(cid, stg, qa_block, resume, rubric, rolefit=result.get("role_expectation"))
            row = to_row_from_llm_json(cid, iid, stg, result, rubric, sig)
            row["role_expectation"] = result.get("role_expectation", {})

            idx[_row_key(cid, iid, stg)] = row
            updated_rows.append(row)

            # 🔸 ここで eval_required を False に落とす
            qa_block["eval_required"] = False

        # idx → rows に戻してこの面談者ファイルにだけ保存
        rows = list(idx.values())
        rows.sort(key=lambda r: (r["stage"], r["interviewer_id"], r["candidate_id"]))
        save_evals_cache_for(iid, {"rows": rows})
        save_checksheet_map(prep_map)

    return updated_rows

def save_checksheet_map(prep_map: dict):
    for cid, stage_blocks in prep_map.items():
        for stage, blocks in stage_blocks.items():
            for block in blocks:
                iid = block.get("interviewer_id")
                if not iid:
                    continue
                filepath = INTERVIEWER_CHECKSHEET_PATH / iid / f"{cid}.json"
                # 保存対象の1人分の dict を構成
                content = {
                    "interviewer_id": iid,
                    "candidate_id": cid,
                    "stages": {
                        stage: block
                    }
                }
                save_json(filepath, content)

def save_json(filepath: Path, data: dict, ensure_dir: bool = True, indent: int = 2) -> None:
    """
    指定されたPathにJSONを保存する。

    Args:
        filepath (Path): 保存先のファイルパス（例: Path("user123/cand_abc.json")）
        data (dict): 保存するデータ
        ensure_dir (bool): 親ディレクトリが存在しない場合は作成するか（デフォルト: True）
        indent (int): インデント幅（整形出力用）
    """
    if ensure_dir:
        filepath.parent.mkdir(parents=True, exist_ok=True)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)

def get_interviewer_rubric_or_default(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
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

def load_rubric_for_http(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> tuple[dict, str]:
    """
    HTTP レスポンス向けに (data, etag) を用意。
    """
    data = get_interviewer_rubric_or_default(path)
    return data, make_rubric_etag(data)

def evaluate_role_expectation_match(interviewer_id: str, qa_block: dict) -> dict:
    meta = get_interviewer_meta(interviewer_id)
    dept = meta.get("department")
    role = meta.get("role")

    if not dept or not role:
        return {
            "matched": [],
            "matched_semantic": [],
            "missing": [],
            "violated": [],
            "comment": "部署/ロール情報なし",
            "score": 0.0
        }

    path = INTERVIEWER_SKILLS_PATH / f"{dept}.json"
    if not path.exists():
        return {
            "matched": [],
            "matched_semantic": [],
            "missing": [],
            "violated": [],
            "comment": f"{dept}.json が存在しない",
            "score": 0.0
        }

    with open(path, encoding="utf-8") as f:
        role_map = json.load(f)

    role_data = role_map.get(role)
    if not role_data:
        return {
            "matched": [],
            "matched_semantic": [],
            "missing": [],
            "violated": [],
            "comment": f"{dept}.json にロール {role} の設定が存在しない",
            "score": 0.0
        }

    expected_items = role_data.get("expected_focus", [])
    expected_ids = {item["id"] for item in expected_items}
    id_to_label = {item["id"]: item["label"] for item in expected_items}

    selected_tags = set()
    for item in qa_block.get("prepItems", []):
        tags = item.get("tags", [])
        selected_tags.update(tags)

    matched_ids = [tag_id for tag_id in expected_ids if tag_id in selected_tags]
    missing_ids = [tag_id for tag_id in expected_ids if tag_id not in selected_tags]

    role_expectation = {
        "matched": [id_to_label[i] for i in matched_ids],
        "matched_semantic": [],
        "missing": [id_to_label[i] for i in missing_ids],
        "violated": [],
        "comment": f"タグ評価: 期待観点 {len(expected_ids)} 件中 {len(matched_ids)} 件マッチ",
        "score": calc_role_score({
            "matched": matched_ids,
            "missing": missing_ids,
            "violated": []
        })
    }

    return role_expectation

def load_role_focus_dict(skills_path: Path) -> dict:
    role_focus_dict = {}
    for skill_file in skills_path.glob("*.json"):
        skill_data = _load_json(skill_file)
        for role, role_data in skill_data.items():
            key = f"{skill_file.stem.lower()}:{role.lower()}"

            if isinstance(role_data, dict):
                # ✅ 正常な形式
                role_focus_dict[key] = role_data
            elif isinstance(role_data, list):
                # ✅ 旧形式への対応： expected_focus を dict に包む
                role_focus_dict[key] = {"expected_focus": role_data}
            else:
                # fallback
                role_focus_dict[key] = {"expected_focus": []}
    return role_focus_dict

def load_all_prepitem_tags_by_role(meta: Dict[str, Any], checksheet_path: Path) -> Dict[str, Dict[str, int]]:
    usage_counter: defaultdict[str, Counter[str]] = defaultdict(Counter)

    for user_dir in checksheet_path.glob("*"):
        if not user_dir.is_dir():
            continue

        user_id = user_dir.name
        user_meta = meta.get(user_id)
        if not isinstance(user_meta, Mapping):
            continue

        dept = str(user_meta.get("department", "") or "").lower()
        role = str(user_meta.get("role", "") or "").lower()
        role_key = f"{dept}:{role}"

        for json_file in user_dir.glob("*.json"):
            data = _load_json(json_file)

            # stages は dict 前提だが、型安全にガード
            stages = data.get("stages") if isinstance(data, Mapping) else None
            if not isinstance(stages, Mapping):
                continue

            for stage_data in stages.values():
                if not isinstance(stage_data, Mapping):
                    continue

                prep_items = stage_data.get("prepItems", [])
                if not isinstance(prep_items, Iterable):
                    continue

                for item in prep_items:
                    if not isinstance(item, Mapping):
                        continue

                    tags = item.get("tags", [])
                    # tags が単一文字列/オブジェクトの可能性に備えて配列化
                    if isinstance(tags, (list, tuple)):
                        tag_iter = tags
                    else:
                        tag_iter = [tags]

                    for tag in tag_iter:
                        tag_id: str | None
                        if isinstance(tag, Mapping):
                            # dict形式のときは id 優先、なければ name などもフォールバック可
                            tag_id = tag.get("id") or tag.get("name") or None
                            if tag_id is not None:
                                tag_id = str(tag_id)
                        else:
                            tag_id = str(tag) if isinstance(tag, (str, int, float)) else None

                        if tag_id:
                            usage_counter[role_key][tag_id] += 1

    # defaultdict を通常の dict にして返す（シリアライズ等で扱いやすく）
    return {rk: dict(cnt) for rk, cnt in usage_counter.items()}

def get_missing_tags(expected_tags: list, used_counter: dict) -> list:
    tag_ids = []

    for tag in expected_tags:
        if isinstance(tag, str):
            tag_ids.append(tag)
        elif isinstance(tag, dict):
            if 'id' in tag and isinstance(tag['id'], str):
                tag_ids.append(tag['id'])

    return [tag_id for tag_id in tag_ids if used_counter.get(tag_id, 0) < 1]

def extract_ids_and_labels(expected_focus: list):
    """expected_focus が string or dict の両形式に対応するユーティリティ関数"""
    ids = []
    id_to_label = {}

    for item in expected_focus:
        if isinstance(item, dict) and "id" in item and "label" in item:
            ids.append(item["id"])
            id_to_label[item["id"]] = item["label"]
        elif isinstance(item, str):
            ids.append(item)
            id_to_label[item] = item  # ラベルがない場合はIDをそのまま使う
    return ids, id_to_label