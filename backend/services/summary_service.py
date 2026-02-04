"""
月次/週次サマリーサービス

残業時間の期間別集計機能を提供:
- 月次サマリー（年月指定）
- 週次サマリー（週番号指定）
- 部署別集計
- 傾向分析データ
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, date, timedelta
from collections import defaultdict
import pandas as pd

from backend.services.overtime import aggregate_overtime_by_employee, parse_hhmm_to_minutes
from backend.services.excel import fetch_grid_for_key, _normalized_header_key

logger = logging.getLogger(__name__)


class OvertimeSummaryService:
    """残業時間サマリーサービス"""

    def __init__(self, db):
        self.db = db

    def _get_punches_dataframe(self) -> Optional[pd.DataFrame]:
        """出退社時刻データをDataFrameとして取得"""
        grid = fetch_grid_for_key(self.db, "punches")
        if not grid:
            return None

        headers = grid.get("headers", [])
        rows = grid.get("rows", [])

        if not rows:
            return None

        df = pd.DataFrame(rows, columns=headers)
        return df

    def _normalize_column(self, df: pd.DataFrame, aliases: List[str]) -> Optional[str]:
        """カラム名を正規化して検出"""
        normalized = {_normalized_header_key(col): col for col in df.columns}
        for alias in aliases:
            key = _normalized_header_key(alias)
            if key in normalized:
                return normalized[key]
        return None

    def _parse_date(self, date_str: str) -> Optional[date]:
        """日付文字列をパース"""
        if not date_str or not isinstance(date_str, str):
            return None

        date_str = date_str.strip()

        # 複数フォーマットに対応
        formats = [
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%Y年%m月%d日",
            "%Y%m%d",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except (ValueError, TypeError):
                continue

        return None

    def get_monthly_summary(
        self,
        year: int,
        month: int,
        department: Optional[str] = None
    ) -> Dict:
        """
        月次サマリーを取得

        Args:
            year: 年
            month: 月 (1-12)
            department: 部署名（オプション、フィルタ用）

        Returns:
            月次サマリーデータ
        """
        df = self._get_punches_dataframe()
        if df is None:
            return {"error": "出退社時刻ファイルがアップロードされていません"}

        # カラム検出
        emp_col = self._normalize_column(df, ["従業員番号", "社員番号"])
        date_col = self._normalize_column(df, ["勤務日付", "勤務日"])
        end_time_col = self._normalize_column(df, ["退社時刻", "退勤時刻"])

        if not all([emp_col, date_col, end_time_col]):
            return {"error": "必須カラムが見つかりません"}

        # 日付をパース
        df['_date'] = df[date_col].apply(self._parse_date)
        df = df[df['_date'].notna()]

        # 指定月でフィルタ
        df['_year'] = df['_date'].apply(lambda d: d.year)
        df['_month'] = df['_date'].apply(lambda d: d.month)
        df_month = df[(df['_year'] == year) & (df['_month'] == month)]

        if df_month.empty:
            return {
                "year": year,
                "month": month,
                "total_employees": 0,
                "total_overtime_minutes": 0,
                "employees": [],
            }

        # 残業時間計算
        BASE_MINUTES = 17 * 60 + 30
        df_month['_overtime'] = df_month[end_time_col].apply(
            lambda x: max(0, (parse_hhmm_to_minutes(x) or 0) - BASE_MINUTES)
        )

        # 従業員別集計
        emp_summary = df_month.groupby(emp_col).agg(
            total_minutes=('_overtime', 'sum'),
            work_days=('_overtime', 'count'),
            avg_daily=('_overtime', 'mean'),
            max_daily=('_overtime', 'max'),
        ).reset_index()

        employees = []
        for _, row in emp_summary.iterrows():
            employees.append({
                "emp_no": str(row[emp_col]),
                "total_minutes": int(row['total_minutes']),
                "total_hours": round(row['total_minutes'] / 60, 1),
                "work_days": int(row['work_days']),
                "avg_daily_minutes": round(row['avg_daily'], 1),
                "max_daily_minutes": int(row['max_daily']),
            })

        # 全体統計
        total_overtime = int(emp_summary['total_minutes'].sum())
        avg_overtime = round(emp_summary['total_minutes'].mean(), 1) if len(emp_summary) > 0 else 0

        return {
            "year": year,
            "month": month,
            "period": f"{year}年{month}月",
            "total_employees": len(employees),
            "total_overtime_minutes": total_overtime,
            "total_overtime_hours": round(total_overtime / 60, 1),
            "avg_overtime_per_employee": avg_overtime,
            "employees": sorted(employees, key=lambda x: x['total_minutes'], reverse=True),
            "distribution": self._calculate_distribution(employees),
        }

    def get_weekly_summary(
        self,
        year: int,
        week: int
    ) -> Dict:
        """
        週次サマリーを取得

        Args:
            year: 年
            week: ISO週番号 (1-53)

        Returns:
            週次サマリーデータ
        """
        df = self._get_punches_dataframe()
        if df is None:
            return {"error": "出退社時刻ファイルがアップロードされていません"}

        # カラム検出
        emp_col = self._normalize_column(df, ["従業員番号", "社員番号"])
        date_col = self._normalize_column(df, ["勤務日付", "勤務日"])
        end_time_col = self._normalize_column(df, ["退社時刻", "退勤時刻"])

        if not all([emp_col, date_col, end_time_col]):
            return {"error": "必須カラムが見つかりません"}

        # 日付をパース
        df['_date'] = df[date_col].apply(self._parse_date)
        df = df[df['_date'].notna()]

        # ISO週番号でフィルタ
        df['_iso_week'] = df['_date'].apply(lambda d: d.isocalendar()[1])
        df['_iso_year'] = df['_date'].apply(lambda d: d.isocalendar()[0])
        df_week = df[(df['_iso_year'] == year) & (df['_iso_week'] == week)]

        # 週の開始日と終了日を計算
        week_start = datetime.strptime(f"{year}-W{week:02d}-1", "%G-W%V-%u").date()
        week_end = week_start + timedelta(days=6)

        if df_week.empty:
            return {
                "year": year,
                "week": week,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "total_employees": 0,
                "total_overtime_minutes": 0,
                "employees": [],
            }

        # 残業時間計算
        BASE_MINUTES = 17 * 60 + 30
        df_week['_overtime'] = df_week[end_time_col].apply(
            lambda x: max(0, (parse_hhmm_to_minutes(x) or 0) - BASE_MINUTES)
        )

        # 従業員別集計
        emp_summary = df_week.groupby(emp_col).agg(
            total_minutes=('_overtime', 'sum'),
            work_days=('_overtime', 'count'),
        ).reset_index()

        employees = []
        for _, row in emp_summary.iterrows():
            employees.append({
                "emp_no": str(row[emp_col]),
                "total_minutes": int(row['total_minutes']),
                "total_hours": round(row['total_minutes'] / 60, 1),
                "work_days": int(row['work_days']),
            })

        total_overtime = int(emp_summary['total_minutes'].sum())

        return {
            "year": year,
            "week": week,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "period": f"{year}年 第{week}週",
            "total_employees": len(employees),
            "total_overtime_minutes": total_overtime,
            "total_overtime_hours": round(total_overtime / 60, 1),
            "employees": sorted(employees, key=lambda x: x['total_minutes'], reverse=True),
        }

    def get_trend_data(
        self,
        months: int = 6
    ) -> Dict:
        """
        傾向分析データを取得

        Args:
            months: 取得する月数（現在月から遡る）

        Returns:
            月別の傾向データ
        """
        df = self._get_punches_dataframe()
        if df is None:
            return {"error": "出退社時刻ファイルがアップロードされていません"}

        # カラム検出
        emp_col = self._normalize_column(df, ["従業員番号", "社員番号"])
        date_col = self._normalize_column(df, ["勤務日付", "勤務日"])
        end_time_col = self._normalize_column(df, ["退社時刻", "退勤時刻"])

        if not all([emp_col, date_col, end_time_col]):
            return {"error": "必須カラムが見つかりません"}

        # 日付をパース
        df['_date'] = df[date_col].apply(self._parse_date)
        df = df[df['_date'].notna()]

        # 残業時間計算
        BASE_MINUTES = 17 * 60 + 30
        df['_overtime'] = df[end_time_col].apply(
            lambda x: max(0, (parse_hhmm_to_minutes(x) or 0) - BASE_MINUTES)
        )

        # 年月でグループ化
        df['_year_month'] = df['_date'].apply(lambda d: f"{d.year}-{d.month:02d}")

        monthly_data = df.groupby('_year_month').agg(
            total_overtime=('_overtime', 'sum'),
            total_records=('_overtime', 'count'),
            unique_employees=(emp_col, 'nunique'),
            avg_per_employee=('_overtime', lambda x: x.sum() / df[df['_year_month'] == x.name][emp_col].nunique() if len(x) > 0 else 0),
        ).reset_index()

        # 最新N月分を取得
        monthly_data = monthly_data.sort_values('_year_month', ascending=False).head(months)
        monthly_data = monthly_data.sort_values('_year_month', ascending=True)

        trend = []
        for _, row in monthly_data.iterrows():
            ym = row['_year_month']
            year, month = map(int, ym.split('-'))
            trend.append({
                "period": f"{year}年{month}月",
                "year_month": ym,
                "total_overtime_hours": round(row['total_overtime'] / 60, 1),
                "unique_employees": int(row['unique_employees']),
                "avg_overtime_per_employee_hours": round(row['total_overtime'] / row['unique_employees'] / 60, 1) if row['unique_employees'] > 0 else 0,
            })

        return {
            "months": months,
            "trend": trend,
        }

    def _calculate_distribution(self, employees: List[Dict]) -> Dict:
        """残業時間の分布を計算"""
        distribution = {
            "under_15h": 0,
            "15h_to_30h": 0,
            "30h_to_45h": 0,
            "45h_to_60h": 0,
            "over_60h": 0,
        }

        for emp in employees:
            hours = emp['total_hours']
            if hours < 15:
                distribution["under_15h"] += 1
            elif hours < 30:
                distribution["15h_to_30h"] += 1
            elif hours < 45:
                distribution["30h_to_45h"] += 1
            elif hours < 60:
                distribution["45h_to_60h"] += 1
            else:
                distribution["over_60h"] += 1

        return distribution


def get_summary_service(db) -> OvertimeSummaryService:
    """サマリーサービスのインスタンスを取得"""
    return OvertimeSummaryService(db)
