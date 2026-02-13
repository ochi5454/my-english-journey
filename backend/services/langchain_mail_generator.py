"""
Langchainベースのメール生成サービス

宛先名・送信者名の自動挿入を強制するプロンプトテンプレートを使用
"""
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from backend.core.config import Settings

settings = Settings()


@dataclass
class RecipientInfo:
    """宛先情報"""
    email: str
    name: Optional[str] = None
    department: Optional[str] = None


@dataclass
class SenderInfo:
    """送信者情報"""
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None  # 役職


@dataclass
class GeneratedMailResult:
    """生成結果"""
    subject: str
    body: str
    recipient_name_used: bool  # 宛先名が使用されたか
    sender_name_used: bool  # 送信者名が使用されたか


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


# システムプロンプトテンプレート（名前挿入ルールを強制）
MAIL_GENERATION_SYSTEM_TEMPLATE = """あなたはビジネスメール作成アシスタントです。以下のルールを【必ず】守ってください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【必須ルール - 絶対に守ること】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 宛先名「{recipient_name}」を本文の冒頭に必ず入れること
   - 形式: 「{recipient_name}様」または「{recipient_name} 様」
   - 部署が分かっている場合: 「{recipient_department} {recipient_name}様」

2. 送信者名「{sender_name}」を本文の末尾（署名部分）に必ず入れること
   - 形式例:
     {sender_department}
     {sender_name}

3. これらの名前は省略してはならない

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【メール作成条件】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- トーン: {tone}
- 宛先との関係: {recipient_type}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【文体ルール】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 日本のビジネスマナーに沿った丁寧な文章を書く
2. 件名は簡潔かつ内容が分かるようにする
3. 本文は適切な挨拶から始める（例：「いつもお世話になっております」）
4. 敬語を適切に使用する

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【出力形式】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
以下の形式で出力してください：

---
件名: [件名をここに]
本文:
[本文をここに]
---
"""

# チャット用システムプロンプトテンプレート（段階的質問フロー）
CHAT_SYSTEM_TEMPLATE = """あなたは日本のビジネスメール作成を支援するアシスタントです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【重要：段階的な質問フロー】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
メールを生成する前に、以下の情報を2-3回のやり取りで確認してください。
一度に全部聞かず、会話形式で自然に聞き出すこと。

【確認すべき情報】
1. メールの目的・用件（何を伝えたいか）
2. 具体的な内容・詳細（日時、場所、理由など）
3. 相手に求めるアクション（返信期限、確認事項など）

【会話の流れ】
- 1回目: ユーザーの最初のメッセージを受けて、用件を理解し、不足している詳細を1つ質問する
- 2回目: 回答を受けて、さらに必要な情報を1つ質問する（または確認する）
- 3回目: 十分な情報が集まったら、メールを生成する

【注意】
- 質問は1回に1つだけ。複数の質問を一度にしない
- 短く簡潔な質問を心がける
- ユーザーが「生成して」「作成して」と言ったら、その時点でメールを生成する

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【必須ルール - メール生成時に絶対に守ること】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{name_rules}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【設定】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- トーン: {tone}
- 相手との関係性: {recipient_type}
{recipient_info}
{sender_info}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【文体ルール】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 設定されたトーンと関係性に合った文体を使う
2. 日本のビジネスマナーに沿った丁寧な文章を書く
3. 件名は簡潔かつ内容が分かるようにする
4. 本文は適切な挨拶から始める

メールを提案する時は以下の形式で出力してください：

---
件名: [件名をここに]
本文:
[本文をここに]
---

ユーザーが修正を求めたら、修正版を提案してください。
"""


def _build_name_rules(recipient: Optional[RecipientInfo], sender: Optional[SenderInfo]) -> str:
    """名前挿入ルールを構築"""
    rules = []

    if recipient and recipient.name:
        rules.append(f"1. 宛先名「{recipient.name}」を本文の冒頭に必ず入れること（{recipient.name}様）")
    else:
        rules.append("1. 宛先名が不明の場合は「ご担当者様」を使用すること")

    if sender and sender.name:
        dept_info = f"（{sender.department}）" if sender.department else ""
        rules.append(f"2. 送信者名「{sender.name}」を本文の末尾（署名部分）に必ず入れること{dept_info}")
    else:
        rules.append("2. 署名には送信者名のプレースホルダー「[送信者名]」を入れること")

    rules.append("3. これらの名前は省略してはならない")

    return "\n".join(rules)


def _format_recipient_info(recipients: Optional[List[RecipientInfo]]) -> str:
    """宛先情報の文字列を構築"""
    if not recipients:
        return ""

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

    return f"\n【宛先情報】\n送信先: {', '.join(recipient_names)}"


def _format_sender_info(sender: Optional[SenderInfo]) -> str:
    """送信者情報の文字列を構築"""
    if not sender:
        return ""

    parts = ["\n【送信者情報】"]
    parts.append(f"名前: {sender.name}")
    if sender.department:
        parts.append(f"部署: {sender.department}")
    if sender.title:
        parts.append(f"役職: {sender.title}")

    return "\n".join(parts)


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

    # "---" で囲まれている場合の処理
    if body.startswith("---"):
        body = body[3:].strip()
    if body.endswith("---"):
        body = body[:-3].strip()

    # 件名が見つからなかった場合
    if not subject and body:
        # 最初の行を件名として使用
        first_line = body.split("\n")[0].strip()
        if len(first_line) < 100:
            subject = first_line
            body = "\n".join(body.split("\n")[1:]).strip()

    return subject, body


