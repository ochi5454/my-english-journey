import math

import pytest

from backend.services.overtime import parse_hhmm_to_minutes, overtime_minutes_from_value, aggregate_overtime_by_employee


@pytest.mark.parametrize(
    "value,expected",
    [
        (1908, 19 * 60 + 8),
        ("1908", 19 * 60 + 8),
        ("19:08", 19 * 60 + 8),
        (2417, 24 * 60 + 17),
        ("24:17", 24 * 60 + 17),
        ("", None),
        (None, None),
        (math.nan, None),
        ("1660", None),
    ],
)
def test_parse_hhmm_to_minutes(value, expected):
    assert parse_hhmm_to_minutes(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        (1908, 98),  # 19:08 => 98 mins
        (1730, 0),
        (1600, 0),
        (2417, 407),  # 24:17 => 1457-1050=407
        (None, 0),
        ("", 0),
        (math.nan, 0),
    ],
)
def test_overtime_minutes_from_value(value, expected):
    assert overtime_minutes_from_value(value) == expected


def test_aggregate_overtime_by_employee():
    grid = {
        "headers": ["従業員番号", "勤務日付", "出社時刻", "退社時刻"],
        "rows": [
            ["E01", "2025-12-01", "0900", "1908"],  # 98
            ["E01", "2025-12-02", "0900", "1600"],  # 0
            ["E02", "2025-12-01", "0900", "2417"],  # 407
            ["", "2025-12-01", "", "2000"],  # skipped empty emp
            ["E01", "2025-12-03", "0900", None],  # 0
        ],
    }

    result = aggregate_overtime_by_employee(grid)
    assert result == [
        {
            "emp_no": "E01",
            "total_minutes": 98,
            "daily": [
                {"date": "2025-12-01", "minutes": 98},
                {"date": "2025-12-02", "minutes": 0},
                {"date": "2025-12-03", "minutes": 0},
            ],
        },
        {
            "emp_no": "E02",
            "total_minutes": 407,
            "daily": [
                {"date": "2025-12-01", "minutes": 407},
            ],
        },
    ]

