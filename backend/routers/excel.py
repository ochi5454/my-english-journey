import os
import tempfile
import time
from datetime import date
import io
import uuid
import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, Body, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.core.config import DATA_DIR, Settings
from backend.core.database import get_db
from backend.core.exceptions import AppException, ErrorCode
from backend.core.audit import audit_action, AuditAction
from backend.models.excel import ExcelFile, ExcelCell, ExportCache
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.excel import FILE_DEFINITIONS, fetch_grid_for_key, build_processed_excel
from backend.services.dataset_service import DatasetService
from backend.services.overtime import aggregate_overtime_by_employee, BASE_MINUTES
from backend.services.overtime_alert import (
    check_overtime_alerts,
    get_alert_summary,
    alerts_to_dict,
    AlertLevel,
    OvertimeThreshold,
)
from backend.services.data_processing import (
    ChunkedDataProcessor,
    VectorizedOvertimeCalculator,
    StreamingExporter,
    DataFilterOptimizer,
    optimize_overtime_aggregation,
    get_processing_stats,
)
from backend.services.job_manager import get_job_manager, InMemoryJobManager
from backend.services.background_worker import get_background_worker, BackgroundWorker
from backend.services.upload_tasks import process_upload_task
from backend.services.summary_service import get_summary_service
from backend.utils.file_hash import compute_file_hash, check_duplicate_file


router = APIRouter(prefix="/excel", tags=["excel"])
settings = Settings()
limiter = Limiter(key_func=get_remote_address)
dataset_service = DatasetService()


@router.get("/config")
def list_excel_config():
    return FILE_DEFINITIONS


@router.get("/punches/overtime")
def get_punches_overtime(db=Depends(get_db)):
    grid = fetch_grid_for_key(db, "punches")
    if not grid:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail="出退社時刻ファイルがアップロードされていません")
    try:
        aggregates = aggregate_overtime_by_employee(grid)
    except ValueError as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=str(exc))
    return {
        "base_minutes": BASE_MINUTES,
        "rows": aggregates,
    }


@router.get("/overtime/alerts")
def get_overtime_alerts(
    min_level: str = "warning",
    db=Depends(get_db)
):
    """
    36協定アラートを取得

    残業時間が閾値を超えている従業員のアラートを返します。

    閾値:
    - INFO (15h〜): 監視対象
    - WARNING (30h〜): 社内上限接近
    - DANGER (45h〜): 法定上限接近
    - CRITICAL (60h〜): 特別条項発動

    Query Parameters:
    - min_level: 最小アラートレベル（info, warning, danger, critical）
    """
    # 出退社時刻データを取得
    grid = fetch_grid_for_key(db, "punches")
    if not grid:
        return {
            "alerts": [],
            "summary": {
                "total": 0,
                "by_level": {},
                "by_department": {},
                "critical_count": 0,
                "danger_count": 0,
                "warning_count": 0,
            },
            "message": "出退社時刻ファイルがアップロードされていません",
        }

    try:
        overtime_data = aggregate_overtime_by_employee(grid)
    except ValueError as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=str(exc))

    # アラートレベルを変換
    level_map = {
        "info": AlertLevel.INFO,
        "warning": AlertLevel.WARNING,
        "danger": AlertLevel.DANGER,
        "critical": AlertLevel.CRITICAL,
    }
    alert_level = level_map.get(min_level.lower(), AlertLevel.WARNING)

    # アラートを生成
    alerts = check_overtime_alerts(overtime_data, min_level=alert_level)
    summary = get_alert_summary(alerts)

    return {
        "alerts": alerts_to_dict(alerts),
        "summary": summary,
        "thresholds": {
            "info": 15,
            "warning": 30,
            "danger": 45,
            "critical": 60,
            "max": 80,
        },
    }


@router.get("/export-cache")
def get_export_cache(db=Depends(get_db)):
    latest = db.query(ExportCache).order_by(ExportCache.id.desc()).first()
    return {"payload": latest.payload if latest else None}


@router.post("/export-cache")
def set_export_cache(payload: dict = Body(default={}, embed=False), db=Depends(get_db)):
    if not isinstance(payload, dict) or "rows" not in payload:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail="payloadにrowsが含まれていません")
    cache = ExportCache(payload=payload, created_at=date.today())
    db.add(cache)
    db.commit()
    return {"status": "ok"}


