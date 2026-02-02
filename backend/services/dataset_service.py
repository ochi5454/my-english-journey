import io
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd
import pyarrow as pa
import pyarrow.csv as pv_csv
import pyarrow.parquet as pq

from backend.models.dataset import Dataset, DatasetStatus
from backend.services.storage import LocalStorage, Storage


def _normalize_header(header: str) -> str:
    if header is None:
        return ""
    h = str(header)
    h = h.strip()
    return (
        h.replace(" ", "")
        .replace("　", "")
        .replace("/", "")
        .replace("(", "")
        .replace(")", "")
        .replace("（", "")
        .replace("）", "")
        .replace("[", "")
        .replace("]", "")
        .lower()
    )


def _detect_date_columns(df: pd.DataFrame) -> List[str]:
    date_cols: List[str] = []
    for col in df.columns:
        sample = df[col].dropna().astype(str).head(20)
        if sample.empty:
            continue
        try:
            parsed = pd.to_datetime(sample, errors="raise", format=None, utc=False)
            # require at least half to succeed
            if parsed.notna().mean() >= 0.6:
                date_cols.append(col)
        except Exception:
            continue
    return date_cols


def _load_dataframe(path: str, content_type: Optional[str]) -> pd.DataFrame:
    suffix = os.path.splitext(path)[1].lower()
    if suffix in [".csv", ".txt"]:
        return pd.read_csv(path, dtype=str, keep_default_na=False)
    if suffix in [".xlsx", ".xls"]:
        return pd.read_excel(path, dtype=str, engine="openpyxl")
    # fallback: try arrow csv
    table = pv_csv.read_csv(path)
    return table.to_pandas()


def _build_schema(df: pd.DataFrame) -> List[Dict]:
    schema = []
    for col in df.columns:
        schema.append(
            {
                "original_name": col,
                "normalized_name": _normalize_header(col),
                "dtype": str(df[col].dtype),
            }
        )
    return schema


class DatasetService:
    def __init__(self, storage: Storage | None = None):
        self.storage = storage or LocalStorage()

    def save_upload(self, file_obj: io.BytesIO, filename: str, kind: str, content_type: Optional[str], db) -> Dataset:
        raw_key = f"{kind}/{uuid.uuid4()}{os.path.splitext(filename)[1]}"
        file_obj.seek(0)
        stored_path = self.storage.put(file_obj, raw_key)
        dataset = Dataset(
            kind=kind,
            stored_path=stored_path,
            original_filename=filename,
            content_type=content_type,
            size=os.path.getsize(stored_path),
            status=DatasetStatus.pending,
            uploaded_at=datetime.utcnow(),
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        return dataset

    def convert_to_parquet(self, dataset: Dataset, db) -> Dataset:
        """
        Load the uploaded file, normalize headers, convert to Parquet for efficient reads.
        Updates dataset.stored_path to parquet path.
        """
        df = _load_dataframe(dataset.stored_path, dataset.content_type)
        original_path = dataset.stored_path

        # preserve original headers but ensure no Nones
        df.columns = [col if col is not None else "" for col in df.columns]

        # parse dates
        for col in _detect_date_columns(df):
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce").dt.date.astype(str)
            except Exception:
                continue

        parquet_full_path = os.path.join(os.path.dirname(dataset.stored_path), f"{dataset.id}.parquet")
        table = pa.Table.from_pandas(df, preserve_index=False)
        pq.write_table(table, parquet_full_path, compression="snappy")

        dataset.schema_json = _build_schema(df)
        dataset.row_count = len(df)
        dataset.status = DatasetStatus.ready
        dataset.stored_path = parquet_full_path
        dataset.updated_at = datetime.utcnow()
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        # clean original file to save space
        if os.path.exists(original_path):
            try:
                os.remove(original_path)
            except OSError:
                pass
        return dataset

    def query_dataset(
        self,
        dataset: Dataset,
        filters: Dict,
        page: int = 1,
        page_size: int = 25,
    ) -> Tuple[List[str], List[List[str]], int]:
        if dataset.status != DatasetStatus.ready:
            raise ValueError("dataset not ready")
        table = pq.read_table(dataset.stored_path)
        df = table.to_pandas()

        normalized_map = {item.get("normalized_name"): item.get("original_name") for item in (dataset.schema_json or [])}

        def pick_col(candidates: List[str]) -> Optional[str]:
            for cand in candidates:
                for norm, orig in normalized_map.items():
                    if cand in norm:
                        return orig
                for col in df.columns:
                    if cand in col:
                        return col
            return None

        name_col = pick_col(["氏名", "name"])
        emp_col = pick_col(["従業員番号", "社員番号", "empno", "emp_no"])
        dept_col = pick_col(["所属コード", "org", "部署"])
        date_col = pick_col(["日付", "日", "date"])

        if filters:
            if filters.get("employeeName") and name_col:
                val = str(filters["employeeName"]).strip()
                df = df[df[name_col].astype(str).str.contains(val, na=False)]
            if filters.get("employeeNo") and emp_col:
                val = str(filters["employeeNo"]).strip()
                df = df[df[emp_col].astype(str).str.startswith(val, na=False)]
            if filters.get("deptCode") and dept_col:
                val = str(filters["deptCode"]).strip()
                df = df[df[dept_col].astype(str).str.startswith(val, na=False)]
            if date_col:
                date_from = filters.get("dateFrom")
                date_to = filters.get("dateTo")
                if date_from:
                    df = df[df[date_col] >= str(date_from)]
                if date_to:
                    df = df[df[date_col] <= str(date_to)]

        total = len(df)
        page = max(page, 1)
        page_size = max(1, min(page_size, 500))
        start = (page - 1) * page_size
        end = start + page_size
        paged = df.iloc[start:end]
        columns = list(df.columns)
        rows = paged.fillna("").astype(str).values.tolist()
        return columns, rows, total

    def export_dataset(self, dataset: Dataset, filters: Dict) -> io.BytesIO:
        columns, rows, _ = self.query_dataset(dataset, filters, page=1, page_size=10**9)
        df = pd.DataFrame(rows, columns=columns)
        buffer = io.StringIO()
        df.to_csv(buffer, index=False)
        stream = io.BytesIO(buffer.getvalue().encode("utf-8"))
        stream.seek(0)
        return stream

    def delete_dataset(self, dataset: Dataset, db) -> None:
        try:
            os.remove(dataset.stored_path)
        except FileNotFoundError:
            pass
        db.delete(dataset)
        db.commit()
