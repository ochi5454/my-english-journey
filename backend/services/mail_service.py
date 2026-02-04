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


def _render_body(settings: Settings, org6_name: str, data_date=None) -> str:
    from datetime import datetime, date
    target_date = data_date if data_date else datetime.now()
    date_str = target_date.strftime("%m月%d日")
    return f"""責任者および関係者各位

表題の件、{date_str}時点での実所定外時間の速報値
（出退勤打刻による概算値、特別条項申請済者含）をお送りします。

本データ抽出後に勤怠を修正した場合、表示している実所定外時間数に乖離が発生します。
何卒ご了承くださいませ。

「【再掲】時間外及び休日労働のルールと運用の変更について」にあるように月間時間外は30時間で納めて下さい。
https://ms-bbs.coo-kai.jp/a/aeondelightjp.onmicrosoft.com/topic/4368531060

【　30時間超過が想定される場合　】
・レポートラインを通して30時間超過しない対策をお願いします。

【　上司の方々へ　】
・30時間超過の可能性がある報告を受けた場合は、配下で対応できる場合は、応援等対応頂き、その対応が難しい場合は、レポートラインを通じて上に報告相談をお願いします。時間外を発生させない取り組みを現場任せにせず、皆で対応し時間外を減らせるように対応をお願いいたします。
"""


def _build_attachment(rows: List[List[str]]) -> Tuple[str, BytesIO]:
    df = pd.DataFrame(rows or [], columns=OVERTIME_COLUMNS)
    buf = BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    filename = "overtime_detail.xlsx"
    return filename, buf


@dataclass
class Attachment:
    filename: str
    data: bytes
    maintype: str
    subtype: str


def _send_email_with_attachments(
    settings: Settings,
    to: List[str],
    subject: str,
    body: str,
    attachments: List[Attachment]
):
    """
    複数添付ファイル対応のメール送信

    Args:
        to: 宛先メールアドレスのリスト
        attachments: 添付ファイルのリスト
    """
    if not settings.smtp_host:
        raise ValueError("SMTP_HOST is not configured")

    msg = EmailMessage()
    sender_name = settings.mail_from_name or settings.mail_sender_name or ""
    msg["From"] = formataddr((sender_name, settings.mail_from))
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)

    for att in attachments:
        msg.add_attachment(
            att.data,
            maintype=att.maintype,
            subtype=att.subtype,
            filename=att.filename,
        )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        if settings.smtp_use_tls:
            context = ssl.create_default_context()
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)


def _build_pdf_attachment(rows: List[List[str]], org6: str) -> Tuple[bytes, str]:
    """
    org6の残業データからPDFを生成

    Args:
        rows: 残業データ行
        org6: 組織名

    Returns:
        (PDFデータ, ファイル名)
    """
    from datetime import datetime
    from backend.services.pdf_export import is_pdf_available, create_overtime_pdf

    if not is_pdf_available():
        raise ValueError("PDF機能が利用できません。reportlabをインストールしてください。")

    # OVERTIME_COLUMNS: 社員番号, 氏名, 日付, 残業種別, 所属名称6, 残業時間
    pdf_data_list = []
    emp_hours: Dict[str, Dict] = {}

    for row in rows:
        emp_no = row[0] if len(row) > 0 else ""
        name = row[1] if len(row) > 1 else ""
        overtime_str = row[5] if len(row) > 5 else "0"

        try:
            hours = float(overtime_str) if overtime_str else 0
        except ValueError:
            hours = 0

        if emp_no not in emp_hours:
            emp_hours[emp_no] = {"name": name, "department": org6, "total_hours": 0}
        emp_hours[emp_no]["total_hours"] += hours

    for emp_no, data in emp_hours.items():
        pdf_data_list.append({
            "employee_id": emp_no,
            "name": data["name"],
            "department": data["department"],
            "overtime_hours": data["total_hours"],
        })

    pdf_data_list.sort(key=lambda x: x["overtime_hours"], reverse=True)

    now = datetime.now()
    pdf_data = create_overtime_pdf(pdf_data_list, title=f"残業時間レポート - {org6}")
    pdf_filename = f"overtime_{org6}_{now.strftime('%Y%m%d')}.pdf"

    return pdf_data, pdf_filename


def send_overtime_emails(db: Session, settings: Settings, data_date=None) -> Dict:
    """
    org6ごとに1通のメールを、そのorg6の全メンバーに送信
    添付ファイル: Excel + PDF

    Args:
        data_date: データ基準日（指定なしなら送信日が使用される）
    """
    from datetime import datetime
    from backend.services.pdf_export import is_pdf_available

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

    # org6ごとにメンバーをグループ化
    members_by_org6: Dict[str, List[Recipient]] = defaultdict(list)
    for rcpt in recipients:
        members_by_org6[rcpt.org6].append(rcpt)

    results = {"sent": [], "skipped": []}
    now = datetime.now()
    pdf_available = is_pdf_available()

    # org6ごとに1通送信
    for org6, members in members_by_org6.items():
        subject = f"【毎月15･20･25日定期発信】時間外労働状況の進捗管理（{org6}）"
        rows = overtime_by_org6.get(org6)
        if not rows:
            results["skipped"].append({
                "org6": org6,
                "emails": [m.email for m in members],
                "reason": "no overtime rows for org6"
            })
            continue

        emails = [m.email for m in members]
        body = _render_body(settings, org6, data_date=data_date)

        # 添付ファイルを準備
        attachments: List[Attachment] = []

        # Excel添付
        excel_filename, excel_buf = _build_attachment(rows)
        attachments.append(Attachment(
            filename=f"overtime_{org6}_{now.strftime('%Y%m%d')}.xlsx",
            data=excel_buf.getvalue(),
            maintype="application",
            subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ))

        # PDF添付（利用可能な場合）
        if pdf_available:
            try:
                pdf_data, pdf_filename = _build_pdf_attachment(rows, org6)
                attachments.append(Attachment(
                    filename=pdf_filename,
                    data=pdf_data,
                    maintype="application",
                    subtype="pdf",
                ))
            except Exception:
                pass  # PDF生成に失敗してもExcelは送る

        try:
            _send_email_with_attachments(settings, emails, subject, body, attachments)
            results["sent"].append({
                "org6": org6,
                "emails": emails,
                "recipient_count": len(emails),
                "rows": len(rows),
                "attachments": [a.filename for a in attachments],
            })
        except Exception as e:
            results["skipped"].append({
                "org6": org6,
                "emails": emails,
                "reason": str(e)
            })

    return results