@router.post("/{file_key}/upload")
@limiter.limit(f"{settings.rate_limit_upload}/minute")
async def upload_excel(request: Request, file_key: str, file: UploadFile = File(...), db=Depends(get_db)):
    # ファイルキー検証
    if file_key not in FILE_DEFINITIONS:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail=f"不明なファイルキー: {file_key}")

    # ファイル形式検証
    filename = file.filename or ""
    if not filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise AppException(ErrorCode.INVALID_FILE_FORMAT)

    timings = {}
    t0 = time.perf_counter()

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)

    # ファイルサイズ検証
    MAX_SIZE_MB = 200
    if size_mb > MAX_SIZE_MB:
        raise AppException(
            ErrorCode.FILE_TOO_LARGE,
            detail=f"ファイルサイズ ({size_mb:.1f}MB) が上限 ({MAX_SIZE_MB}MB) を超えています"
        )

    # 重複ファイル検出
    content_hash = compute_file_hash(content)
    duplicate = check_duplicate_file(db, content_hash, file_key)
    if duplicate:
        return {
            "file_key": file_key,
            "dataset_id": duplicate["dataset_id"],
            "rows": duplicate["row_count"],
            "status": "ready",
            "is_duplicate": True,
            "original_upload": duplicate["uploaded_at"],
            "message": f"同一内容のファイルが既にアップロードされています（{duplicate['original_filename']}）",
        }

    dataset = dataset_service.save_upload(io.BytesIO(content), file.filename, file_key, file.content_type, db)
    dataset.content_hash = content_hash
    db.add(dataset)
    try:
        dataset = dataset_service.convert_to_parquet(dataset, db)
    except Exception as exc:
        dataset.status = DatasetStatus.failed
        db.add(dataset)
        db.commit()
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=str(exc))

    timings["total_ms"] = round((time.perf_counter() - t0) * 1000)

    # ファイルアップロードを監査ログに記録
    audit_action(
        db=db,
        action=AuditAction.FILE_UPLOAD,
        request=request,
        resource_type="dataset",
        resource_id=str(dataset.id),
        details={
            "file_key": file_key,
            "filename": file.filename,
            "size_mb": round(size_mb, 2),
            "row_count": dataset.row_count,
        },
    )

    return {
        "file_key": file_key,
        "dataset_id": dataset.id,
        "rows": dataset.row_count,
        "status": dataset.status.value if dataset.status else None,
        "timings_ms": timings,
    }


@router.post("/{file_key}/upload-async", status_code=202)
@limiter.limit(f"{settings.rate_limit_upload}/minute")
async def upload_excel_async(
    request: Request,
    file_key: str,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    job_manager: InMemoryJobManager = Depends(get_job_manager),
    worker: BackgroundWorker = Depends(get_background_worker),
):
    """
    ファイルアップロード（非同期版）

    HTTPステータス: 202 Accepted（処理受付）
    即座にjob_idを返し、バックグラウンドで処理を実行

    クライアントは GET /jobs/{job_id} でポーリングして進捗確認
    """

    # ファイルキー検証
    if file_key not in FILE_DEFINITIONS:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail=f"不明なファイルキー: {file_key}")

    # ファイル形式検証
    filename = file.filename or ""
    if not filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise AppException(ErrorCode.INVALID_FILE_FORMAT)

    # ファイルサイズチェック
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)

    MAX_SIZE_MB = 200
    if size_mb > MAX_SIZE_MB:
        raise AppException(
            ErrorCode.FILE_TOO_LARGE,
            detail=f"ファイルサイズ ({size_mb:.1f}MB) が上限 ({MAX_SIZE_MB}MB) を超えています"
        )

    # ジョブ作成
    job_id = str(uuid.uuid4())
    await job_manager.create(job_id)

    # バックグラウンドタスク登録
    background_tasks.add_task(
        worker.execute,
        job_id=job_id,
        task_func=process_upload_task,
        file_content=content,
        filename=file.filename,
        file_key=file_key,
        content_type=file.content_type,
    )

    return {
        "job_id": job_id,
        "status": "pending",
        "message": "処理を開始しました。GET /jobs/{job_id} で進捗を確認できます。"
    }


