"""
トーン自動判定サービス

宛先のメールアドレスから適切なトーン（敬語レベル）を判定する
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from backend.core.config import Settings

settings = Settings()


def get_internal_domains() -> List[str]:
    """内部ドメインのリストを取得"""
    # 環境変数から取得、なければデフォルト
    domains = settings.internal_domains if hasattr(settings, 'internal_domains') and settings.internal_domains else []
    if not domains:
        # デフォルトの内部ドメイン
        domains = ["prothentia.co.jp", "prothentia.com"]
    return [d.lower() for d in domains]


def is_external_email(email: str) -> bool:
    """外部メールアドレスかどうかを判定"""
    internal_domains = get_internal_domains()
    domain = email.lower().split("@")[-1] if "@" in email else ""
    return domain not in internal_domains


def determine_tone_from_recipients(
    to: List[str],
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    宛先からトーンを自動判定

    判定ロジック:
    1. 外部ドメインが含まれる → formal
    2. 内部のみ → polite

    将来的にはメーリングリストのカテゴリから判定

    Args:
        to: Toの宛先リスト
        cc: Ccの宛先リスト
        bcc: Bccの宛先リスト
        db: データベースセッション（将来のメーリングリスト検索用）

    Returns:
        suggested_tone: 推奨トーン
        reason: 判定理由
        details: 詳細情報
    """
    all_recipients = list(to or [])
    if cc:
        all_recipients.extend(cc)
    if bcc:
        all_recipients.extend(bcc)

    if not all_recipients:
        return {
            "suggested_tone": "polite",
            "reason": "宛先が指定されていません",
            "details": []
        }

    # 外部メールをチェック
    external_emails = []
    internal_emails = []
    details = []

    for email in all_recipients:
        is_external = is_external_email(email)
        domain = email.split("@")[-1] if "@" in email else ""

        if is_external:
            external_emails.append(email)
            details.append({
                "email": email,
                "domain": domain,
                "category": "external",
                "formality": "formal"
            })
        else:
            internal_emails.append(email)
            details.append({
                "email": email,
                "domain": domain,
                "category": "internal",
                "formality": "polite"
            })

    # 判定: 外部が含まれていればformal
    if external_emails:
        # 外部ドメインを抽出
        external_domains = list(set([e.split("@")[-1] for e in external_emails]))
        domain_str = "、".join(external_domains[:3])
        if len(external_domains) > 3:
            domain_str += f" 他{len(external_domains) - 3}ドメイン"

        return {
            "suggested_tone": "formal",
            "reason": f"社外ドメイン ({domain_str}) が含まれています",
            "details": details,
            "external_count": len(external_emails),
            "internal_count": len(internal_emails)
        }

    # 内部のみ
    return {
        "suggested_tone": "polite",
        "reason": "社内メールのみです",
        "details": details,
        "external_count": 0,
        "internal_count": len(internal_emails)
    }
