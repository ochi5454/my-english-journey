"""大量データ処理の最適化モジュール

7000行以上のデータを効率的に処理するための機能を提供:
- チャンク処理によるメモリ最適化
- Pandas/NumPyのベクトル化演算
- ストリーミング処理
- 並列処理サポート
"""

import math
from typing import Dict, List, Optional, Iterator, Tuple, Callable, Any
from datetime import datetime
import pandas as pd
import numpy as np
import pyarrow.parquet as pq
from io import BytesIO
import logging

from backend.models.dataset import Dataset, DatasetStatus

logger = logging.getLogger(__name__)

# デフォルトのチャンクサイズ
DEFAULT_CHUNK_SIZE = 5000
SMALL_CHUNK_SIZE = 1000
LARGE_CHUNK_SIZE = 10000


class ChunkedDataProcessor:
    """チャンク処理によるメモリ効率の良いデータ処理"""

    def __init__(self, chunk_size: int = DEFAULT_CHUNK_SIZE):
        self.chunk_size = chunk_size
        self._stats = {
            "total_rows_processed": 0,
            "chunks_processed": 0,
            "processing_time_ms": 0,
        }

    def iter_parquet_chunks(
        self,
        dataset: Dataset,
        columns: Optional[List[str]] = None
    ) -> Iterator[pd.DataFrame]:
        """Parquetファイルをチャンク単位で読み込み"""
        pf = pq.ParquetFile(dataset.stored_path)

        for batch in pf.iter_batches(batch_size=self.chunk_size, columns=columns):
            df = batch.to_pandas()
            self._stats["chunks_processed"] += 1
            self._stats["total_rows_processed"] += len(df)
            yield df

    def process_with_callback(
        self,
        dataset: Dataset,
        processor: Callable[[pd.DataFrame], pd.DataFrame],
        columns: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[pd.DataFrame]:
        """
        コールバック関数でチャンクを処理

        Args:
            dataset: 処理対象のデータセット
            processor: 各チャンクに適用する処理関数
            columns: 読み込む列（Noneなら全列）
            progress_callback: 進捗コールバック (processed, total)
        """
        results = []
        total_rows = dataset.row_count or 0
        processed = 0

        for chunk in self.iter_parquet_chunks(dataset, columns):
            result = processor(chunk)
            results.append(result)
            processed += len(chunk)

            if progress_callback:
                progress_callback(processed, total_rows)

        return results

    def aggregate_chunks(
        self,
        chunks: List[pd.DataFrame],
        group_by: List[str],
        aggregations: Dict[str, str]
    ) -> pd.DataFrame:
        """
        複数チャンクの結果を集約

        Args:
            chunks: 処理済みチャンクのリスト
            group_by: グループ化するカラム
            aggregations: 集約方法 {"column": "sum|mean|count|max|min"}
        """
        if not chunks:
            return pd.DataFrame()

        combined = pd.concat(chunks, ignore_index=True)

        agg_dict = {}
        for col, method in aggregations.items():
            if col in combined.columns:
                agg_dict[col] = method

        if not agg_dict:
            return combined

        return combined.groupby(group_by, as_index=False).agg(agg_dict)

    @property
    def stats(self) -> Dict:
        return self._stats.copy()


class VectorizedOvertimeCalculator:
    """ベクトル化された残業時間計算"""

    BASE_MINUTES = 17 * 60 + 30  # 17:30

    @staticmethod
    def parse_hhmm_vectorized(series: pd.Series) -> pd.Series:
        """HH:MM形式の時刻をベクトル化して分に変換"""
        # 欠損値の処理
        mask_null = series.isna() | (series == '') | (series == 'nan')

        # 文字列に変換
        str_series = series.astype(str).str.strip()

        # ":" を含む形式の処理 (HH:MM)
        mask_colon = str_series.str.contains(':', na=False)

        # 数値形式の処理 (HHMM)
        result = pd.Series(index=series.index, dtype=float)

        # HH:MM形式
        if mask_colon.any():
            split = str_series[mask_colon].str.split(':', expand=True)
            if len(split.columns) >= 2:
                hours = pd.to_numeric(split[0], errors='coerce').fillna(0)
                minutes = pd.to_numeric(split[1], errors='coerce').fillna(0)
                result[mask_colon] = hours * 60 + minutes

        # HHMM形式
        mask_numeric = ~mask_colon & ~mask_null
        if mask_numeric.any():
            numeric_vals = pd.to_numeric(str_series[mask_numeric], errors='coerce').fillna(0).astype(int)
            result[mask_numeric] = (numeric_vals // 100) * 60 + (numeric_vals % 100)

        # Null値は0
        result[mask_null] = 0

        return result.fillna(0).astype(int)

    @classmethod
    def calculate_overtime_vectorized(
        cls,
        end_times: pd.Series,
        base_minutes: int = None
    ) -> pd.Series:
        """残業時間をベクトル化して計算"""
        if base_minutes is None:
            base_minutes = cls.BASE_MINUTES

        end_minutes = cls.parse_hhmm_vectorized(end_times)
        overtime = (end_minutes - base_minutes).clip(lower=0)

        return overtime

    @classmethod
    def aggregate_overtime_vectorized(
        cls,
        df: pd.DataFrame,
        emp_col: str = "従業員番号",
        end_time_col: str = "退社時刻",
        date_col: str = "勤務日付"
    ) -> pd.DataFrame:
        """
        従業員別の残業時間をベクトル化して集計

        ループ処理の代わりにPandasのgroupby操作を使用
        """
        # 必須列の確認
        required_cols = [emp_col, end_time_col]
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            raise ValueError(f"必須列が見つかりません: {', '.join(missing)}")

        # 残業時間を計算
        df = df.copy()
        df['_overtime_minutes'] = cls.calculate_overtime_vectorized(df[end_time_col])

        # 従業員番号でグループ化して集計
        result = df.groupby(emp_col, as_index=False).agg(
            total_minutes=('_overtime_minutes', 'sum'),
            work_days=('_overtime_minutes', 'count'),
            avg_daily_overtime=('_overtime_minutes', 'mean'),
            max_daily_overtime=('_overtime_minutes', 'max'),
        )

        # 日別詳細が必要な場合
        if date_col in df.columns:
            daily = df.groupby([emp_col, date_col], as_index=False).agg(
                minutes=('_overtime_minutes', 'sum')
            )
            daily_dict = daily.groupby(emp_col).apply(
                lambda x: x[[date_col, 'minutes']].to_dict('records')
            ).to_dict()
            result['daily'] = result[emp_col].map(lambda x: daily_dict.get(x, []))

        return result


class StreamingExporter:
    """ストリーミング方式のエクスポート処理"""

    def __init__(self, chunk_size: int = SMALL_CHUNK_SIZE):
        self.chunk_size = chunk_size

    def stream_csv(
        self,
        dataset: Dataset,
        columns: Optional[List[str]] = None,
        transform: Optional[Callable[[pd.DataFrame], pd.DataFrame]] = None
    ) -> Iterator[bytes]:
        """
        CSVをストリーミング出力

        メモリ効率が良く、大量データに適している
        """
        processor = ChunkedDataProcessor(self.chunk_size)
        first_chunk = True

        for chunk in processor.iter_parquet_chunks(dataset, columns):
            if transform:
                chunk = transform(chunk)

            # ヘッダーは最初のチャンクのみ
            csv_bytes = chunk.to_csv(
                index=False,
                header=first_chunk,
                encoding='utf-8-sig'
            ).encode('utf-8-sig')

            first_chunk = False
            yield csv_bytes

    def stream_json(
        self,
        dataset: Dataset,
        columns: Optional[List[str]] = None,
        transform: Optional[Callable[[pd.DataFrame], pd.DataFrame]] = None
    ) -> Iterator[bytes]:
        """
        JSONをストリーミング出力（JSON Lines形式）
        """
        processor = ChunkedDataProcessor(self.chunk_size)

        for chunk in processor.iter_parquet_chunks(dataset, columns):
            if transform:
                chunk = transform(chunk)

            # 各行をJSON Linesとして出力
            for _, row in chunk.iterrows():
                yield (row.to_json(force_ascii=False) + '\n').encode('utf-8')


class DataFilterOptimizer:
    """データフィルタリングの最適化"""

    @staticmethod
    def filter_with_index(
        df: pd.DataFrame,
        filters: Dict[str, Any]
    ) -> pd.DataFrame:
        """
        インデックスを活用した高速フィルタリング

        Args:
            df: フィルタリング対象のDataFrame
            filters: フィルタ条件 {"column": value} or {"column": [values]}
        """
        if not filters:
            return df

        mask = pd.Series(True, index=df.index)

        for col, value in filters.items():
            if col not in df.columns:
                continue

            if isinstance(value, list):
                # リストの場合はisin
                mask &= df[col].isin(value)
            elif isinstance(value, dict):
                # 辞書の場合は範囲フィルタ
                if 'min' in value:
                    mask &= df[col] >= value['min']
                if 'max' in value:
                    mask &= df[col] <= value['max']
                if 'contains' in value:
                    mask &= df[col].astype(str).str.contains(value['contains'], na=False)
            else:
                # 単一値の場合は等価比較
                mask &= df[col] == value

        return df[mask]

    @staticmethod
    def search_optimized(
        df: pd.DataFrame,
        search_term: str,
        search_columns: List[str],
        limit: int = 100
    ) -> pd.DataFrame:
        """
        複数カラムに対する最適化された検索
        """
        if not search_term or not search_columns:
            return df.head(limit) if limit else df

        search_term_lower = search_term.lower()

        # 検索対象カラムを文字列に変換して結合
        valid_cols = [c for c in search_columns if c in df.columns]
        if not valid_cols:
            return df.head(limit) if limit else df

        # 複数カラムを結合して一度に検索（高速化）
        combined = df[valid_cols].fillna('').astype(str).agg(' '.join, axis=1).str.lower()
        mask = combined.str.contains(search_term_lower, na=False)

        result = df[mask]
        return result.head(limit) if limit else result


def optimize_overtime_aggregation(
    db,
    file_key: str = "punches",
    chunk_size: int = DEFAULT_CHUNK_SIZE
) -> List[Dict]:
    """
    最適化された残業時間集計

    従来のループ処理の代わりにベクトル化処理を使用
    """
    from backend.services.excel import fetch_grid_for_key

    # データ取得
    grid = fetch_grid_for_key(db, file_key)
    if not grid:
        return []

    headers = grid.get("headers", [])
    rows = grid.get("rows", [])

    if not rows:
        return []

    # DataFrameに変換
    df = pd.DataFrame(rows, columns=headers)

    # カラム名の正規化
    col_mapping = {}
    for col in df.columns:
        normalized = col.lower().replace(" ", "").replace("　", "")
        if "従業員番号" in col or "社員番号" in col:
            col_mapping[col] = "emp_no"
        elif "退社時刻" in col or "退勤時刻" in col:
            col_mapping[col] = "end_time"
        elif "勤務日付" in col or "勤務日" in col:
            col_mapping[col] = "work_date"

    df = df.rename(columns=col_mapping)

    # 必須カラムの確認
    required = ["emp_no", "end_time"]
    if not all(c in df.columns for c in required):
        raise ValueError("必須列が見つかりません")

    # ベクトル化計算
    calculator = VectorizedOvertimeCalculator()
    result_df = calculator.aggregate_overtime_vectorized(
        df,
        emp_col="emp_no",
        end_time_col="end_time",
        date_col="work_date" if "work_date" in df.columns else None
    )

    # 結果を辞書リストに変換
    return result_df.to_dict('records')


def get_processing_stats(dataset: Dataset) -> Dict:
    """
    データセットの処理統計を取得

    最適な処理パラメータを決定するのに使用
    """
    try:
        pf = pq.ParquetFile(dataset.stored_path)
        metadata = pf.metadata

        return {
            "row_count": metadata.num_rows,
            "row_groups": metadata.num_row_groups,
            "columns": metadata.num_columns,
            "created_by": metadata.created_by,
            "recommended_chunk_size": min(
                LARGE_CHUNK_SIZE,
                max(SMALL_CHUNK_SIZE, metadata.num_rows // 10)
            ),
            "estimated_memory_mb": (metadata.num_rows * metadata.num_columns * 50) / (1024 * 1024),
        }
    except Exception as e:
        logger.warning(f"Failed to get processing stats: {e}")
        return {
            "row_count": dataset.row_count or 0,
            "recommended_chunk_size": DEFAULT_CHUNK_SIZE,
        }