@router.get("/{file_key}")
def get_excel(file_key: str, db=Depends(get_db)):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")
    try:
        df = pd.read_parquet(dataset.stored_path)
    except Exception as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=f"データの読み込みに失敗しました: {exc}")

    headers = list(df.columns)
    rows = df.head(500).fillna("").astype(str).values.tolist()
    grid = [headers, *rows]

    formatted = [
        {
          "name": "Sheet1",
          "headers": headers,
          "rows": rows,
          "grid": grid,
        }
    ]

    return {
        "file_key": dataset.kind,
        "file_name": dataset.original_filename,
        "dataset_id": dataset.id,
        "version": 1,
        "sheets": formatted,
        "expected_headers": FILE_DEFINITIONS.get(file_key, {}).get("expected_headers", []),
    }


@router.post("/processed/excel")
def generate_processed_excel(request: Request, payload: dict = Body(default={} ,embed=False), db=Depends(get_db)):
    target_ym = payload.get("target_ym", "") if isinstance(payload, dict) else ""
    file_key = payload.get("file_key", "person_progress") if isinstance(payload, dict) else "person_progress"

    grid = fetch_grid_for_key(db, file_key)
    if not grid:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータがアップロードされていません")

    try:
        stream = build_processed_excel(grid, target_ym)
    except ValueError as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=str(exc))
    stamp = date.today().strftime("%Y%m%d")
    filename = f"{target_ym or '実所定外時間'}_推計データ_{stamp}.xlsx"

    # データエクスポートを監査ログに記録
    audit_action(
        db=db,
        action=AuditAction.DATA_EXPORT,
        request=request,
        resource_type="excel_export",
        details={
            "target_ym": target_ym,
            "file_key": file_key,
            "filename": filename,
        },
    )

    headers = {
        "Content-Disposition": f'attachment; filename=\"{filename}\"'
    }
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/punches/overtime-optimized")
def get_punches_overtime_optimized(db=Depends(get_db)):
    """
    残業時間集計（最適化版）

    ベクトル化処理により大量データ（7000行以上）でも高速に集計。
    従来の /punches/overtime よりも高速。
    """
    try:
        result = optimize_overtime_aggregation(db, "punches")
    except ValueError as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=str(exc))

    if not result:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail="出退社時刻ファイルがアップロードされていません")

    return {
        "base_minutes": BASE_MINUTES,
        "rows": result,
        "optimized": True,
    }


@router.get("/{file_key}/stream-csv")
def stream_csv_export(
    request: Request,
    file_key: str,
    db=Depends(get_db)
):
    """
    CSVストリーミングエクスポート

    大量データをメモリ効率よくストリーミング出力。
    チャンク単位で処理するため、メモリ使用量を抑制。
    """
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")

    # ストリーミングエクスポーター
    exporter = StreamingExporter(chunk_size=2000)

    def generate():
        for chunk in exporter.stream_csv(dataset):
            yield chunk

    stamp = date.today().strftime("%Y%m%d")
    filename = f"{file_key}_export_{stamp}.csv"

    # エクスポートを監査ログに記録
    audit_action(
        db=db,
        action=AuditAction.DATA_EXPORT,
        request=request,
        resource_type="csv_stream_export",
        details={
            "file_key": file_key,
            "filename": filename,
            "row_count": dataset.row_count,
        },
    )

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Total-Rows": str(dataset.row_count or 0),
    }
    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8-sig",
        headers=headers
    )


@router.get("/{file_key}/stats")
def get_dataset_stats(file_key: str, db=Depends(get_db)):
    """
    データセットの処理統計を取得

    データセットのサイズや推奨チャンクサイズなど、
    パフォーマンスチューニングに役立つ情報を返します。
    """
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")

    stats = get_processing_stats(dataset)
    stats["file_key"] = file_key
    stats["dataset_id"] = dataset.id
    stats["original_filename"] = dataset.original_filename
    stats["uploaded_at"] = dataset.uploaded_at.isoformat() if dataset.uploaded_at else None

    return stats


@router.post("/{file_key}/search")
def search_data(
    request: Request,
    file_key: str,
    query: str = Body(..., embed=True),
    columns: list = Body(default=None, embed=True),
    limit: int = Body(default=100, embed=True),
    db=Depends(get_db)
):
    """
    データ検索（最適化版）

    複数カラムに対して高速な全文検索を実行。
    """
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")

    try:
        df = pd.read_parquet(dataset.stored_path)
    except Exception as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=f"データの読み込みに失敗しました: {exc}")

    # 検索対象カラムの決定
    search_cols = columns if columns else list(df.columns)

    # 最適化された検索
    result_df = DataFilterOptimizer.search_optimized(
        df, query, search_cols, limit=limit
    )

    headers = list(result_df.columns)
    rows = result_df.fillna("").astype(str).values.tolist()

    return {
        "file_key": file_key,
        "query": query,
        "total_found": len(result_df),
        "headers": headers,
        "rows": rows,
    }


