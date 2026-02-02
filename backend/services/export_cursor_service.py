import base64
import io
import json
import logging
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd
import pyarrow.parquet as pq

from backend.models.dataset import Dataset, DatasetStatus
from backend.services.dataset_service import _normalize_header

logger = logging.getLogger(__name__)

# 列名のエイリアスはフロントの exportWorker と合わせる
COLUMN_MAP_ALIASES: Dict[str, List[str]] = {
    "emp_no": ["従業員番号", "社員番号", "社員no", "(基本)従業員番号"],
    "name": ["氏名", "名前", "カナ氏名", "(基本)氏名", "(基本)カナ氏名"],
    "status": ["進捗状況", "勤務予定", "勤務予定日", "勤務予定区分", "勤務状況"],
    "overtime": ["実所定外時間", "残業時間", "残業", "(時間)実所定外時間"],
    "overtime_detail": ["残業時間", "実所定外時間", "(時間)残業時間"],
    "call_time": ["呼出出勤時間", "呼出出勤", "(時間)呼出出勤"],
    "grade_code": ["従業員区分(ｺｰﾄﾞ)", "(従業員区分(基準日))従業員区分(ｺｰﾄﾞ)"],
    # グレード/キャリアグレード系のゆらぎを拾う
    "grade": [
        "従業員区分",
        "グレード",
        "キャリアグレード",
        "キャリア グレード",
        "所属情報のキャリアグレード",
        "(従業員区分(基準日))従業員区分",
    ],
    "role_code": ["職制(ｺｰﾄﾞ)", "(職制(基準日))職制(ｺｰﾄﾞ)"],
    "role": ["職制", "役職", "(職制(基準日))職制"],
    "org1": ["所属名称1", "所属名称１", "所属1", "(人事所属本務(基準日))所属名称１"],
    "org2": ["所属名称2", "所属名称２", "所属2", "(人事所属本務(基準日))所属名称２"],
    "org3": ["所属名称3", "所属名称３", "所属3", "(人事所属本務(基準日))所属名称３"],
    "org4": ["所属名称4", "所属名称４", "所属4", "(人事所属本務(基準日))所属名称４"],
    "org5": ["所属名称5", "所属名称５", "所属5", "(人事所属本務(基準日))所属名称５"],
    "org6": ["所属名称6", "所属名称６", "所属6", "所属情報6", "所属情報６", "(人事所属本務(基準日))所属名称６"],
    "org7": ["所属名称7", "所属名称７", "所属7", "(人事所属本務(基準日))所属名称７"],
    "org8": ["所属名称8", "所属名称８", "所属8", "(人事所属本務(基準日))所属名称８"],
}

ESTIMATED_COLUMNS = [
    "従業員番号",
    "氏名",
    "勤務予定",
    "実所定外時間",
    "残業時間",
    "呼出出勤時間",
    "グレード",
    "職制",
    "所属名称２",
    "所属名称３",
    "所属名称４",
    "所属名称５",
    "所属名称６",
    "所属名称７",
    "所属名称８",
]

OVERTIME_COLUMNS = ["従業員番号", "就業開始前残業時間", "就業終了後残業時間", "合計残業時間", "所属名称６"]


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        return int(data.get("offset", 0))
    except Exception:
        return 0


def _encode_cursor(offset: int) -> str:
    payload = {"offset": offset}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def _build_colmap(headers: Iterable[str]) -> Dict[str, int]:
    normalized: Dict[str, int] = {}
    for idx, h in enumerate(headers):
        normalized[_normalize_header(h)] = idx
    resolved: Dict[str, int] = {}
    for key, aliases in COLUMN_MAP_ALIASES.items():
        for name in aliases:
            idx = normalized.get(_normalize_header(name))
            if idx is not None:
                resolved[key] = idx
                break
    return resolved


def _as_str(val) -> str:
    return "" if val is None else str(val)


def _pick(row: List, colmap: Dict[str, int], key: str, default: str = "") -> str:
    idx = colmap.get(key)
    if idx is None or idx >= len(row):
        return default
    return _as_str(row[idx])


