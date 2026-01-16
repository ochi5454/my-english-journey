import os
import csv
import tempfile
from typing import List, Dict
import openpyxl
from io import BytesIO
from datetime import date
from backend.core.config import DATA_DIR
from backend.models.excel import ExcelFile, ExcelCell
from backend.core.database import Base


FILE_DEFINITIONS = {
    "schedule_input": {
        "display_name": "勤務予定入力",
        "expected_headers": [
            "従業員番号",
            "勤務予定日",
            "出勤休日区分",
            "出勤休日区分名",
            "就業時間パターンコード",
            "就業時間パターン名",
            "就業開始時刻",
            "就業終了時刻",
            "休憩時間",
        ],
    },
    "punches": {
        "display_name": "出退社時刻",
        "expected_headers": [
            "従業員番号",
            "勤務日付",
            "出社時刻",
            "退社時刻",
        ],
    },
    "days_items": {
        "display_name": "日数項目",
        "expected_headers": [
            "従業員番号",
            "勤務日",
            "出社時刻",
            "退社時刻",
            "日数項目",
            "日数項目名",
        ],
    },
    "tim_daily": {
        "display_name": "日次実績",
        "expected_headers": [
            "従業員番号",
            "勤務日付",
            "(時間)定時開始時刻",
            "(時間)定時終了時刻",
            "(時間)呼出出勤",
            "(時間)呼出退勤",
            "(時間)呼出勤務",
            "(時間)実所定外時間",
            "(時間)出社日数",
            "(時間)在宅勤務時間",
            "(時間)在宅勤務日数",
            "(時間)終日在宅フラグ",
            "(時間)実労働時間",
            "(時間)休憩Ｈ",
            "(時間)休憩勤務開始",
            "(時間)休憩勤務終了",
            "(時間)休憩1開始時刻",
            "(時間)休憩1終了時刻",
            "(時間)休憩2開始時刻",
            "(時間)休憩2終了時刻",
            "(時間)休憩3開始時刻",
            "(時間)休憩3終了時刻",
            "(時間)休憩4開始時刻",
            "(時間)休憩4終了時刻",
        ],
    },
    "person_progress": {
        "display_name": "勤務予定進捗一覧",
        "expected_headers": [
            "社員番号",
            "氏名",
            "カナ氏名",
            "勤怠年月",
            "勤務開始日",
            "進捗状況",
            "打刻実績",
            "勤務実績登録",
            "所属名称",
            "メールアドレス",
        ],
    },
}


def normalize_headers(headers: List[str]) -> List[str]:
    cleaned = []
    for h in headers:
        if h is None:
            h = ""
        if not isinstance(h, str):
            h = str(h)
        cleaned.append(h.lstrip("\ufeff").strip())
    return cleaned


def parse_csv_to_cells(path: str):
    cells = []
    headers: List[str] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for r_idx, row in enumerate(reader, start=1):
            if r_idx == 1:
                headers = normalize_headers(row)
            for c_idx, val in enumerate(row, start=1):
                cells.append((r_idx, c_idx, val))
    return cells, headers, "Sheet1"


def parse_xlsx_to_cells(path: str):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    cells = []
    headers: List[str] = []
    for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if r_idx == 1:
            headers = normalize_headers(list(row))
        for c_idx, val in enumerate(row, start=1):
            cells.append((r_idx, c_idx, "" if val is None else str(val)))
    return cells, headers, ws.title or "Sheet1"


def fetch_grid_for_key(db, file_key: str):
    ef = (
        db.query(ExcelFile)
        .filter(ExcelFile.file_key == file_key)
        .order_by(ExcelFile.version.desc())
        .first()
    )
    if not ef:
        return None
    cells = (
        db.query(ExcelCell)
        .filter(ExcelCell.file_id == ef.id)
        .order_by(ExcelCell.sheet_name, ExcelCell.row_index, ExcelCell.col_index)
        .all()
    )
    sheets = {}
    for cell in cells:
        sheets.setdefault(cell.sheet_name, []).append(cell)
    if not sheets:
        return None
    sheet_name, sheet_cells = list(sheets.items())[0]
    max_row = max(c.row_index for c in sheet_cells)
    max_col = max(c.col_index for c in sheet_cells)
    grid = [["" for _ in range(max_col)] for _ in range(max_row)]
    for c in sheet_cells:
        grid[c.row_index - 1][c.col_index - 1] = c.value or ""
    return {"grid": grid, "headers": grid[0] if grid else [], "rows": grid[1:] if len(grid) > 1 else []}


