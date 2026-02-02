import json
from datetime import date
from typing import List
import httpx
from backend.core.config import Settings
from backend.models.tournament import Tournament, Task, Alert, Document
from backend.schemas.tournament import TournamentCreate

settings = Settings()

TASK_TEMPLATES = {
    "default": [
        {"title": "大会要項ドラフト作成", "description": "基本情報を整理し要項ドラフトを作成", "offset_days": 14},
        {"title": "会場手配", "description": "会場予約と設備確認", "offset_days": 12},
        {"title": "審判手配", "description": "審判アサインと連絡", "offset_days": 10},
        {"title": "チーム案内メール送付", "description": "案内メールを送付", "offset_days": 9},
        {"title": "スタッフ集合メール送付", "description": "スタッフ向け連絡", "offset_days": 7},
        {"title": "備品確認", "description": "備品リスト確認と手配", "offset_days": 5},
        {"title": "緊急連絡先共有", "description": "全関係者に共有", "offset_days": 3},
        {"title": "当日準備", "description": "当日の段取り最終確認", "offset_days": 1},
    ],
    "large": [
        {"title": "スポンサー調整", "description": "スポンサーとの調整", "offset_days": 20},
    ],
    "fukuda": [
        {"title": "会場手配・当日立ち上げ｜会場担当者へ到着連絡", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "会場手配・当日立ち上げ｜スタジアム開錠・入場確認", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "会場手配・当日立ち上げ｜本部室・大会関係者室・審判控室の場所確認", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "会場手配・当日立ち上げ｜立入禁止エリア（選手動線・バックヤード）確認", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "会場手配・当日立ち上げ｜鍵・通行証・IDパス受領", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "会場手配・当日立ち上げ｜ピッチ・ベンチ・テクニカルエリア状況確認", "description": "試合150〜130分前", "offset_days": 0},
        {"title": "運営本部立ち上げ｜運営本部設営（机・椅子・掲示物）", "description": "試合130〜120分前", "offset_days": 0},
        {"title": "運営本部立ち上げ｜PC・プリンタ・Wi-Fi・電源確認", "description": "試合130〜120分前", "offset_days": 0},
        {"title": "運営本部立ち上げ｜無線機・予備バッテリー配布", "description": "試合130〜120分前", "offset_days": 0},
        {"title": "運営本部立ち上げ｜当日資料配置（タイムスケジュール等）", "description": "試合130〜120分前", "offset_days": 0},
        {"title": "運営本部立ち上げ｜時計の時刻同期（公式時刻）", "description": "試合130〜120分前", "offset_days": 0},
        {"title": "審判対応｜審判到着確認・受付", "description": "試合100〜90分前", "offset_days": 0},
        {"title": "審判対応｜審判控室案内", "description": "試合100〜90分前", "offset_days": 0},
        {"title": "審判対応｜審判用備品確認（ドリンク・タオル等）", "description": "試合100〜90分前", "offset_days": 0},
        {"title": "審判対応｜ブリーフィング対応（競技規則・特別運用・VAR連携）", "description": "試合100〜90分前", "offset_days": 0},
        {"title": "審判対応｜ウォームアップ開始時刻共有", "description": "試合100〜90分前", "offset_days": 0},
        {"title": "チーム受付｜両チーム受付開始", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "チーム受付｜メンバー表回収", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "チーム受付｜ユニフォーム色・GK色確認", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "チーム受付｜キャプテンマーク確認", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "チーム受付｜スパイク・装身具チェック", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "チーム受付｜ロッカールーム案内", "description": "試合90〜80分前", "offset_days": 0},
        {"title": "観客対応｜開門前最終確認", "description": "試合75〜45分前", "offset_days": 0},
        {"title": "観客対応｜入場ゲート・動線確認/係員配置", "description": "試合75〜45分前", "offset_days": 0},
        {"title": "観客対応｜スタンド・コンコース巡回/バリアフリー席確認", "description": "試合75〜45分前", "offset_days": 0},
        {"title": "観客対応｜迷子・落とし物対応フロー確認", "description": "試合75〜45分前", "offset_days": 0},
        {"title": "医療・安全管理｜救護室開設確認", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "医療・安全管理｜医師・看護師配置確認", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "医療・安全管理｜AED設置場所確認", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "医療・安全管理｜熱中症対策（WBGT／給水）", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "医療・安全管理｜悪天候時対応方針確認", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "医療・安全管理｜緊急車両動線確認", "description": "試合70〜30分前", "offset_days": 0},
        {"title": "試合直前対応｜ピッチ最終チェック", "description": "試合30〜0分前", "offset_days": 0},
        {"title": "試合直前対応｜選手入場動線確認", "description": "試合30〜0分前", "offset_days": 0},
        {"title": "試合直前対応｜審判・第4審判最終確認", "description": "試合30〜0分前", "offset_days": 0},
        {"title": "試合直前対応｜キックオフ時刻最終確認", "description": "試合30〜0分前", "offset_days": 0},
        {"title": "試合直前対応｜トラブル有無確認・共有", "description": "試合30〜0分前", "offset_days": 0},
        {"title": "試合中対応｜本部常駐", "description": "試合中", "offset_days": 0},
        {"title": "試合中対応｜審判・チームからの連絡対応", "description": "試合中", "offset_days": 0},
        {"title": "試合中対応｜けが人・トラブル対応", "description": "試合中", "offset_days": 0},
        {"title": "試合中対応｜時間管理（前後半・AT）", "description": "試合中", "offset_days": 0},
        {"title": "試合中対応｜観客トラブル対応", "description": "試合中", "offset_days": 0},
    ],
}