def _minutes_from_str(value: str | int | float | None) -> int:
    if value is None:
        return 0
    s = str(value).strip()
    if not s:
        return 0
    if ":" in s:
        h, m = s.split(":", 1)
        return max(0, int(h or 0) * 60 + int(m or 0))
    try:
        return max(0, int(float(s)))
    except Exception:
        return 0


def _hhmm(minutes: int) -> str:
    m = max(0, int(round(minutes)))
    h = m // 60
    mm = m % 60
    return f"{h}:{mm:02d}"


def _map_rows_to_estimated(headers: List[str], rows: List[List]) -> List[List[str]]:
    colmap = _build_colmap(headers)
    mapped: List[List[str]] = []
    for r in rows:
        mapped.append(
            [
                _pick(r, colmap, "emp_no"),
                _pick(r, colmap, "name"),
                _pick(r, colmap, "status"),
                _pick(r, colmap, "overtime"),
                _pick(r, colmap, "overtime_detail", _pick(r, colmap, "overtime")),
                _pick(r, colmap, "call_time"),
                _pick(r, colmap, "grade"),
                _pick(r, colmap, "role"),
                _pick(r, colmap, "org2"),
                _pick(r, colmap, "org3"),
                _pick(r, colmap, "org4"),
                _pick(r, colmap, "org5"),
                _pick(r, colmap, "org6"),
                _pick(r, colmap, "org7"),
                _pick(r, colmap, "org8"),
            ]
        )
    return mapped


def _merge_by_employee(rows: List[List[str]]) -> List[List[str]]:
    numeric_idx = [3, 4, 5]
    grouped: Dict[str, Dict] = {}
    orphans: List[List[str]] = []
    for row in rows:
        emp = (row[0] or "").strip()
        if not emp:
            orphans.append(row)
            continue
        entry = grouped.get(emp)
        if not entry:
            grouped[emp] = {"base": list(row), "sums": {i: _minutes_from_str(row[i]) for i in numeric_idx}}
            continue
        # accumulate
        for i in numeric_idx:
            entry["sums"][i] = entry["sums"].get(i, 0) + _minutes_from_str(row[i])
        # fill blanks
        for i, cell in enumerate(row):
            if i in numeric_idx:
                continue
            if not entry["base"][i] and cell:
                entry["base"][i] = cell
    merged: List[List[str]] = []
    for emp, data in grouped.items():
        base = list(data["base"])
        for i in numeric_idx:
            base[i] = _hhmm(data["sums"][i])
        merged.append(base)
    merged.extend(orphans)
    return merged


def _iter_parquet_batches(dataset: Dataset, batch_size: int = 5000):
    pf = pq.ParquetFile(dataset.stored_path)
    for batch in pf.iter_batches(batch_size=batch_size):
        yield batch


def _dataset_to_rows(dataset: Dataset, batch_size: int = 5000) -> Tuple[List[str], List[List[str]]]:
    headers: List[str] = []
    rows: List[List[str]] = []
    for batch in _iter_parquet_batches(dataset, batch_size=batch_size):
        df = batch.to_pandas()
        if not headers:
            headers = list(df.columns)
        for _, rec in df.iterrows():
            rows.append([_as_str(v) for v in rec.tolist()])
    return headers, rows


def is_relevant_estimated(row: List[str]) -> bool:
    """
    フィルタ差し替え用。必要に応じて上書きできる。
    """
    return True


def is_relevant_overtime_detail(row: List[str]) -> bool:
    return True


def build_estimated_rows(datasets: List[Dataset], predicate=is_relevant_estimated) -> List[List[str]]:
    """
    datasets: 任意の複数パケット（FILE_ORDER 0-5 を想定）
    全件を map → merge して1テーブルを返す
    """
    mapped_all: List[List[str]] = []
    for ds in datasets:
        headers, rows = _dataset_to_rows(ds)
        mapped = _map_rows_to_estimated(headers, rows)
        if predicate:
            mapped = [r for r in mapped if predicate(r)]
        mapped_all.extend(mapped)
        logger.info("[export] mapped %s rows from dataset %s", len(mapped), ds.id)
    merged = _merge_by_employee(mapped_all)
    return merged