def verify_name_insertion(body: str, recipient_name: Optional[str], sender_name: Optional[str]) -> tuple:
    """名前が正しく挿入されているか検証"""
    recipient_used = False
    sender_used = False

    if recipient_name:
        # 宛先名が本文に含まれているか
        recipient_used = recipient_name in body or f"{recipient_name}様" in body
    else:
        # 宛先名が不明の場合、「ご担当者様」が使われているか
        recipient_used = "ご担当者様" in body or "様" in body[:50]  # 冒頭50文字以内に「様」があるか

    if sender_name:
        # 送信者名が本文に含まれているか
        sender_used = sender_name in body
    else:
        sender_used = True  # 送信者名が指定されていない場合はOK

    return recipient_used, sender_used


class LangchainMailGenerator:
    """Langchainベースのメール生成クラス"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.openai_api_key
        if not self.api_key:
            raise ValueError("OpenAI API key is not configured")

        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            api_key=self.api_key,
        )

    def generate_email(
        self,
        keywords: List[str],
        tone: str = "polite",
        recipient_type: str = "colleague",
        recipient: Optional[RecipientInfo] = None,
        sender: Optional[SenderInfo] = None,
        additional_instructions: Optional[str] = None,
    ) -> GeneratedMailResult:
        """メールを生成（名前挿入を強制）"""

        tone_desc = TONE_MAP.get(tone, "丁寧")
        recipient_type_desc = RECIPIENT_TYPE_MAP.get(recipient_type, "ビジネス相手")

        # プロンプトテンプレートを構築
        system_template = MAIL_GENERATION_SYSTEM_TEMPLATE.format(
            recipient_name=recipient.name if recipient and recipient.name else "ご担当者",
            recipient_department=recipient.department if recipient and recipient.department else "",
            sender_name=sender.name if sender else "[送信者名]",
            sender_department=sender.department if sender else "[部署名]",
            tone=tone_desc,
            recipient_type=recipient_type_desc,
        )

        # ユーザープロンプト
        user_content = f"以下のキーワードに基づいてビジネスメールを作成してください：\n\nキーワード: {', '.join(keywords)}"
        if additional_instructions:
            user_content += f"\n\n追加指示: {additional_instructions}"

        # Langchainで生成
        prompt = ChatPromptTemplate.from_messages([
            SystemMessagePromptTemplate.from_template("{system}"),
            HumanMessagePromptTemplate.from_template("{user}"),
        ])

        chain = prompt | self.llm | StrOutputParser()

        result = chain.invoke({
            "system": system_template,
            "user": user_content,
        })

        # 結果をパース
        subject, body = parse_email_response(result)

        if not subject:
            subject = f"{keywords[0]}について" if keywords else "ご連絡"

        # 名前挿入の検証
        recipient_name_used, sender_name_used = verify_name_insertion(
            body,
            recipient.name if recipient else None,
            sender.name if sender else None,
        )

        return GeneratedMailResult(
            subject=subject,
            body=body or result,
            recipient_name_used=recipient_name_used,
            sender_name_used=sender_name_used,
        )

    def chat_generate(
        self,
        messages: List[Dict[str, str]],
        tone: str = "polite",
        recipient_type: str = "colleague",
        recipients: Optional[List[RecipientInfo]] = None,
        sender: Optional[SenderInfo] = None,
    ) -> Dict[str, Any]:
        """チャット形式でメール作成を支援"""

        tone_desc = TONE_MAP.get(tone, "丁寧")
        recipient_type_desc = RECIPIENT_TYPE_MAP.get(recipient_type, "ビジネス相手")

        # 最初の宛先を取得
        primary_recipient = recipients[0] if recipients else None

        # 名前挿入ルールを構築
        name_rules = _build_name_rules(primary_recipient, sender)

        # システムプロンプトを構築
        system_content = CHAT_SYSTEM_TEMPLATE.format(
            name_rules=name_rules,
            tone=tone_desc,
            recipient_type=recipient_type_desc,
            recipient_info=_format_recipient_info(recipients),
            sender_info=_format_sender_info(sender),
        )

        # メッセージリストを構築
        langchain_messages = [SystemMessage(content=system_content)]

        for msg in messages:
            if msg["role"] == "user":
                langchain_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                langchain_messages.append(AIMessage(content=msg["content"]))

        # 生成
        response = self.llm.invoke(langchain_messages)
        content = response.content

        # メールが生成されたかチェック
        email = None
        done = False
        recipient_name_used = False
        sender_name_used = False

        if "件名:" in content or "件名：" in content:
            subject, body = parse_email_response(content)
            if subject and body:
                # 名前挿入の検証
                recipient_name_used, sender_name_used = verify_name_insertion(
                    body,
                    primary_recipient.name if primary_recipient else None,
                    sender.name if sender else None,
                )

                email = {
                    "subject": subject,
                    "body": body,
                    "recipient_name_used": recipient_name_used,
                    "sender_name_used": sender_name_used,
                }
                done = True

        return {
            "message": content,
            "email": email,
            "done": done,
        }


# シングルトンインスタンスを提供する関数
_generator_instance: Optional[LangchainMailGenerator] = None


def get_mail_generator() -> LangchainMailGenerator:
    """メール生成サービスのインスタンスを取得"""
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = LangchainMailGenerator()
    return _generator_instance
