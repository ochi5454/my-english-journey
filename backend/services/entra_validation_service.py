"""
Entra比較バリデーションサービス

アップロードされた宛先リストをEntraデータと比較し、
情報の不一致を検出するサービス。

※ UI上では「Entra」という言葉は使用しない（裏側の処理として実行）

使用方法:
    from backend.services.entra_validation_service import EntraValidationService

    service = EntraValidationService(db)
    result = await service.validate_recipient_list(members, access_token)
"""

import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from sqlalchemy.orm import Session
import httpx

from backend.models.organization import EmployeeAssignment
from backend.models.recipient import RecipientListMember
from backend.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ValidationWarning:
    """バリデーション警告"""
    email: str
    warning_type: str  # 'info_mismatch', 'not_found'
    message: str
    details: Optional[Dict[str, Any]] = None


@dataclass
class ValidationResult:
    """バリデーション結果"""
    warnings: List[ValidationWarning] = field(default_factory=list)
    matched: int = 0
    mismatched: int = 0
    not_found: int = 0
    total: int = 0
    checked_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def requires_confirmation(self) -> bool:
        return len(self.warnings) > 0

    def to_dict(self) -> Dict[str, Any]:
        """辞書形式に変換"""
        return {
            "warnings": [
                {
                    "email": w.email,
                    "warning_type": w.warning_type,
                    "message": w.message,
                    "details": w.details,
                }
                for w in self.warnings
            ],
            "matched": self.matched,
            "mismatched": self.mismatched,
            "not_found": self.not_found,
            "total": self.total,
            "checked_at": self.checked_at.isoformat(),
            "requires_confirmation": self.requires_confirmation,
        }


