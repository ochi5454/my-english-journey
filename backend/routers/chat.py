import re
from datetime import date, timedelta
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/chat", tags=["chat"])

# キーワード → サブカテゴリのマッピング
KEYWORD_MAP: dict[str, tuple[str, str]] = {
    # 基礎 > 発音
    "発音": ("基礎", "発音"),
    "フォニックス": ("基礎", "発音"),
    "シャドーイング": ("基礎", "発音"),
    "音読": ("基礎", "発音"),
    # 基礎 > 単語
    "単語": ("基礎", "単語"),
    "ボキャブラリー": ("基礎", "単語"),
    "英単語": ("基礎", "単語"),
    "暗記": ("基礎", "単語"),
    "anki": ("基礎", "単語"),
    # 基礎 > 文法
    "文法": ("基礎", "文法"),
    "グラマー": ("基礎", "文法"),
    "grammar": ("基礎", "文法"),
    "構文": ("基礎", "文法"),
    # 運用 > スピーキング
    "スピーキング": ("運用", "スピーキング"),
    "speaking": ("運用", "スピーキング"),
    "英会話": ("運用", "スピーキング"),
    "オンライン英会話": ("運用", "スピーキング"),
    "会話": ("運用", "スピーキング"),
    # 運用 > リスニング
    "リスニング": ("運用", "リスニング"),
    "listening": ("運用", "リスニング"),
    "聞き取り": ("運用", "リスニング"),
    "ポッドキャスト": ("運用", "リスニング"),
    "podcast": ("運用", "リスニング"),
    # 運用 > リーディング
    "リーディング": ("運用", "リーディング"),
    "reading": ("運用", "リーディング"),
    "読解": ("運用", "リーディング"),
    "多読": ("運用", "リーディング"),
    "洋書": ("運用", "リーディング"),
    # 運用 > ライティング
    "ライティング": ("運用", "ライティング"),
    "writing": ("運用", "ライティング"),
    "英作文": ("運用", "ライティング"),
    "ライティング": ("運用", "ライティング"),
    "日記": ("運用", "ライティング"),
}

# TOEIC等の試験系キーワード（サブカテゴリはメッセージ内で特定）
EXAM_KEYWORDS = ["toeic", "toefl", "ielts", "英検", "eiken"]


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    category: str | None = None
    subcategory: str | None = None
    minutes: int | None = None
    date: str | None = None
    note: str | None = None
    needs_clarification: bool = False
    question: str | None = None


def parse_minutes(message: str) -> int | None:
    """メッセージから学習時間（分）を抽出"""
    # 「1時間半」「1.5時間」
    m = re.search(r"(\d+(?:\.\d+)?)\s*時間半", message)
    if m:
        return int(float(m.group(1)) * 60 + 30)

    m = re.search(r"(\d+)\s*時間\s*(\d+)\s*分", message)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))

    m = re.search(r"(\d+(?:\.\d+)?)\s*時間", message)
    if m:
        return int(float(m.group(1)) * 60)

    m = re.search(r"(\d+)\s*分", message)
    if m:
        return int(m.group(1))

    # 「半時間」「半分」= 30分
    if "半時間" in message:
        return 30

    return None


def parse_date(message: str) -> str | None:
    """メッセージから日付を抽出"""
    today = date.today()

    if "一昨日" in message or "おととい" in message:
        return (today - timedelta(days=2)).isoformat()
    if "昨日" in message:
        return (today - timedelta(days=1)).isoformat()
    if "今日" in message:
        return today.isoformat()

    # 「3/10」「3月10日」形式
    m = re.search(r"(\d{1,2})[/月](\d{1,2})日?", message)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        try:
            d = date(today.year, month, day)
            # 未来の日付なら去年とみなす
            if d > today:
                d = date(today.year - 1, month, day)
            return d.isoformat()
        except ValueError:
            pass

    return None


def parse_subcategory(message: str) -> tuple[str, str] | None:
    """メッセージからカテゴリ・サブカテゴリを判定"""
    msg_lower = message.lower()

    # 試験系キーワードがある場合、サブカテゴリを特定する
    for exam in EXAM_KEYWORDS:
        if exam in msg_lower:
            # TOEICリスニング、TOEIC listening 等
            for keyword, (cat, sub) in KEYWORD_MAP.items():
                if keyword.lower() in msg_lower and keyword.lower() != exam:
                    return (cat, sub)
            # サブカテゴリが特定できない場合はNone（聞き返す）
            return None

    # 通常のキーワードマッチ（長いキーワードから先にマッチ）
    sorted_keywords = sorted(KEYWORD_MAP.keys(), key=len, reverse=True)
    for keyword in sorted_keywords:
        if keyword.lower() in msg_lower:
            return KEYWORD_MAP[keyword]

    return None


@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest):
    message = body.message.strip()

    if not message:
        return ChatResponse(
            needs_clarification=True,
            question="学習内容を入力してください",
        )

    # 時間を抽出
    minutes = parse_minutes(message)
    if minutes is None:
        return ChatResponse(
            needs_clarification=True,
            question="学習時間がわかりませんでした。何分（何時間）学習しましたか？",
        )

    # カテゴリ・サブカテゴリを判定
    result = parse_subcategory(message)
    if result is None:
        return ChatResponse(
            needs_clarification=True,
            question="学習内容がわかりませんでした。カテゴリ（発音・単語・文法・スピーキング・リスニング・リーディング・ライティング）を含めて教えてください。",
        )

    category, subcategory = result

    # 日付を抽出
    parsed_date = parse_date(message)

    return ChatResponse(
        category=category,
        subcategory=subcategory,
        minutes=minutes,
        date=parsed_date,
        note=message,
    )
