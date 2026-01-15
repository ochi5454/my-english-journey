from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import smtplib
from email.message import EmailMessage

router = APIRouter()


class TransferItem(BaseModel):
  player: str
  from_club: str = Field(..., alias='from')
  to_club: str = Field(..., alias='to')
  fee: Optional[str] = None
  date: str

  class Config:
    allow_population_by_field_name = True


class TransferEmailRequest(BaseModel):
  transfers: List[TransferItem]


def build_body(transfers: List[TransferItem]) -> str:
  lines = ['移籍依頼の一覧です。']
  for t in transfers:
    lines.append(
      f"- 選手: {t.player} / 移籍元: {t.from_club} / 移籍先: {t.to_club} / 移籍金: {t.fee or '未設定'} / 日付: {t.date}"
    )
  return '\n'.join(lines)


def send_email(to_addr: str, subject: str, body: str):
  host = os.getenv('SMTP_HOST')
  port = int(os.getenv('SMTP_PORT', '587'))
  user = os.getenv('SMTP_USER')
  password = os.getenv('SMTP_PASSWORD')
  sender = os.getenv('SMTP_SENDER', user)

  if not host or not user or not password or not sender:
    raise HTTPException(
      status_code=500,
      detail='メール送信設定が不足しています (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_SENDER)。'
    )

  msg = EmailMessage()
  msg['From'] = sender
  msg['To'] = to_addr
  msg['Subject'] = subject
  msg.set_content(body)

  with smtplib.SMTP(host, port) as server:
    server.starttls()
    server.login(user, password)
    server.send_message(msg)


@router.post('/api/send-transfer-email')
async def send_transfer_email(req: TransferEmailRequest):
  if not req.transfers:
    raise HTTPException(status_code=400, detail='transfers が空です')

  body = build_body(req.transfers)
  send_email('hochi@iconconsultinggroup.com', '移籍依頼の登録', body)
  return {'message': 'メール送信を受け付けました', 'count': len(req.transfers)}