class EntraValidationService:
    """
    Entra比較バリデーションサービス

    アップロードされた宛先リストをEntraデータと比較するサービス。
    ローカルキャッシュ（EmployeeAssignment）を優先し、
    なければEntra APIを呼び出す。

    ※ UI上では「Entra」という言葉は使用しない
    """

    def __init__(self, db: Session):
        self.db = db

    async def validate_recipient_list(
        self,
        members: List[RecipientListMember],
        access_token: Optional[str] = None,
    ) -> ValidationResult:
        """
        宛先リストの各メンバーをEntraデータと比較

        Args:
            members: 検証対象のメンバーリスト
            access_token: Entra APIアクセストークン（オプション）

        Returns:
            ValidationResult: 検証結果
        """
        warnings: List[ValidationWarning] = []
        matched = 0
        mismatched = 0
        not_found = 0

        for member in members:
            # Entraからユーザー情報を取得（ローカルキャッシュ優先）
            entra_user = await self._fetch_entra_user_by_email(
                member.email, access_token
            )

            if entra_user is None:
                not_found += 1
                warnings.append(ValidationWarning(
                    email=member.email,
                    warning_type="not_found",
                    message="社内アカウントで同一情報が確認できませんでした",
                ))
            else:
                # 各フィールドを比較
                mismatches = self._compare_fields(member, entra_user)
                if mismatches:
                    mismatched += 1
                    # 不一致の詳細メッセージを生成
                    detail_messages = []
                    for field_name, diff in mismatches.items():
                        field_label = {
                            "name": "名前",
                            "department": "部署",
                            "position": "役職",
                        }.get(field_name, field_name)
                        detail_messages.append(
                            f"{field_label}が異なります（登録: {diff['uploaded']} → 現在: {diff['current']}）"
                        )

                    warnings.append(ValidationWarning(
                        email=member.email,
                        warning_type="info_mismatch",
                        message="登録情報と現在の情報が異なる可能性があります",
                        details=mismatches,
                    ))
                else:
                    matched += 1

        return ValidationResult(
            warnings=warnings,
            matched=matched,
            mismatched=mismatched,
            not_found=not_found,
            total=len(members),
        )

    async def validate_emails(
        self,
        emails: List[str],
        access_token: Optional[str] = None,
    ) -> ValidationResult:
        """
        メールアドレスリストを検証（送信前チェック用）

        Args:
            emails: 検証対象のメールアドレスリスト
            access_token: Entra APIアクセストークン（オプション）

        Returns:
            ValidationResult: 検証結果
        """
        warnings: List[ValidationWarning] = []
        matched = 0
        not_found = 0

        for email in emails:
            entra_user = await self._fetch_entra_user_by_email(email, access_token)

            if entra_user is None:
                not_found += 1
                warnings.append(ValidationWarning(
                    email=email,
                    warning_type="not_found",
                    message="社内アカウントで同一情報が確認できませんでした",
                ))
            else:
                matched += 1

        return ValidationResult(
            warnings=warnings,
            matched=matched,
            mismatched=0,
            not_found=not_found,
            total=len(emails),
        )

    async def _fetch_entra_user_by_email(
        self,
        email: str,
        access_token: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        メールアドレスからEntraユーザー情報を取得

        1. まずローカルDB（EmployeeAssignment）を検索
        2. なければEntra APIを呼び出し

        Args:
            email: メールアドレス
            access_token: Entra APIアクセストークン

        Returns:
            ユーザー情報の辞書、見つからない場合はNone
        """
        # 1. ローカルキャッシュから検索
        local_user = self._search_local_cache(email)
        if local_user:
            logger.debug(f"Found user in local cache: {email}")
            return local_user

        # 2. ローカルになければEntra APIを呼び出し
        if access_token:
            entra_user = await self._call_graph_api_for_user(email, access_token)
            if entra_user:
                logger.debug(f"Found user via Entra API: {email}")
                return entra_user

        logger.debug(f"User not found: {email}")
        return None

    def _search_local_cache(self, email: str) -> Optional[Dict[str, Any]]:
        """
        ローカルキャッシュ（EmployeeAssignment）からユーザーを検索

        Args:
            email: メールアドレス

        Returns:
            ユーザー情報の辞書、見つからない場合はNone
        """
        local_user = self.db.query(EmployeeAssignment).filter(
            EmployeeAssignment.email == email
        ).first()

        if local_user:
            # 組織名を取得
            org_name = None
            if local_user.organization:
                org_name = local_user.organization.name

            return {
                "displayName": local_user.display_name,
                "mail": local_user.email,
                "department": org_name,
                "jobTitle": local_user.job_title,
                "source": "local_cache",
            }

        return None

    async def _call_graph_api_for_user(
        self,
        email: str,
        access_token: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Microsoft Graph APIを呼び出してユーザー情報を取得

        Args:
            email: メールアドレス
            access_token: Entra APIアクセストークン

        Returns:
            ユーザー情報の辞書、見つからない場合はNone
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # メールアドレスでフィルタリング
                response = await client.get(
                    "https://graph.microsoft.com/v1.0/users",
                    params={
                        "$filter": f"mail eq '{email}'",
                        "$select": "id,displayName,mail,department,jobTitle",
                        "$top": "1",
                    },
                    headers={
                        "Authorization": f"Bearer {access_token}",
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    users = data.get("value", [])
                    if users:
                        user = users[0]
                        return {
                            "displayName": user.get("displayName"),
                            "mail": user.get("mail"),
                            "department": user.get("department"),
                            "jobTitle": user.get("jobTitle"),
                            "source": "entra_api",
                        }
                elif response.status_code == 401:
                    logger.warning("Entra API access token expired or invalid")
                else:
                    logger.warning(f"Entra API error: {response.status_code} - {response.text}")

        except httpx.RequestError as e:
            logger.error(f"Failed to connect to Graph API: {e}")
        except Exception as e:
            logger.error(f"Unexpected error calling Graph API: {e}")

        return None

    def _compare_fields(
        self,
        member: RecipientListMember,
        entra_user: Dict[str, Any],
    ) -> Dict[str, Dict[str, str]]:
        """
        フィールドを比較し、不一致を検出

        Args:
            member: 宛先リストメンバー
            entra_user: Entraユーザー情報

        Returns:
            不一致のあるフィールドの辞書
        """
        mismatches = {}

        # 名前の比較
        if member.name and entra_user.get("displayName"):
            if not self._is_name_match(member.name, entra_user["displayName"]):
                mismatches["name"] = {
                    "uploaded": member.name,
                    "current": entra_user["displayName"],
                }

        # 部署の比較
        if member.department and entra_user.get("department"):
            if not self._is_department_match(member.department, entra_user["department"]):
                mismatches["department"] = {
                    "uploaded": member.department,
                    "current": entra_user["department"],
                }

        # 役職の比較
        if member.position and entra_user.get("jobTitle"):
            if not self._is_position_match(member.position, entra_user["jobTitle"]):
                mismatches["position"] = {
                    "uploaded": member.position,
                    "current": entra_user["jobTitle"],
                }

        return mismatches

    def _is_name_match(self, uploaded: str, current: str) -> bool:
        """
        名前が一致するかを判定（部分一致も考慮）

        日本語の名前では姓名の順序やスペースの有無が異なることがあるため、
        ある程度柔軟にマッチングする。
        """
        # 完全一致
        if uploaded == current:
            return True

        # 空白を除去して比較
        uploaded_normalized = uploaded.replace(" ", "").replace("　", "")
        current_normalized = current.replace(" ", "").replace("　", "")
        if uploaded_normalized == current_normalized:
            return True

        # 一方が他方に含まれる場合（姓のみ/名のみの場合など）
        if uploaded_normalized in current_normalized or current_normalized in uploaded_normalized:
            return True

        return False

    def _is_department_match(self, uploaded: str, current: str) -> bool:
        """
        部署名が一致するかを判定（部分一致も考慮）
        """
        # 完全一致
        if uploaded == current:
            return True

        # 部分一致（略称などを考慮）
        if uploaded in current or current in uploaded:
            return True

        return False

    def _is_position_match(self, uploaded: str, current: str) -> bool:
        """
        役職が一致するかを判定
        """
        # 完全一致
        if uploaded == current:
            return True

        # 部分一致
        if uploaded in current or current in uploaded:
            return True

        return False
