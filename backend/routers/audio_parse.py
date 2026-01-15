from __future__ import annotations

import io
import os
import re
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from backend.services.asr_local import transcribe_local
from backend.core.config import DATA_DIR
import json

router = APIRouter(prefix="/audio", tags=["audio"])

USE_LOCAL_ASR = os.getenv("USE_LOCAL_ASR", "0") == "1"
ASR_DICTIONARY_PATH = DATA_DIR / "asr_dictionary.json"


def load_asr_dictionary() -> list[tuple[str, str]]:
    if not ASR_DICTIONARY_PATH.exists():
        return []
    try:
        with open(ASR_DICTIONARY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Expect [{"from": "...", "to": "..."}]
        pairs = []
        for item in data:
            src = item.get("from") or ""
            dst = item.get("to") or ""
            if src and dst:
                pairs.append((src, dst))
        return pairs
    except Exception:
        return []


ASR_DICTIONARY = load_asr_dictionary()


def apply_dictionary(text: str) -> str:
    if not text or not ASR_DICTIONARY:
        return text
    result = text
    for src, dst in ASR_DICTIONARY:
        result = result.replace(src, dst)
    return result


# =============================
# Response Model (MUST NOT CHANGE for /audio/parse)
# =============================

class ReportFields(BaseModel):
    tournament_name: str = ""
    match_category: str = ""
    round: str = ""
    match_date: Optional[str] = None       # e.g. "YYYY-MM-DD" (unknown -> null)
    kickoff_time: Optional[str] = None     # e.g. "HH:MM" (unknown -> null)
    venue: str = ""
    weather: str = ""
    temperature: str = ""
    pitch_condition: str = ""


# =============================
# Incidents Models (new endpoint用)
# =============================

class Caution(BaseModel):
    minute: int                   # 通算分（例: 前半15→15, 後半5→50）
    team: str                     # "HOME" / "AWAY" / チーム名（不明なら空）
    number: str                   # 背番号（不明なら空）
    player_name: str              # フルネーム（不明なら空）
    code: str                     # PDF語彙の略号等（不明なら空）
    detail: str                   # 具体的事由（客観、推測しない）

class SendOff(BaseModel):
    minute: int
    team: str
    number: str
    player_name: str
    reason: str                   # 退場理由（規則準拠語彙、なければ空）
    detail: str                   # 具体的事由

class IncidentsResponse(BaseModel):
    cautions: List[Caution] = Field(default_factory=list)
    send_offs: List[SendOff] = Field(default_factory=list)
    special_notes: str = ""       # 警告/退場以外の公式記録すべき客観的事象


# =============================
# Core Pipeline Functions
# =============================

def split_audio(file_bytes: bytes, chunk_seconds: int = 60, overlap_ms: int = 3000) -> List[bytes]:
    """
    音声を chunk_seconds ごとに分割（1秒オーバーラップつき）。
    - pydub + ffmpeg が使える場合のみ分割。
    - 失敗時は元バイト列1チャンクで返す。
    - VADは未使用（導入時はここに webrtcvad 等を組み込む想定）。
    """
    try:
        from pydub import AudioSegment  # type: ignore
    except Exception:
        return [file_bytes]

    try:
        audio = AudioSegment.from_file(io.BytesIO(file_bytes))  # webm/wav など自動判定
        chunks: List[bytes] = []
        step_ms = chunk_seconds * 1000
        step = step_ms - overlap_ms
        for start in range(0, len(audio), step):
            seg = audio[start:start + step_ms]
            buf = io.BytesIO()
            seg.export(buf, format="wav")  # Whisperが安定するwavに揃える
            chunks.append(buf.getvalue())
        return chunks if chunks else [file_bytes]
    except Exception:
        return [file_bytes]


def transcribe_audio_openai(chunks: List[bytes]) -> str:
    """
    OpenAI Whisper API で文字起こしする。
    - language="ja"
    - temperature=0.0
    エラー時は空文字でフォールバック。
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return ""
    client = OpenAI(api_key=api_key)

    texts: List[str] = []
    for i, chunk in enumerate(chunks):
        try:
            f = io.BytesIO(chunk)
            f.name = f"chunk_{i}.wav"  # 拡張子ヒント
            resp = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="ja",
                temperature=0.0,
                prompt=(
                    "審判報告書。大会名、試合区分（1種/2種/3種/4種）、節、キックオフ、会場、天候、気温、ピッチ状態、"
                    "警告、退場、反スポーツ的行為、異議、遅延、繰り返し。"
                ),
            )
            texts.append(resp.text)
        except Exception:
            continue
    return "\n".join(texts)


def refine_text_with_llm(text: str) -> str:
    """
    文字起こし結果をPDFルールに沿う業務文へ補正。
    - 主観禁止 / 推測禁止
    - 情報の追加・削除禁止
    - 数字・日時・固有名詞は保持（誤字のみ修正）
    - 話し言葉を業務文に整形
    - 不明情報は補完しない
    失敗時は ASR 生テキストを返す。
    """
    if not text:
        return ""

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return text

    client = OpenAI(api_key=api_key)

    system_prompt = (
        "あなたは審判報告書の校正者です。"
        "主観や推測は禁止。情報の追加・削除は禁止。"
        "数字・日時・固有名詞は保持し、誤字のみ修正します。"
        "話し言葉を業務文に整形し、審判報告書の記入例の語彙・粒度に揃えてください。"
        "不明な情報は補完しないでください。"
    )

    user_prompt = (
        "以下は音声認識結果です。誤字脱字の修正と文体整形のみ行い、"
        "事実の追加・削除はしないでください。\n"
        "--- ASR ---\n"
        f"{text}\n"
        "--- end ---"
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
        )
        content = resp.choices[0].message.content
        return content if content else text
    except Exception:
        return text


def transcribe_audio_router(file_bytes: bytes, diarize: bool = False) -> str:
    """
    Local ASR（faster-whisper）を優先し、失敗時はOpenAI APIにフォールバック。
    diarize=True の場合は話者分離を試行（pyannote）。失敗時は通常ASR。
    """
    if USE_LOCAL_ASR:
        try:
            text = transcribe_local(file_bytes, diarize=diarize)
            return apply_dictionary(text)
        except Exception as e:
            print(f"Local ASR failed: {e}")

    chunks = split_audio(file_bytes)
    return apply_dictionary(transcribe_audio_openai(chunks))


# =============================
# 基本フィールド抽出（既存）
# =============================

def extract_fields(refined_text: str) -> ReportFields:
    """
    refined_text から ReportFields を生成。
    - 正規表現で主要項目を抽出
    - 推測は行わず、該当がなければ空/None
    - 正規表現で埋まらなかった項目のみ LLM 構造化抽出で補完（JSONスキーマ固定）
      * 主観/推測/情報追加は禁止
      * 不明は空文字/None
      * 日付 YYYY-MM-DD, 時刻 HH:MM で返す想定
    """
    text = refined_text or ""
    if not text:
        return ReportFields()

    def llm_structured_fields(raw: str) -> Optional[ReportFields]:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        # LangChainが利用可能なら構造化パーサを優先する
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import PydanticOutputParser
            from langchain_openai import ChatOpenAI

            llm = ChatOpenAI(api_key=api_key, model="gpt-4o-mini", temperature=0.0)
            parser = PydanticOutputParser(pydantic_object=ReportFields)
            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "あなたは審判報告書の情報抽出器です。主観や推測は禁止。情報の追加・削除は禁止。"
                        "不明な項目は空文字またはnull。日付はYYYY-MM-DD、時刻はHH:MMに正規化してください。",
                    ),
                    ("user", "以下の文章から ReportFields スキーマのJSONのみを返してください。\n---\n{input_text}\n---"),
                ]
            )
            chain = prompt | llm | parser
            return chain.invoke({"input_text": raw})
        except Exception:
            # LangChainが使えない場合は従来のOpenAIコールにフォールバック
            try:
                client = OpenAI(api_key=api_key)
                system_prompt = (
                    "あなたは審判報告書の情報抽出器です。"
                    "主観や推測は禁止。情報の追加・削除は禁止。"
                    "不明な項目は空文字またはnull。"
                    "必ずJSONで返し、キーは tournament_name, match_category, round, match_date, kickoff_time, venue, weather, temperature, pitch_condition。"
                    "日付は可能なら YYYY-MM-DD、時刻は HH:MM。"
                )
                user_prompt = f"以下の文章から上記スキーマのJSONのみを返してください。\n---\n{raw}\n---"
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.0,
                    response_format={"type": "json_object"},
                )
                import json

                content = resp.choices[0].message.content
                data = json.loads(content)
                return ReportFields(**data)
            except Exception:
                return None

    def pick(pattern: str) -> str:
        m = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        return m.group(1).strip() if m else ""

    def normalize_date(raw: str) -> Optional[str]:
        """YYYY-MM-DD のみ許可"""
        if not raw:
            return None
        raw = raw.strip()
        m = re.match(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", raw)
        if m:
            y, mo, d = m.groups()
            return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
        m = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", raw)
        if m:
            y, mo, d = m.groups()
            return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
        return None

    def normalize_time(raw: str) -> Optional[str]:
        """HH:MM のみ許可（00:00〜23:59）"""
        if not raw:
            return None
        m = re.match(r"(\d{1,2}):(\d{2})", raw)
        if m:
            h, mi = m.groups()
            h_i, m_i = int(h), int(mi)
            if 0 <= h_i <= 23 and 0 <= m_i <= 59:
                return f"{h_i:02d}:{m_i:02d}"
            return None
        m = re.match(r"(\d{1,2})時(\d{1,2})分", raw)
        if m:
            h, mi = m.groups()
            h_i, m_i = int(h), int(mi)
            if 0 <= h_i <= 23 and 0 <= m_i <= 59:
                return f"{h_i:02d}:{m_i:02d}"
            return None
        return None

    def first_from_list(candidates: List[str]) -> str:
        for c in candidates:
            m = re.search(c, text)
            if m:
                return m.group(0)
        return ""

    def truncate_at_keywords(raw: str, keywords: List[str]) -> str:
        t = raw
        for kw in keywords:
            if kw and kw in t:
                t = t.split(kw, 1)[0].strip()
        # 句読点・改行でのトリミング
        for sep in ["、", "。", "\n"]:
            if sep in t:
                t = t.split(sep, 1)[0].strip()
        # 長さ制限
        if len(t) > 25:
            t = t[:25].strip()
        return t

    def is_invalid_short(raw: str) -> bool:
        """
        大会名/会場などで、明らかに無効な短さ・数字のみを弾く。
        """
        if not raw:
            return True
        if len(raw) <= 2:
            return True
        if re.fullmatch(r"\d+", raw):
            return True
        return False

    def clean_tournament(raw: str) -> str:
        if not raw:
            return ""
        t = raw.strip()
        # 前置きの定型を除去
        t = re.sub(r"^(今回の|本大会の|本大会は|今回の大会は|今回大会は)\s*", "", t)
        # よく付く語尾・説明を削る
        t = re.sub(r"(で行われました|が開催されました|です|でした|になります)$", "", t).strip()
        # 他フィールドのキーワードが続く場合はそこで打ち切り
        stop_tokens = [
            "試合区分", "試合", "節", "ラウンド", "キックオフ", "会場", "天候", "気温", "ピッチ",
            "ホームチーム", "アウェイ", "ホーム", "アウェイチーム"
        ]
        for tok in stop_tokens:
            if tok in t:
                t = t.split(tok, 1)[0].strip()
                break
        # 句読点や括弧以降を落とす（説明文が続くのを防ぐ）
        for sep in ["、", "。", "（", "(", "\n"]:
            if sep in t:
                t = t.split(sep, 1)[0].strip()
        # 極端に長い/短いものは無効扱い（最大25文字）
        if len(t) > 25 or len(t) <= 1:
            return ""
        return t

    def normalize_match_category(raw: str) -> str:
        if not raw:
            return ""
        raw = raw.translate(str.maketrans("０１２３４", "01234"))
        m = re.search(r"([1-4])\s*種", raw)
        if m:
            return f"{m.group(1)}種"
        # 「2です」など数字だけ拾えた場合
        m = re.search(r"\b([1-4])\b", raw)
        if m:
            return f"{m.group(1)}種"
        # 同義語マッピング（安全側：不明なら空）
        lower = raw.lower()
        synonyms = [
            ("ユース", "2種"),
            ("u-18", "2種"),
            ("u18", "2種"),
            ("高校", "2種"),
            ("高体連", "2種"),
        ]
        for key, val in synonyms:
            if key in raw or key in lower:
                return val
        return ""

    def normalize_round(raw: str) -> str:
        if not raw:
            return ""
        raw = raw.strip()
        # 許容パターンのみ通す: 第◯節 / Round ◯ / R◯
        allowed = (
            re.match(r"^(第\d+節)$", raw)
            or re.match(r"^(Round\s*\d+)$", raw, re.IGNORECASE)
            or re.match(r"^(R\d+)$", raw, re.IGNORECASE)
        )
        if allowed:
            val = allowed.group(1)
            for sep in ["、", "。", "\n"]:
                if sep in val:
                    val = val.split(sep, 1)[0].strip()
            return val
        return ""

    # 大会名（自然文を許容）
    tournament_candidates = [
        pick(r"大会名[:：]?\s*([^\n]+)"),
        pick(r"大会名[はが]\s*([^\n。]+)"),
        pick(r"([^\n。]*?(?:本|今回の)?[^\n。]*?(?:大会|リーグ戦|リーグ|カップ|選手権|杯|チャレンジマッチ|プレ大会)[^\n。]*)"),
    ]
    tournament = clean_tournament(next((c for c in tournament_candidates if c), ""))
    if is_invalid_short(tournament):
        tournament = ""

    # 試合区分（1種/2種/3種/4種 等、全角・自然文対応）
    match_category_raw = (
        pick(r"試合\s*区分[:：]?\s*([^\n。]+)")
        or pick(r"試合\s*区分[はが]\s*([^\n。]+)")
        or pick(r"([1-4１-４])\s*種")
    )
    match_category = normalize_match_category(match_category_raw)

    # 節 / ラウンド（第◯節 / Round ◯ / R◯ のみ採用）
    round_candidates = [
        pick(r"(第\d+節)"),
        pick(r"(Round\s*\d+)"),
        pick(r"(R\d+)"),
    ]
    round_ = normalize_round(next((r for r in round_candidates if r), ""))

    # 試合日（YYYY-MM-DDのみ許可）
    raw_date = (
        pick(r"試合日[:：]?\s*([^\n]+)")
        or pick(r"(\d{4}[./-]\d{1,2}[./-]\d{1,2})")
        or pick(r"(\d{4}年\d{1,2}月\d{1,2}日)")
    )
    match_date = normalize_date(raw_date)

    # キックオフ（HH:MMのみ許可）
    raw_ko = (
        pick(r"キックオフ[:：]?\s*([^\s]+)")
        or pick(r"試合開始[:：]?\s*([^\s]+)")
        or pick(r"(\d{1,2}[:時]\d{1,2})")
    )
    kickoff = normalize_time(raw_ko)

    # 会場
    venue_candidates = [
        pick(r"会場[:：]?\s*([^\n]+)"),
        pick(r"会場[はが]\s*([^\n。]+)"),
        pick(r"([^\s　]+(?:スタジアム|競技場|グラウンド|グラウンド|G\b|フィールド|コート|ドーム|パーク|トレーニングセンター))"),
    ]
    venue = next((v for v in venue_candidates if v), "")
    if venue:
        # 他フィールドのキーワードでトリミング＋句読点カット＋長さ制限
        venue = truncate_at_keywords(venue, ["天候", "気温", "ピッチ", "ホーム", "アウェイ", "試合区分", "節", "ラウンド"])
        # 短すぎ/数字のみ/長すぎは無効
        if is_invalid_short(venue) or len(venue) > 25:
            venue = ""

    # 天候
    weather = pick(r"天候[:：]?\s*([^\s、。]+)") or first_from_list(["晴れ", "晴", "曇り", "曇", "雨", "雪"])

    # 気温
    temperature = pick(r"気温[:：]?\s*(-?\d{1,2})(?:度|℃)") or pick(r"(-?\d{1,2})(?:度|℃)")
    if temperature:
        try:
            temp_val = int(temperature)
            if temp_val < -50 or temp_val > 50:
                temperature = ""
        except Exception:
            temperature = ""

    # ピッチ状態（良/不良/やや不良のみ）
    pitch_condition = pick(r"ピッチ状態[:：]?\s*([^\s、。]+)") or first_from_list(["良", "不良", "やや不良"])
    if pitch_condition not in ["良", "不良", "やや不良"]:
        pitch_condition = ""

    # 一旦正規表現で組み立て
    fields = ReportFields(
        tournament_name=tournament or "",
        match_category=match_category or "",
        round=round_ or "",
        match_date=match_date,
        kickoff_time=kickoff,
        venue=venue or "",
        weather=weather or "",
        temperature=temperature or "",
        pitch_condition=pitch_condition or "",
    )

    # 正規表現で埋まらなかった項目のみ LLM で補完
    if all([
        fields.tournament_name,
        fields.match_category,
        fields.round,
        fields.match_date,
        fields.kickoff_time,
        fields.venue,
        fields.weather,
        fields.temperature,
        fields.pitch_condition,
    ]):
        return fields

    llm_candidate = llm_structured_fields(text)
    if not llm_candidate:
        return fields

    def coalesce(current, new):
        return current if (current or current is False) else new

    return ReportFields(
        tournament_name=coalesce(fields.tournament_name, llm_candidate.tournament_name),
        match_category=coalesce(fields.match_category, llm_candidate.match_category),
        round=coalesce(fields.round, llm_candidate.round),
        match_date=coalesce(fields.match_date, llm_candidate.match_date),
        kickoff_time=coalesce(fields.kickoff_time, llm_candidate.kickoff_time),
        venue=coalesce(fields.venue, llm_candidate.venue),
        weather=coalesce(fields.weather, llm_candidate.weather),
        temperature=coalesce(fields.temperature, llm_candidate.temperature),
        pitch_condition=coalesce(fields.pitch_condition, llm_candidate.pitch_condition),
    )


# =============================
# インシデント抽出（新規）
# =============================

def extract_incidents(refined_text: str) -> IncidentsResponse:
    """
    refined_text から警告・退場・特記事項を抽出。
    - 推測はしない。必要情報が不足する場合はスキップ。
    - 時間は通算分（後半は +45）。算出できない場合は対象事象をスキップ。
    - 理由コード/文言はPDF語彙に寄せる（合致しない場合は空）。
    """
    resp = IncidentsResponse()
    text = refined_text or ""
    if not text:
        return resp

    def llm_structured_incidents(raw: str) -> Optional[IncidentsResponse]:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        # LangChainが使える場合は構造化パーサを優先
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import PydanticOutputParser
            from langchain_openai import ChatOpenAI

            llm = ChatOpenAI(api_key=api_key, model="gpt-4o-mini", temperature=0.0)
            parser = PydanticOutputParser(pydantic_object=IncidentsResponse)
            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "あなたは審判報告書の警告・退場・特記事項を抽出する情報抽出器です。"
                        "主観や推測は禁止。情報の追加・削除は禁止。"
                        "不明なら空文字/空配列。"
                        "キーは cautions, send_offs, special_notes のみで返してください。"
                        "cautions/send_offs は配列。各要素は minute(通算分), team, number, player_name, code/reason, detail。",
                    ),
                    ("user", "以下の文章から指定スキーマのJSONのみを返してください。\n---\n{input_text}\n---"),
                ]
            )
            chain = prompt | llm | parser
            return chain.invoke({"input_text": raw})
        except Exception:
            # LangChain不可の場合は従来のOpenAI呼び出しにフォールバック
            try:
                client = OpenAI(api_key=api_key)
                system_prompt = (
                    "あなたは審判報告書の警告・退場・特記事項を抽出する情報抽出器です。"
                    "主観や推測は禁止。情報の追加・削除は禁止。"
                    "不明なら空文字/空配列。"
                    "キーは cautions, send_offs, special_notes のみでJSONを返してください。"
                    "cautions/send_offs は配列。各要素は minute(通算分), team, number, player_name, code/reason, detail。"
                )
                user_prompt = (
                    "以下の文章から警告・退場・特記事項を抽出し、指定JSONのみを返してください。\n"
                    "---\n"
                    f"{raw}\n"
                    "---"
                )
                resp_llm = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.0,
                    response_format={"type": "json_object"},
                )
                import json

                content = resp_llm.choices[0].message.content
                data = json.loads(content)
                return IncidentsResponse(**data)
            except Exception:
                return None

    llm_candidate = llm_structured_incidents(text)
    if llm_candidate:
        return llm_candidate

    def to_int_safe(s: str) -> Optional[int]:
        try:
            return int(s)
        except Exception:
            return None

    def normalize_team(raw: str) -> str:
        if not raw:
            return ""
        if re.search(r"\bhome\b|ホーム|A\b|Ａ\b", raw, re.IGNORECASE):
            return "HOME"
        if re.search(r"\baway\b|アウェイ|B\b|Ｂ\b", raw, re.IGNORECASE):
            return "AWAY"
        return raw.strip()

    def normalize_minute(half: str, minute_str: str) -> Optional[int]:
        m = to_int_safe(minute_str)
        if m is None:
            return None
        if "後" in half:
            return 45 + m
        return m

    def normalize_code(raw: str) -> str:
        if not raw:
            return ""
        table = {
            "反": "反", "反スポ": "反", "反スポーツ": "反",
            "異": "異", "異議": "異",
            "遅": "遅", "遅延": "遅",
            "繰": "繰", "繰り返し": "繰",
            "距": "距", "距離不足": "距",
            "入": "入", "退出": "入",
            "去": "去",
            "乱": "乱", "乱暴": "乱",
            "阻止": "阻止", "手": "阻止", "ハンド": "阻止",
        }
        for k, v in table.items():
            if k in raw:
                return v
        return ""

    # Cautions
    caution_pattern = re.compile(
        r"(前半|後半)(\d{1,2})分\s*"
        r"([AＡBＢ]|HOME|AWAY|ホーム|アウェイ)?\s*"
        r"([0-9０-９]+)?番?\s*"
        r"([^\s、。()（）]{1,20})?\s*"
        r"(\(?(反スポ|反|異議|異|遅延|遅|繰り返し|繰|距離不足|距|入|去|乱暴|乱|阻止|手|ハンド)[^\)]*\)?)?",
        flags=re.IGNORECASE
    )
    for m in caution_pattern.finditer(text):
        half, minute_str, team_raw, num_raw, name_raw, reason_raw, reason_core = m.groups()
        minute = normalize_minute(half, minute_str)
        if minute is None:
            continue
        team = normalize_team(team_raw or "")
        number = (num_raw or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        code = normalize_code(reason_core or "")
        detail = (reason_raw or "").strip().strip("()（）")
        caution = Caution(
            minute=minute,
            team=team,
            number=number,
            player_name=(name_raw or "").strip(),
            code=code,
            detail=detail,
        )
        resp.cautions.append(caution)

    # Send-offs
    sendoff_pattern = re.compile(
        r"(前半|後半)(\d{1,2})分\s*"
        r"([AＡBＢ]|HOME|AWAY|ホーム|アウェイ)?\s*"
        r"([0-9０-９]+)?番?\s*"
        r"([^\s、。()（）]{1,20})?\s*"
        r"(退場|レッド|退席|送致|乱暴|手|阻止|DOGSO|SFP|VC|AL|AL2|AL3)?",
        flags=re.IGNORECASE
    )
    for m in sendoff_pattern.finditer(text):
        half, minute_str, team_raw, num_raw, name_raw, reason_raw = m.groups()
        minute = normalize_minute(half, minute_str)
        if minute is None:
            continue
        team = normalize_team(team_raw or "")
        number = (num_raw or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        reason = (reason_raw or "").strip()
        sendoff = SendOff(
            minute=minute,
            team=team,
            number=number,
            player_name=(name_raw or "").strip(),
            reason=reason,
            detail=reason,
        )
        resp.send_offs.append(sendoff)

    # Special notes (警告・退場以外)
    special = re.search(r"特記事項[:：]?\s*([^\n]+)", text)
    resp.special_notes = special.group(1).strip() if special else ""

    return resp


# =============================
# API Endpoints
# =============================

@router.post("/parse", response_model=ReportFields)
async def parse_audio(file: UploadFile = File(...), diarize: bool = False) -> ReportFields:
    """
    基本フィールド抽出
    """
    if file is None:
        raise HTTPException(status_code=400, detail="No audio file provided")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    raw_text = transcribe_audio_router(file_bytes, diarize=diarize)
    refined_text = refine_text_with_llm(raw_text)
    return extract_fields(refined_text)


@router.post("/parse/incidents", response_model=IncidentsResponse)
async def parse_audio_incidents(file: UploadFile = File(...), diarize: bool = False) -> IncidentsResponse:
    """
    警告・退場・特記事項抽出（基本フィールドとは別エンドポイント）
    """
    if file is None:
        raise HTTPException(status_code=400, detail="No audio file provided")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    raw_text = transcribe_audio_router(file_bytes, diarize=diarize)
    refined_text = refine_text_with_llm(raw_text)
    return extract_incidents(refined_text)