@router.post("/{file_key}/query")
def query_data_with_sort_filter(
    request: Request,
    file_key: str,
    filters: dict = Body(default=None, embed=True),
    sort_by: str = Body(default=None, embed=True),
    sort_order: str = Body(default="asc", embed=True),
    page: int = Body(default=1, embed=True),
    page_size: int = Body(default=25, embed=True),
    db=Depends(get_db)
):
    """
    データクエリ（ソート・フィルター対応）

    Args:
        filters: フィルター条件
            - 単一値: {"column": "value"} - 完全一致
            - 複数値: {"column": ["val1", "val2"]} - いずれかに一致
            - 範囲: {"column": {"min": 0, "max": 100}} - 範囲指定
            - 部分一致: {"column": {"contains": "検索語"}}
        sort_by: ソート対象カラム名
        sort_order: ソート順序 ("asc" or "desc")
        page: ページ番号 (1から開始)
        page_size: 1ページあたりの行数 (最大100)

    Returns:
        ソート・フィルター済みのデータとページネーション情報
    """
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")

    try:
        df = pd.read_parquet(dataset.stored_path)
    except Exception as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=f"データの読み込みに失敗しました: {exc}")

    # フィルター適用
    if filters:
        df = DataFilterOptimizer.filter_with_index(df, filters)

    total_count = len(df)

    # ソート適用
    if sort_by and sort_by in df.columns:
        ascending = sort_order.lower() != "desc"
        df = df.sort_values(by=sort_by, ascending=ascending, na_position='last')

    # ページネーション
    page_size = min(max(1, page_size), 100)  # 1〜100に制限
    page = max(1, page)
    offset = (page - 1) * page_size
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1

    df_page = df.iloc[offset:offset + page_size]

    headers = list(df_page.columns)
    rows = df_page.fillna("").astype(str).values.tolist()

    return {
        "file_key": file_key,
        "headers": headers,
        "rows": rows,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
        "sort": {
            "column": sort_by,
            "order": sort_order,
        },
        "filters_applied": filters or {},
    }


@router.get("/{file_key}/columns")
def get_column_info(file_key: str, db=Depends(get_db)):
    """
    カラム情報を取得

    ソート・フィルターUIを構築するためのカラムメタデータを返します。
    各カラムのデータ型、ユニーク値数、サンプル値などを含む。
    """
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=f"{file_key}のデータが見つかりません")

    try:
        df = pd.read_parquet(dataset.stored_path)
    except Exception as exc:
        raise AppException(ErrorCode.FILE_PROCESSING_FAILED, detail=f"データの読み込みに失敗しました: {exc}")

    columns_info = []
    for col in df.columns:
        col_data = df[col]
        dtype = str(col_data.dtype)

        # 数値型の判定
        is_numeric = pd.api.types.is_numeric_dtype(col_data)

        # ユニーク値の取得（最大20個）
        unique_count = col_data.nunique()
        sample_values = []
        if unique_count <= 20:
            sample_values = col_data.dropna().unique().tolist()[:20]
            # 数値以外は文字列に変換
            sample_values = [str(v) if not isinstance(v, (int, float)) else v for v in sample_values]

        # 数値型の場合は統計情報
        stats = {}
        if is_numeric:
            stats = {
                "min": float(col_data.min()) if not col_data.isna().all() else None,
                "max": float(col_data.max()) if not col_data.isna().all() else None,
                "mean": float(col_data.mean()) if not col_data.isna().all() else None,
            }

        columns_info.append({
            "name": col,
            "dtype": dtype,
            "is_numeric": is_numeric,
            "unique_count": unique_count,
            "null_count": int(col_data.isna().sum()),
            "sample_values": sample_values if unique_count <= 20 else [],
            "is_filterable": unique_count <= 100,  # 100個以下ならドロップダウンフィルター可能
            "is_sortable": True,
            "stats": stats if is_numeric else {},
        })

    return {
        "file_key": file_key,
        "total_rows": len(df),
        "columns": columns_info,
    }


