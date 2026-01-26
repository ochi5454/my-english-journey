import math
from typing import Dict, List, Optional

from backend.services.excel import _normalized_header_key

BASE_MINUTES = 17 * 60 + 30  # 17:30 in minutes

PUNCH_COLUMN_ALIASES = {
    "emp_no": ["従業員番号", "社員番号", "社員No", "社員Ｎｏ"],
    "work_date": ["勤務日付", "勤務日"],
    "end_time": ["退社時刻", "退勤時刻", "退勤"],
}


def parse_hhmm_to_minutes(value: Optional[object]) -> Optional[int]:
    """Convert HHMM style value (e.g. 1908 or "24:17") to total minutes.

    Returns None for invalid / empty input so callers can treat it as 0.
    """
    if value is None:
        return None

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        # Accept formats like "19:08" or "1908" or "1908.0"
        if ":" in raw:
            try:
                hour_str, minute_str = raw.split(":", 1)
                hour = int(float(hour_str))
                minute = int(float(minute_str))
            except (ValueError, TypeError):
                return None
        else:
            try:
                numeric = int(float(raw))
            except (ValueError, TypeError):
                return None
            hour = numeric // 100
            minute = numeric % 100
    elif isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        numeric = int(value)
        hour = numeric // 100
        minute = numeric % 100
    else:
        return None

    if minute >= 60 or hour < 0:
        return None

    return hour * 60 + minute


def overtime_minutes_from_value(value: Optional[object], base_minutes: int = BASE_MINUTES) -> int:
    """Calculate overtime minutes against the 17:30 baseline.

    Invalid or empty inputs yield 0.
    """
    end_minutes = parse_hhmm_to_minutes(value)
    if end_minutes is None:
        return 0
    return max(0, end_minutes - base_minutes)


def _build_punch_column_map(headers: List[str]) -> Dict[str, int]:
    normalized = {_normalized_header_key(h): idx for idx, h in enumerate(headers)}
    resolved: Dict[str, int] = {}
    for key, aliases in PUNCH_COLUMN_ALIASES.items():
        for name in aliases:
            idx = normalized.get(_normalized_header_key(name))
            if idx is not None:
                resolved[key] = idx
                break
    missing = [k for k in ("emp_no", "work_date", "end_time") if k not in resolved]
    if missing:
        raise ValueError(f"必須列が見つかりません: {', '.join(missing)}")
    return resolved


def aggregate_overtime_by_employee(grid: Dict) -> List[Dict[str, object]]:
    """Aggregate overtime minutes per employee from the punches grid.

    The grid should come from `fetch_grid_for_key(db, "punches")`.
    Returns a list sorted by employee number for deterministic output.
    """
    headers = grid.get("headers") or []
    rows: List[List[object]] = grid.get("rows") or []
    col_map = _build_punch_column_map(headers)

    totals: Dict[str, int] = {}
    daily: Dict[str, List[Dict[str, object]]] = {}

    for row in rows:
        emp_no_raw = row[col_map["emp_no"]] if col_map["emp_no"] < len(row) else ""
        emp_no = str(emp_no_raw).strip() if emp_no_raw is not None else ""
        if not emp_no:
            continue

        end_val = row[col_map["end_time"]] if col_map["end_time"] < len(row) else None
        overtime_minutes = overtime_minutes_from_value(end_val)

        totals[emp_no] = totals.get(emp_no, 0) + overtime_minutes

        work_date_val = row[col_map["work_date"]] if col_map["work_date"] < len(row) else ""
        work_date = str(work_date_val).strip() if work_date_val is not None else ""
        if work_date:
            daily.setdefault(emp_no, []).append({"date": work_date, "minutes": overtime_minutes})

    for emp_no in daily.keys():
        daily[emp_no].sort(key=lambda x: x.get("date") or "")

    return [
        {
            "emp_no": emp_no,
            "total_minutes": totals.get(emp_no, 0),
            "daily": daily.get(emp_no, []),
        }
        for emp_no in sorted(totals.keys())
    ]