PROMPTS = {
    "timeline": """
あなたは大会運営アシスタントです。以下の大会情報から当日の進行タイムライン(開始時刻とアクションのリスト)をJSONで作成してください。
出力フォーマット: {"timeline": [{"time": "HH:MM", "action": "…"}, ...]}
""",
    "email_venue": """
会場手配メールのドラフトを作成してください。JSONで返してください。
出力: {"subject": "...", "body": "..."}
""",
    "email_referee": """
審判手配メールのドラフトを作成してください。JSONで返してください。
出力: {"subject": "...", "body": "..."}
""",
}


async def call_openai_json(prompt: str, tournament: Tournament):
    content = f"""
大会名: {tournament.name}
カテゴリ: {tournament.category}
規模: {tournament.scale}
日程: {tournament.start_date} - {tournament.end_date}
会場: {tournament.venue_name or ''} ({tournament.venue_address or ''})
連絡先: {tournament.organizer_contact or ''}
スタッフ: {tournament.staff_roles or ''}
"""
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": content},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


def build_local_timeline(tournament: Tournament) -> str:
    timeline = [
        {"time": "08:00", "action": "スタッフ集合・役割確認"},
        {"time": "08:30", "action": "会場設営・機材チェック"},
        {"time": "09:00", "action": "審判ミーティング"},
        {"time": "09:30", "action": "チーム受付開始"},
        {"time": "10:00", "action": "開会式"},
        {"time": "10:30", "action": "第1試合キックオフ"},
        {"time": "12:30", "action": "昼休憩・ピッチ整備"},
        {"time": "13:30", "action": "午後の試合開始"},
        {"time": "16:30", "action": "最終試合終了"},
        {"time": "17:00", "action": "閉会式・表彰"},
        {"time": "17:30", "action": "撤収・片付け"},
    ]
    payload = {"timeline": timeline, "note": f"{tournament.name} ({tournament.category}, {tournament.scale})"}
    return json.dumps(payload, ensure_ascii=False)


def generate_tasks_from_template(tournament: Tournament, db):
    base = TASK_TEMPLATES["default"][:]
    if tournament.venue_name and "フクダ電子アリーナ" in tournament.venue_name:
        base = TASK_TEMPLATES["fukuda"][:]
    elif tournament.scale == "large":
        base += TASK_TEMPLATES.get("large", [])
    created = []
    for tmpl in base:
        base_date = tournament.start_date if tournament.start_date else date.today()
        due = date.fromordinal(base_date.toordinal() - tmpl["offset_days"])
        t = Task(
            tournament_id=tournament.id,
            title=tmpl["title"],
            description=tmpl.get("description"),
            assignee=None,
            due_date=due,
            status="todo",
            priority="medium",
            dependency=None,
            generated=True,
        )
        db.add(t)
        created.append(t)
    db.commit()
    return created


def create_overdue_alerts(db, tournament_id: int):
    today = date.today()
    tasks = db.query(Task).filter(Task.tournament_id == tournament_id, Task.status != "done", Task.due_date != None).all()
    for task in tasks:
        if task.due_date and task.due_date < today:
            msg = f"タスク遅延: {task.title} (期限: {task.due_date})"
            alert = Alert(tournament_id=tournament_id, message=msg)
            db.add(alert)
    db.commit()