@router.get("/summary/monthly/{year}/{month}")
def get_monthly_summary(
    year: int,
    month: int,
    department: str = None,
    db=Depends(get_db)
):
    """
    月次残業サマリーを取得

    Args:
        year: 年（例: 2026）
        month: 月（1-12）
        department: 部署名（オプション、フィルタ用）

    Returns:
        月次の残業時間サマリー（従業員別）
    """
    if month < 1 or month > 12:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail="月は1〜12の範囲で指定してください")

    summary_service = get_summary_service(db)
    result = summary_service.get_monthly_summary(year, month, department)

    if "error" in result:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=result["error"])

    return result


@router.get("/summary/weekly/{year}/{week}")
def get_weekly_summary(
    year: int,
    week: int,
    db=Depends(get_db)
):
    """
    週次残業サマリーを取得

    Args:
        year: 年（例: 2026）
        week: ISO週番号（1-53）

    Returns:
        週次の残業時間サマリー（従業員別）
    """
    if week < 1 or week > 53:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail="週番号は1〜53の範囲で指定してください")

    summary_service = get_summary_service(db)
    result = summary_service.get_weekly_summary(year, week)

    if "error" in result:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=result["error"])

    return result


@router.get("/summary/trend")
def get_trend_data(
    months: int = 6,
    db=Depends(get_db)
):
    """
    残業時間の傾向データを取得

    Args:
        months: 取得する月数（1-12、デフォルト: 6）

    Returns:
        月別の傾向データ（グラフ表示用）
    """
    months = min(max(1, months), 12)

    summary_service = get_summary_service(db)
    result = summary_service.get_trend_data(months)

    if "error" in result:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=result["error"])

    return result


# PDF Export Endpoints
@router.get("/export/pdf/overtime")
def export_overtime_pdf(
    department: str = None,
    db=Depends(get_db)
):
    """
    残業データをPDF形式でエクスポート

    Args:
        department: 部署フィルター（省略時は全部署）

    Returns:
        PDFファイル
    """
    from backend.services.pdf_export import is_pdf_available, create_overtime_pdf

    if not is_pdf_available():
        raise AppException(
            ErrorCode.VALIDATION_ERROR,
            detail="PDF出力機能が利用できません。reportlabをインストールしてください。"
        )

    # 残業データを取得
    grid = fetch_grid_for_key(db, "punches")
    if not grid:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail="出退社時刻ファイルがアップロードされていません")

    try:
        overtime_data = aggregate_overtime_by_employee(grid)
    except ValueError as exc:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail=str(exc))

    # 部署フィルター適用
    if department:
        overtime_data = {
            k: v for k, v in overtime_data.items()
            if v.get('department', '').startswith(department)
        }

    # PDF用データ形式に変換
    pdf_data = []
    for emp_id, data in overtime_data.items():
        pdf_data.append({
            'employee_id': emp_id,
            'name': data.get('name', ''),
            'department': data.get('department', ''),
            'overtime_hours': data.get('total_overtime_hours', 0) / 60,  # 分→時間
        })

    # 残業時間でソート（降順）
    pdf_data.sort(key=lambda x: x['overtime_hours'], reverse=True)

    # PDF生成
    subtitle = f"部署: {department}" if department else "全部署"
    pdf_bytes = create_overtime_pdf(pdf_data, subtitle=subtitle)

    # レスポンス
    filename = f"overtime_report_{date.today().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/pdf/summary/{year}/{month}")
def export_summary_pdf(
    year: int,
    month: int,
    db=Depends(get_db)
):
    """
    月次サマリーをPDF形式でエクスポート

    Args:
        year: 年
        month: 月（1-12）

    Returns:
        PDFファイル
    """
    from backend.services.pdf_export import is_pdf_available, create_summary_pdf

    if not is_pdf_available():
        raise AppException(
            ErrorCode.VALIDATION_ERROR,
            detail="PDF出力機能が利用できません。reportlabをインストールしてください。"
        )

    if month < 1 or month > 12:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail="月は1〜12の範囲で指定してください")

    summary_service = get_summary_service(db)
    result = summary_service.get_monthly_summary(year, month)

    if "error" in result:
        raise AppException(ErrorCode.FILE_NOT_FOUND, detail=result["error"])

    pdf_bytes = create_summary_pdf(result)

    filename = f"summary_{year}{month:02d}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/pdf/check")
def check_pdf_available():
    """
    PDF出力機能が利用可能かチェック
    """
    from backend.services.pdf_export import is_pdf_available

    available = is_pdf_available()
    return {
        "available": available,
        "message": "PDF出力が利用可能です" if available else "reportlabをインストールしてください: pip install reportlab"
    }
