import os
import pandas as pd
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.export_cursor_service import (
    build_estimated_rows,
    build_overtime_detail_rows,
    paginate_rows,
    ESTIMATED_COLUMNS,
    OVERTIME_COLUMNS,
)


def _make_dataset(tmp_path, kind, df: pd.DataFrame) -> Dataset:
    path = os.path.join(tmp_path, f"{kind}.parquet")
    df.to_parquet(path)
    return Dataset(kind=kind, stored_path=path, original_filename=f"{kind}.parquet", status=DatasetStatus.ready)


def test_paginate_rows_roundtrip():
    rows = [[str(i)] for i in range(10)]
    page, has_more, cursor, start = paginate_rows(rows, limit=3, cursor=None)
    assert page == [["0"], ["1"], ["2"]]
    assert has_more is True
    assert cursor is not None
    page2, has_more2, cursor2, start2 = paginate_rows(rows, limit=3, cursor=cursor)
    assert start2 == 3
    assert page2[0] == ["3"]
    assert has_more2 is True
    assert cursor2 is not None


def test_build_estimated_rows(tmp_path):
    df = pd.DataFrame(
        {
            "従業員番号": ["001", "002"],
            "氏名": ["Alice", "Bob"],
            "実所定外時間": ["1:00", "0:30"],
            "残業時間": ["1:00", "0:15"],
            "呼出出勤時間": ["0:10", "0:00"],
            "従業員区分": ["G1", "G1"],
            "職制": ["Mgr", "Staff"],
        }
    )
    ds = _make_dataset(tmp_path, "org_info", df)
    rows = build_estimated_rows([ds])
    assert len(rows) == 2
    assert rows[0][0] == "001"
    assert rows[0][3] in ("1:00", "1:00")  # merged hh:mm
    assert rows[0][6] == "G1" or rows[0][7] == "Mgr"


def test_build_overtime_detail_rows(tmp_path):
    sched = pd.DataFrame(
        {
            "従業員番号": ["001", "002"],
            "勤務予定日": ["2025-01-01", "2025-01-01"],
            "就業開始時刻": ["09:00", "09:00"],
            "就業終了時刻": ["18:00", "18:00"],
            "休憩時間": ["60", "60"],
        }
    )
    punches = pd.DataFrame(
        {
            "従業員番号": ["001", "002"],
            "勤務日付": ["2025-01-01", "2025-01-01"],
            "出社時刻": ["08:00", "09:10"],
            "退社時刻": ["19:00", "19:10"],
        }
    )
    org = pd.DataFrame(
        {
            "(基本)従業員番号": ["001", "002"],
            "(人事所属本務(基準日))所属名称６": ["本社", "支社A"],
        }
    )
    sched_ds = _make_dataset(tmp_path, "schedule_input", sched)
    punch_ds = _make_dataset(tmp_path, "punches", punches)
    org_ds = _make_dataset(tmp_path, "org_info", org)
    rows = build_overtime_detail_rows(sched_ds, punch_ds, org_ds)
    # 001 has both early and late OT
    assert rows[0][0] == "001"
    assert rows[0][-1] == "本社"
    assert rows[0][3] != ""
    assert len(rows[0]) == len(OVERTIME_COLUMNS)
