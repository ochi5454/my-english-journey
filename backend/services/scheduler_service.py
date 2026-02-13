"""
予約メール送信スケジューラサービス

APSchedulerを使用して、予約されたメールを定期的に処理します。
"""
import logging
import os
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.config import Settings
from backend.models.scheduled_mail import ScheduledMail
from backend.models.mail_log import MailSendLog
from backend.models.token_store import TokenStore
from backend.models.user import User
from backend.services.graph_mail_service import send_mail_via_graph, GraphMailAttachment

logger = logging.getLogger(__name__)
settings = Settings()

# グローバルスケジューラインスタンス
scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    """グローバルスケジューラインスタンスを取得または作成"""
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
    return scheduler


async def process_scheduled_mails():
    """
    予約メール処理ジョブ

    毎分実行され、送信予定時刻を過ぎた予約メールを送信します。

    処理フロー:
    1. pending状態かつ scheduled_at <= now のメールを取得
    2. 各メールについて:
       a. ステータスを processing に更新（並行処理の競合防止）
       b. ユーザーのトークンを取得
       c. Graph API でメール送信
       d. 結果に応じて status を sent/failed に更新
       e. MailSendLog に記録
    """
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()

        # 送信予定時刻を過ぎた pending メールを取得
        pending_mails = db.query(ScheduledMail).filter(
            ScheduledMail.status == "pending",
            ScheduledMail.scheduled_at <= now
        ).all()

        if not pending_mails:
            return

        logger.info(f"Processing {len(pending_mails)} scheduled mails")

        for mail in pending_mails:
            await _process_single_mail(db, mail)

    except Exception as e:
        logger.error(f"Error in scheduled mail processing: {e}")
    finally:
        db.close()


async def _process_single_mail(db: Session, mail: ScheduledMail):
    """単一の予約メールを処理"""
    token_store = None
    error_message = None

    try:
        # processing に更新（重複処理を防止）
        mail.status = "processing"
        db.commit()

        # ユーザーのトークンを取得
        token_store = db.query(TokenStore).filter(
            TokenStore.user_sub == str(mail.user_id)
        ).first()

        if not token_store or not token_store.access_token:
            raise ValueError(
                "ユーザーのアクセストークンがありません。"
                "再度Entra IDでログインしてください。"
            )

        # 添付ファイルを準備
        attachments = []
        if mail.attachments:
            for att_info in mail.attachments:
                file_data = _get_stored_attachment_data(att_info)
                if file_data:
                    attachments.append(GraphMailAttachment(
                        filename=att_info.get("filename", "attachment"),
                        data=file_data,
                        content_type=att_info.get("content_type", "application/octet-stream"),
                    ))

        # Graph API でメール送信
        result = await send_mail_via_graph(
            settings=settings,
            to=mail.to_addresses,
            subject=mail.subject,
            body=mail.body,
            attachments=attachments if attachments else None,
            access_token=token_store.access_token,
            refresh_token=token_store.refresh_token,
            token_expires_at=token_store.token_expires_at,
        )

        # 成功 - 予約メールを更新
        mail.status = "sent"
        mail.sent_at = datetime.utcnow()
        mail.graph_message_id = result.get("message_id")

        # 送信ログを作成
        log = MailSendLog(
            user_id=mail.user_id,
            to_addresses=mail.to_addresses,
            cc_addresses=mail.cc_addresses,
            bcc_addresses=mail.bcc_addresses,
            subject=mail.subject,
            body=mail.body,
            body_type=mail.body_type,
            attachments=mail.attachments,
            status="success",
            graph_message_id=mail.graph_message_id,
            sent_at=mail.sent_at,
        )
        db.add(log)
        db.flush()
        mail.mail_log_id = log.id

        db.commit()
        logger.info(f"Scheduled mail {mail.id} sent successfully")

    except Exception as e:
        error_message = str(e)
        logger.error(f"Failed to send scheduled mail {mail.id}: {error_message}")

        mail.status = "failed"
        mail.error_message = error_message
        mail.retry_count += 1

        # 失敗ログを作成
        log = MailSendLog(
            user_id=mail.user_id,
            to_addresses=mail.to_addresses,
            cc_addresses=mail.cc_addresses,
            bcc_addresses=mail.bcc_addresses,
            subject=mail.subject,
            body=mail.body,
            body_type=mail.body_type,
            attachments=mail.attachments,
            status="failed",
            error_message=error_message,
            sent_at=datetime.utcnow(),
        )
        db.add(log)
        db.flush()
        mail.mail_log_id = log.id

        db.commit()

        # 失敗通知メールを送信（トークンがある場合のみ）
        if token_store and token_store.access_token:
            await _send_failure_notification(db, mail, token_store, error_message)


def _get_stored_attachment_data(att_info: dict) -> Optional[bytes]:
    """
    添付ファイルのデータを取得

    予約送信の場合、添付ファイルは送信時まで保持されている必要があります。
    """
    file_path = att_info.get("file_path")
    if file_path and os.path.exists(file_path):
        with open(file_path, "rb") as f:
            return f.read()
    return None


async def _send_failure_notification(
    db: Session,
    mail: ScheduledMail,
    token_store: TokenStore,
    error_message: str
):
    """
    送信失敗時の通知メールを送信

    ユーザー自身のアカウントから自分宛に通知メールを送信する。
    トークン切れなどで通知も送れない場合はログに記録して終了。
    """
    try:
        # ユーザーのメールアドレスを取得
        user = db.query(User).filter(User.id == mail.user_id).first()
        if not user or not user.email:
            logger.warning(f"Cannot send failure notification: user email not found for mail {mail.id}")
            return

        # 予約日時をローカル時刻でフォーマット
        scheduled_at_str = mail.scheduled_at.strftime("%Y-%m-%d %H:%M") if mail.scheduled_at else "不明"

        notification_subject = "【送信失敗】予約メールの送信に失敗しました"
        notification_body = f"""予約メールの送信に失敗しました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 失敗したメールの情報
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
件名: {mail.subject}
宛先: {', '.join(mail.to_addresses) if mail.to_addresses else '(なし)'}
予約日時: {scheduled_at_str} (UTC)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ エラー内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{error_message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 対処方法
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
予約送信ページから再度送信を試みるか、内容を確認してください。
"""

        await send_mail_via_graph(
            settings=settings,
            to=[user.email],
            subject=notification_subject,
            body=notification_body,
            access_token=token_store.access_token,
            refresh_token=token_store.refresh_token,
            token_expires_at=token_store.token_expires_at,
        )
        logger.info(f"Failure notification sent for scheduled mail {mail.id} to {user.email}")

    except Exception as e:
        # 通知メール送信も失敗した場合はログのみ
        logger.error(f"Failed to send failure notification for mail {mail.id}: {e}")


def start_scheduler():
    """スケジューラを開始"""
    global scheduler
    scheduler = get_scheduler()

    # 予約メール処理ジョブを追加（毎分実行）
    scheduler.add_job(
        process_scheduled_mails,
        IntervalTrigger(minutes=1),
        id="process_scheduled_mails",
        name="Process scheduled mails",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started - processing scheduled mails every minute")


def stop_scheduler():
    """スケジューラを停止"""
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=True)
        scheduler = None
        logger.info("Scheduler stopped")