def build_processed_excel(grids: Dict, target_ym: str = "") -> BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "実所定外時間 推計データ"

    title = f"{target_ym or '2025年12月度'} 実所定外時間 推計データ（2025年12月15日現在）"
    ws.merge_cells("A1:O1")
    ws["A1"] = title
    ws["A1"].font = openpyxl.styles.Font(size=14, bold=True)

    legends = [
        ("80h超", "長時間労働", "6b4f00", "f7f2e2"),
        ("〜80h", "３６協定特別条項上限超過者", "d0a754", "1a1200"),
        ("〜60h", "３６協定特別条項上限", "e6a600", "1a1200"),
        ("〜45h", "労働基準法上の時間外労働上限", "c7b202", "0f0f0f"),
        ("〜30h", "社内ルールに基づく上限", "1f8a55", "fdfdfd"),
        ("15h〜20h", "", "5f86c6", "fdfdfd"),
    ]
    start_row = 3
    for idx, (label, desc, bg, fg) in enumerate(legends):
        r = start_row + idx
        ws[f"A{r}"] = label
        ws[f"A{r}"].fill = openpyxl.styles.PatternFill("solid", fgColor=bg)
        ws[f"A{r}"].font = openpyxl.styles.Font(color=fg, bold=True)
        ws[f"B{r}"] = f": {desc}"

    table_headers = [
        "従業員番号",
        "氏名",
        "勤務予定",
        "実所定外時間",
        "残業時間",
        "呼出出勤時間",
        "グレード",
        "職制",
        "所属名称2",
        "所属名称3",
        "所属名称4",
        "所属名称5",
        "所属名称6",
        "所属名称7",
        "所属名称8",
    ]
    header_row = start_row + len(legends) + 2
    for c_idx, h in enumerate(table_headers, start=1):
        cell = ws.cell(row=header_row, column=c_idx, value=h)
        cell.fill = openpyxl.styles.PatternFill("solid", fgColor="f2f2f2")
        cell.font = openpyxl.styles.Font(bold=True)
        cell.alignment = openpyxl.styles.Alignment(horizontal="center", vertical="center")
        cell.border = openpyxl.styles.Border(
            left=openpyxl.styles.Side(style="thin", color="cccccc"),
            right=openpyxl.styles.Side(style="thin", color="cccccc"),
            top=openpyxl.styles.Side(style="thin", color="cccccc"),
            bottom=openpyxl.styles.Side(style="thin", color="cccccc"),
        )

    data_start = header_row + 1
    data_rows = []
    sched = grids.get("schedule_input")
    if sched and sched.get("rows"):
        for row in sched["rows"]:
            data_rows.append(
                [
                    row[0] if len(row) > 0 else "",
                    "",
                    row[1] if len(row) > 1 else "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                ]
            )
    else:
        data_rows.append([""] * len(table_headers))

    for r_idx, r in enumerate(data_rows, start=data_start):
        for c_idx, val in enumerate(r, start=1):
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            align = "right" if 4 <= c_idx <= 6 else "left"
            cell.alignment = openpyxl.styles.Alignment(horizontal=align, vertical="center")
            cell.border = openpyxl.styles.Border(
                left=openpyxl.styles.Side(style="thin", color="cccccc"),
                right=openpyxl.styles.Side(style="thin", color="cccccc"),
                top=openpyxl.styles.Side(style="thin", color="cccccc"),
                bottom=openpyxl.styles.Side(style="thin", color="cccccc"),
            )

    widths = [12, 12, 12, 12, 12, 14, 10, 10, 12, 12, 12, 12, 12, 12, 12]
    for c_idx, w in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(c_idx)].width = w

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream
