from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Any

# 共通で使う JST タイムゾーン
try:
    JST = ZoneInfo("Asia/Tokyo")
except Exception:
    # zoneinfo が使えない環境向けのフォールバック
    JST = timezone(timedelta(hours=9))


def to_jst_iso(dt: Any) -> str | None:
    """
    datetime を JST の ISO 文字列に変換する。
    None や datetime 以外は None を返す。
    """
    if dt is None or not isinstance(dt, datetime):
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JST)
    else:
        dt = dt.astimezone(JST)
    return dt.isoformat()


def now_jst_iso() -> str:
    """現在時刻の JST ISO 文字列を返す。"""
    return datetime.now(JST).isoformat()


def now_jst() -> datetime:
    """現在時刻の JST datetime を返す。"""
    return datetime.now(JST)
