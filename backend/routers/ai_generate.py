"""AIメール生成API"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import openai

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.core.config import Settings
from backend.models.user import User

router = APIRouter(prefix="/ai", tags=["ai"])
settings = Settings()


# Pydantic Schemas
class MessageContext(BaseModel):
    role: str  # user / assistant
    content: str


class GenerateRequest(BaseModel):
    keywords: List[str]
    tone: str = "polite"  # formal / casual / polite
    recipient_type: str = "colleague"  # boss / colleague / customer / vendor
    additional_instructions: Optional[str] = None
    context: Optional[List[MessageContext]] = None


class GeneratedEmail(BaseModel):
    subject: str
    body: str


class GenerateResponse(BaseModel):
    subject: str
    body: str
    suggestions: Optional[List[GeneratedEmail]] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class RecipientInfo(BaseModel):
    email: str
    name: Optional[str] = None
    department: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    tone: str = "polite"  # formal / casual / polite
    recipient_type: str = "colleague"  # boss / colleague / customer / vendor
    recipients: Optional[List[RecipientInfo]] = None  # 実際の宛先情報


class ChatResponse(BaseModel):
    message: str
    email: Optional[GeneratedEmail] = None
    done: bool = False


# トーンの日本語マッピング
TONE_MAP = {
    "formal": "フォーマル・堅い",
    "casual": "カジュアル・親しみやすい",
    "polite": "丁寧・礼儀正しい",
}

# 相手タイプの日本語マッピング
RECIPIENT_TYPE_MAP = {
    "boss": "上司",
    "colleague": "同僚",
    "customer": "顧客・お客様",
    "vendor": "取引先・協力会社",
}


def build_system_prompt(tone: str, recipient_type: str) -> str:
    """システムプロンプトを構築"""
    tone_desc = TONE_MAP.get(tone, "丁寧")
    recipient_desc = RECIPIENT_TYPE_MAP.get(recipient_type, "ビジネス相手")

    return f"""あなたは日本のビジネスメール作成を支援するアシスタントです。
以下の条件でメールを作成してください：

- トーン: {tone_desc}
- 宛先の関係性: {recipient_desc}

ルール：
1. 日本のビジネスマナーに沿った丁寧な文章を書く
2. 件名は簡潔かつ内容が分かるようにする
3. 本文は適切な挨拶から始める
4. 必要に応じて署名用のプレースホルダーを入れる

出力形式：
件名と本文を明確に分けて出力してください。
"""


def parse_email_response(content: str) -> tuple:
    """AI応答から件名と本文を抽出"""
    lines = content.strip().split("\n")
    subject = ""
    body_lines = []
    in_body = False

    for line in lines:
        line_lower = line.lower()
        if "件名" in line or "subject" in line_lower:
            # 件名行から件名を抽出
            if ":" in line:
                subject = line.split(":", 1)[1].strip()
            elif "：" in line:
                subject = line.split("：", 1)[1].strip()
            else:
                subject = line.replace("件名", "").replace("Subject", "").strip()
        elif "本文" in line or "body" in line_lower:
            in_body = True
        elif in_body or (subject and not in_body):
            # 本文部分
            if line.strip() or body_lines:
                body_lines.append(line)
            if not in_body and line.strip():
                in_body = True

    body = "\n".join(body_lines).strip()

    # 件名が見つからなかった場合
    if not subject and body:
        # 最初の行を件名として使用
        first_line = body.split("\n")[0].strip()
        if len(first_line) < 100:
            subject = first_line
            body = "\n".join(body.split("\n")[1:]).strip()

    return subject, body


@router.post("/generate", response_model=GenerateResponse)
async def generate_email(
    data: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """キーワードとパラメータからメールを生成"""
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured"
        )

    # プロンプト構築
    system_prompt = build_system_prompt(data.tone, data.recipient_type)
    user_prompt = f"以下のキーワードに基づいてビジネスメールを作成してください：\n\nキーワード: {', '.join(data.keywords)}"

    if data.additional_instructions:
        user_prompt += f"\n\n追加指示: {data.additional_instructions}"

    messages = [
        {"role": "system", "content": system_prompt},
    ]

    # コンテキストがあれば追加
    if data.context:
        for ctx in data.context:
            messages.append({"role": ctx.role, "content": ctx.content})

    messages.append({"role": "user", "content": user_prompt})

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
        )

        content = response.choices[0].message.content
        subject, body = parse_email_response(content)

        if not subject:
            subject = f"{data.keywords[0]}について" if data.keywords else "ご連絡"

        return GenerateResponse(
            subject=subject,
            body=body or content,
            suggestions=None,
        )

    except openai.APIError as e:
        raise HTTPException(status_code=503, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate email: {str(e)}")


def build_chat_system_prompt(tone: str, recipient_type: str, recipients: list = None) -> str:
    """チャット用のシステムプロンプトを構築"""
    tone_desc = TONE_MAP.get(tone, "丁寧")
    recipient_desc = RECIPIENT_TYPE_MAP.get(recipient_type, "ビジネス相手")

    # 宛先情報の文字列を構築
    recipient_info = ""
    if recipients:
        recipient_names = []
        for r in recipients[:5]:  # 最大5名まで表示
            if r.name:
                info = r.name
                if r.department:
                    info += f"（{r.department}）"
                recipient_names.append(info)
            else:
                recipient_names.append(r.email)
        if len(recipients) > 5:
            recipient_names.append(f"他{len(recipients) - 5}名")
        recipient_info = f"\n\n【宛先情報】\n送信先: {', '.join(recipient_names)}"

    return f"""あなたは日本のビジネスメール作成を支援するアシスタントです。
以下の設定に基づいてメール作成をサポートしてください：

【設定】
- トーン: {tone_desc}
- 相手との関係性: {recipient_desc}{recipient_info}

ユーザーの要望に応じて、適切なメールを作成してください。

ルール：
1. 設定されたトーンと関係性に合った文体を使う
2. 日本のビジネスマナーに沿った丁寧な文章を書く
3. 件名は簡潔かつ内容が分かるようにする
4. 本文は適切な挨拶から始める
5. 相手の名前が分かっている場合は適切に使用する

メールを提案する時は以下の形式で出力してください：

---
件名: [件名をここに]
本文:
[本文をここに]
---

ユーザーが修正を求めたら、修正版を提案してください。
"""


@router.post("/chat", response_model=ChatResponse)
async def chat_for_email(
    data: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """チャット形式でメール作成を支援"""
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured"
        )

    # トーン・相手・宛先情報を考慮したシステムプロンプトを構築
    recipients_data = [r.model_dump() for r in data.recipients] if data.recipients else None
    system_prompt = build_chat_system_prompt(data.tone, data.recipient_type, data.recipients)

    messages = [{"role": "system", "content": system_prompt}]
    for msg in data.messages:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
        )

        content = response.choices[0].message.content

        # メールが生成されたかチェック
        email = None
        done = False
        if "件名:" in content or "件名：" in content:
            subject, body = parse_email_response(content)
            if subject and body:
                email = GeneratedEmail(subject=subject, body=body)
                done = True

        return ChatResponse(
            message=content,
            email=email,
            done=done,
        )

    except openai.APIError as e:
        raise HTTPException(status_code=503, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