def build_overtime_detail_rows(
    schedule: Dataset, punches: Dataset, org_info: Optional[Dataset] = None, predicate=is_relevant_overtime_detail
) -> List[List[str]]:
    # スケジュール
    sched_headers, sched_rows = _dataset_to_rows(schedule)
    sched_map = {_normalize_header(h): idx for idx, h in enumerate(sched_headers)}
    punch_headers, punch_rows = _dataset_to_rows(punches)
    punch_map = {_normalize_header(h): idx for idx, h in enumerate(punch_headers)}

    org_map: Dict[str, str] = {}
    if org_info:
        org_headers, org_rows = _dataset_to_rows(org_info)
        org_colmap = _build_colmap(org_headers)
        for r in org_rows:
            emp = _pick(r, org_colmap, "emp_no").strip()
            if not emp:
                continue
            org6 = _pick(r, org_colmap, "org6").strip()
            if emp not in org_map and org6:
                org_map[emp] = org6

    def pick(row: List[str], m: Dict[str, int], names: List[str]) -> str:
        for n in names:
            idx = m.get(_normalize_header(n))
            if idx is not None and idx < len(row):
                return row[idx]
        return ""

    def hhmm_to_min(val: str) -> Optional[int]:
        s = (val or "").strip()
        if not s:
            return None
        if ":" in s:
            h, m = s.split(":", 1)
            try:
                return int(h) * 60 + int(m)
            except Exception:
                return None
        try:
            return int(float(s))
        except Exception:
            return None

    planned: Dict[str, Dict[str, Optional[int]]] = {}
    for r in sched_rows:
        emp = pick(r, sched_map, ["従業員番号"]).strip()
        date = pick(r, sched_map, ["勤務予定日"]).strip()
        if not emp or not date:
            continue
        start = hhmm_to_min(pick(r, sched_map, ["就業開始時刻"]))
        end = hhmm_to_min(pick(r, sched_map, ["就業終了時刻"]))
        rest = hhmm_to_min(pick(r, sched_map, ["休憩時間"])) or 0
        if start is not None and end is None:
            end = start + rest + 8 * 60  # パターン時間不明時は8h仮定
        planned[f"{emp}__{date}"] = {"start": start, "end": end}

    sums: Dict[str, Dict[str, int]] = {}
    for r in punch_rows:
        emp = pick(r, punch_map, ["従業員番号"]).strip()
        date = pick(r, punch_map, ["勤務日付", "勤務日"]).strip()
        if not emp or not date:
            continue
        plan = planned.get(f"{emp}__{date}")
        if not plan or plan["start"] is None or plan["end"] is None:
            continue
        actual_start = hhmm_to_min(pick(r, punch_map, ["出社時刻"]))
        actual_end = hhmm_to_min(pick(r, punch_map, ["退社時刻"]))
        if actual_start is None and actual_end is None:
            continue
        start_ot = max(0, (plan["start"] - actual_start) if actual_start is not None else 0)
        end_ot = max(0, (actual_end - plan["end"]) if actual_end is not None else 0)
        total = start_ot + end_ot
        # 10時間超勤務で30分控除
        if actual_start is not None and actual_end is not None and actual_end - actual_start > 10 * 60:
            total = max(0, total - 30)
            # 終了後から優先的に控除
            reduction = (start_ot + end_ot) - total
            end_ot = max(0, end_ot - reduction)
            start_ot = max(0, start_ot - max(0, reduction - (end_ot)))
        entry = sums.get(emp, {"start": 0, "end": 0})
        entry["start"] += start_ot
        entry["end"] += end_ot
        sums[emp] = entry

    rows: List[List[str]] = []
    for emp, v in sorted(sums.items()):
        total = v["start"] + v["end"]
        rows.append([emp, _hhmm(v["start"]), _hhmm(v["end"]), _hhmm(total), org_map.get(emp, "")])
    if predicate:
        rows = [r for r in rows if predicate(r)]
    return rows


def paginate_rows(rows: List[List[str]], limit: int, cursor: Optional[str]) -> Tuple[List[List[str]], bool, Optional[str], int]:
    offset = _decode_cursor(cursor)
    start = max(0, offset)
    end = start + limit
    page = rows[start:end]
    has_more = end < len(rows)
    next_cursor = _encode_cursor(end) if has_more else None
    return page, has_more, next_cursor, start
