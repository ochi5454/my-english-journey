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
    field: Optional[str] = None  # 'to' / 'cc' / 'bcc'


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

# チャット用システムプロンプトテンプレート（即座にドラフト生成）
CHAT_SYSTEM_TEMPLATE = """あなたは日本のビジネスメール作成を支援するアシスタントです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【重要：即座にドラフト生成】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ユーザーからメールの要件を受けたら、【質問せずに】すぐにドラフトを作成してください。

【動作ルール】
1. 最初のメッセージでいきなりメールのドラフトを生成する
2. 不明な点があっても、一般的な内容で仮のドラフトを作成する
3. ドラフトの後に「以下の点を調整できます」と提案する

【調整可能な点の例】
- 会議の具体的な日時
- 参加者の名前
- 会議の目的の詳細
- トーンの変更

【なぜこうするか】
- ユーザーはドラフトを先に見たい
- 質問が多いと面倒に感じる
- ドラフトを見てから修正点を指示する方が楽

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
5. 語尾のバリエーションを持たせる（「思います」「存じます」「いたします」の連続を避ける）

メールを提案する時は以下の形式で出力してください：

---
件名: [件名をここに]
本文:
[本文をここに]
---

その後、短く「上記で調整したい点があればお知らせください」と添える。
ユーザーが修正を求めたら、修正版を提案してください。
"""


def _build_name_rules(recipients: Optional[List[RecipientInfo]], sender: Optional[SenderInfo]) -> str:
    """名前挿入ルールを構築（全宛先対応）"""
    rules = []

    if recipients:
        # 名前がある宛先を抽出
        named_recipients = [r for r in recipients if r.name]
        if named_recipients:
            if len(named_recipients) == 1:
                r = named_recipients[0]
                rules.append(f"1. 宛先名「{r.name}」を本文の冒頭に必ず入れること（{r.name}様）")
            else:
                # 複数人の場合
                names = [r.name for r in named_recipients[:5]]
                names_str = "、".join(names)
                if len(named_recipients) > 5:
                    names_str += f" 他{len(named_recipients) - 5}名"
                rules.append(f"1. 複数の宛先がいるため、本文冒頭に「{names_str} 様」または「皆様」を入れること")
        else:
            rules.append("1. 宛先名が不明の場合は「ご担当者様」を使用すること")
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
    """宛先情報の文字列を構築（To/Cc/Bcc別）"""
    if not recipients:
        return ""

    # To/Cc/Bccで分類
    to_list = []
    cc_list = []
    bcc_list = []

    for r in recipients:
        name_str = r.name if r.name else r.email
        if r.department and r.name:
            name_str += f"（{r.department}）"
        field = r.field or 'to'
        if field == 'to':
            to_list.append(name_str)
        elif field == 'cc':
            cc_list.append(name_str)
        elif field == 'bcc':
            bcc_list.append(name_str)

    recipient_lines = []
    if to_list:
        names = ', '.join(to_list[:5])
        if len(to_list) > 5:
            names += f" 他{len(to_list) - 5}名"
        recipient_lines.append(f"To: {names}")
    if cc_list:
        names = ', '.join(cc_list[:5])
        if len(cc_list) > 5:
            names += f" 他{len(cc_list) - 5}名"
        recipient_lines.append(f"Cc: {names}")
    if bcc_list:
        names = ', '.join(bcc_list[:5])
        if len(bcc_list) > 5:
            names += f" 他{len(bcc_list) - 5}名"
        recipient_lines.append(f"Bcc: {names}")

    if recipient_lines:
        return "\n【宛先情報】\n" + "\n".join(recipient_lines)
    return ""


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


def verify_name_insertion(body: str, recipients: Optional[List[RecipientInfo]], sender_name: Optional[str]) -> tuple:
    """名前が正しく挿入されているか検証（全宛先対応）"""
    recipient_used = False
    sender_used = False

    if recipients:
        named_recipients = [r for r in recipients if r.name]
        if named_recipients:
            # 少なくとも1人の名前が含まれているか、または「皆様」が使われているか
            for r in named_recipients:
                if r.name in body or f"{r.name}様" in body:
                    recipient_used = True
                    break
            if not recipient_used:
                # 複数人の場合は「皆様」でもOK
                recipient_used = "皆様" in body or "各位" in body
        else:
            # 宛先名が不明の場合、「ご担当者様」が使われているか
            recipient_used = "ご担当者様" in body or "様" in body[:50]
    else:
        # 宛先が不明の場合、「ご担当者様」が使われているか
        recipient_used = "ご担当者様" in body or "様" in body[:50]

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

        # 名前挿入の検証（単一宛先をリストに変換）
        recipient_list = [recipient] if recipient else None
        recipient_name_used, sender_name_used = verify_name_insertion(
            body,
            recipient_list,
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

        # 名前挿入ルールを構築（全宛先を渡す）
        name_rules = _build_name_rules(recipients, sender)

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
                # 名前挿入の検証（全宛先を渡す）
                recipient_name_used, sender_name_used = verify_name_insertion(
                    body,
                    recipients,
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
