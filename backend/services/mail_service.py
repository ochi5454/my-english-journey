import ssl
import smtplib
from collections import defaultdict
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from io import BytesIO
from typing import Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.export_cursor_service import (
    OVERTIME_COLUMNS,
    _build_colmap,
    _dataset_to_rows,
    _pick,
    build_overtime_detail_rows,
)


@dataclass
class Recipient:
    emp_no: str
    name: str
    email: str
    org6: str


def _latest_dataset(db: Session, kind: str) -> Optional[Dataset]:
    return (
        db.query(Dataset)
        .filter(Dataset.kind == kind, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )


def _load_recipients(person_ds: Dataset) -> List[Recipient]:
    headers, rows = _dataset_to_rows(person_ds)
    colmap = _build_colmap(headers)
    recipients: List[Recipient] = []
    for r in rows:
        email = _pick(r, colmap, "email").strip()
        org6 = _pick(r, colmap, "org6").strip()
        if not email or not org6:
            continue
        recipients.append(
            Recipient(
                emp_no=_pick(r, colmap, "emp_no").strip(),
                name=_pick(r, colmap, "name").strip() or "各位",
                email=email,
                org6=org6,
            )
        )
    return recipients


def _build_overtime_by_org6(schedule: Dataset, punches: Dataset, org_info: Optional[Dataset]) -> Dict[str, List[List[str]]]:
    rows = build_overtime_detail_rows(schedule, punches, org_info)
    grouped: Dict[str, List[List[str]]] = defaultdict(list)
    for row in rows:
        key = (row[4] or "").strip()  # org6 は OVERTIME_COLUMNS の5列目
        if key:
            grouped[key].append(row)
    return grouped


def _render_body(settings: Settings, recipient_name: str) -> str:
    company = settings.mail_company or "（会社名）"
    dept = settings.mail_department or "（部署名）"
    sender = settings.mail_sender_name or settings.mail_from_name or settings.mail_from or "（あなたの名前）"
    return f"""{recipient_name}様

お疲れ様です。
{company}／{dept}の{sender}です。

さて、勤怠記録を確認したところ、{recipient_name}様の直近の残業時間が、当社で定めている一定時間を超過している状況であることを確認いたしました。

業務の繁忙等によりご負担がかかっていることと存じますが、健康管理および労務管理の観点から、現在の業務状況について一度確認・相談のお時間をいただければと考えております。

今後の業務配分や進め方について調整が必要な場合もございますので、ご都合のよい日時をお知らせください。

お手数をおかけいたしますが、何卒よろしくお願いいたします。

――――――――――
{company}
{dept}
{sender}
――――――――――
"""


def _build_attachment(rows: List[List[str]]) -> Tuple[str, BytesIO]:
    df = pd.DataFrame(rows or [], columns=OVERTIME_COLUMNS)
    buf = BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    filename = "overtime_detail.xlsx"
    return filename, buf


def _send_email(settings: Settings, to: str, subject: str, body: str, attachment: Tuple[str, BytesIO]):
    if not settings.smtp_host:
        raise ValueError("SMTP_HOST is not configured")
    msg = EmailMessage()
    sender_name = settings.mail_from_name or settings.mail_sender_name or ""
    msg["From"] = formataddr((sender_name, settings.mail_from))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if attachment:
        fname, buf = attachment
        msg.add_attachment(
            buf.getvalue(),
            maintype="application",
            subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=fname,
        )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        if settings.smtp_use_tls:
            context = ssl.create_default_context()
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)


def send_overtime_emails(db: Session, settings: Settings) -> Dict:
    # 1) 必要データセットを取得
    person_ds = _latest_dataset(db, "person_progress")
    schedule_ds = _latest_dataset(db, "schedule_input")
    punch_ds = _latest_dataset(db, "punches")
    org_ds = _latest_dataset(db, "org_info")

    if not person_ds or not schedule_ds or not punch_ds:
        missing = [k for k, ds in [("person_progress", person_ds), ("schedule_input", schedule_ds), ("punches", punch_ds)] if not ds]
        raise ValueError(f"datasets not ready: {', '.join(missing)}")

    recipients = _load_recipients(person_ds)
    overtime_by_org6 = _build_overtime_by_org6(schedule_ds, punch_ds, org_ds)

    results = {"sent": [], "skipped": []}
    subject = "残業時間確認のお願い"

    for rcpt in recipients:
        rows = overtime_by_org6.get(rcpt.org6)
        if not rows:
            results["skipped"].append({"email": rcpt.email, "reason": "no overtime rows for org6", "org6": rcpt.org6})
            continue
        attachment = _build_attachment(rows)
        body = _render_body(settings, rcpt.name or rcpt.emp_no or "各位")
        try:
            _send_email(settings, rcpt.email, subject, body, attachment)
            results["sent"].append({"email": rcpt.email, "org6": rcpt.org6, "rows": len(rows)})
        except Exception as e:
            results["skipped"].append({"email": rcpt.email, "org6": rcpt.org6, "reason": str(e)})

    return results
