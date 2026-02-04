"""
統一エラーハンドリングモジュール

エラーコードとユーザーフレンドリーなメッセージを管理
"""
from enum import Enum
from typing import Optional
from fastapi import HTTPException


class ErrorCode(Enum):
    """エラーコード定義"""
    # 認証・認可エラー (E1xx)
    UNAUTHORIZED = "E101"
    SESSION_EXPIRED = "E102"
    INVALID_CREDENTIALS = "E103"
    RATE_LIMITED = "E104"

    # ファイルエラー (E2xx)
    INVALID_FILE_FORMAT = "E201"
    FILE_TOO_LARGE = "E202"
    HEADER_MISMATCH = "E203"
    FILE_NOT_FOUND = "E204"
    FILE_PROCESSING_FAILED = "E205"
    UNSUPPORTED_ENCODING = "E206"

    # データエラー (E3xx)
    NOT_FOUND = "E301"
    VALIDATION_ERROR = "E302"
    DUPLICATE_ENTRY = "E303"

    # ジョブエラー (E4xx)
    JOB_NOT_FOUND = "E401"
    JOB_ALREADY_COMPLETED = "E402"
    JOB_CANCELLED = "E403"

    # システムエラー (E5xx)
    INTERNAL_ERROR = "E501"
    DATABASE_ERROR = "E502"
    EXTERNAL_SERVICE_ERROR = "E503"


# 日本語エラーメッセージ
ERROR_MESSAGES_JA = {
    ErrorCode.UNAUTHORIZED: "認証が必要です。ログインしてください。",
    ErrorCode.SESSION_EXPIRED: "セッションが期限切れです。再度ログインしてください。",
    ErrorCode.INVALID_CREDENTIALS: "メールアドレスまたはパスワードが正しくありません。",
    ErrorCode.RATE_LIMITED: "リクエストが多すぎます。しばらく待ってから再試行してください。",

    ErrorCode.INVALID_FILE_FORMAT: "ファイル形式が正しくありません。Excel (.xlsx) または CSV ファイルをアップロードしてください。",
    ErrorCode.FILE_TOO_LARGE: "ファイルサイズが大きすぎます。200MB以下のファイルをアップロードしてください。",
    ErrorCode.HEADER_MISMATCH: "ファイルのヘッダーが期待される形式と一致しません。テンプレートを確認してください。",
    ErrorCode.FILE_NOT_FOUND: "指定されたファイルが見つかりません。",
    ErrorCode.FILE_PROCESSING_FAILED: "ファイルの処理中にエラーが発生しました。ファイルの内容を確認してください。",
    ErrorCode.UNSUPPORTED_ENCODING: "ファイルのエンコーディングがサポートされていません。UTF-8形式で保存してください。",

    ErrorCode.NOT_FOUND: "指定されたデータが見つかりません。",
    ErrorCode.VALIDATION_ERROR: "入力データに問題があります。",
    ErrorCode.DUPLICATE_ENTRY: "同じデータが既に存在します。",

    ErrorCode.JOB_NOT_FOUND: "ジョブが見つかりません。",
    ErrorCode.JOB_ALREADY_COMPLETED: "完了済みのジョブはキャンセルできません。",
    ErrorCode.JOB_CANCELLED: "ジョブはキャンセルされました。",

    ErrorCode.INTERNAL_ERROR: "システムエラーが発生しました。しばらく経ってから再試行してください。",
    ErrorCode.DATABASE_ERROR: "データベースエラーが発生しました。",
    ErrorCode.EXTERNAL_SERVICE_ERROR: "外部サービスとの通信でエラーが発生しました。",
}

# HTTPステータスコードマッピング
ERROR_STATUS_CODES = {
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.SESSION_EXPIRED: 401,
    ErrorCode.INVALID_CREDENTIALS: 401,
    ErrorCode.RATE_LIMITED: 429,

    ErrorCode.INVALID_FILE_FORMAT: 400,
    ErrorCode.FILE_TOO_LARGE: 413,
    ErrorCode.HEADER_MISMATCH: 400,
    ErrorCode.FILE_NOT_FOUND: 404,
    ErrorCode.FILE_PROCESSING_FAILED: 422,
    ErrorCode.UNSUPPORTED_ENCODING: 400,

    ErrorCode.NOT_FOUND: 404,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.DUPLICATE_ENTRY: 409,

    ErrorCode.JOB_NOT_FOUND: 404,
    ErrorCode.JOB_ALREADY_COMPLETED: 400,
    ErrorCode.JOB_CANCELLED: 400,

    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.EXTERNAL_SERVICE_ERROR: 502,
}


class AppException(HTTPException):
    """
    アプリケーション統一例外

    Usage:
        raise AppException(ErrorCode.FILE_TOO_LARGE)
        raise AppException(ErrorCode.HEADER_MISMATCH, detail="従業員番号列が見つかりません")
    """

    def __init__(
        self,
        code: ErrorCode,
        detail: Optional[str] = None,
        headers: Optional[dict] = None
    ):
        self.error_code = code
        message = detail or ERROR_MESSAGES_JA.get(code, "エラーが発生しました")
        status_code = ERROR_STATUS_CODES.get(code, 500)

        super().__init__(
            status_code=status_code,
            detail={
                "code": code.value,
                "message": message,
            },
            headers=headers
        )


def raise_for_file_error(error_type: str, filename: str = "", detail: str = ""):
    """ファイルエラー用のヘルパー関数"""
    error_map = {
        "format": ErrorCode.INVALID_FILE_FORMAT,
        "size": ErrorCode.FILE_TOO_LARGE,
        "header": ErrorCode.HEADER_MISMATCH,
        "not_found": ErrorCode.FILE_NOT_FOUND,
        "processing": ErrorCode.FILE_PROCESSING_FAILED,
        "encoding": ErrorCode.UNSUPPORTED_ENCODING,
    }

    code = error_map.get(error_type, ErrorCode.FILE_PROCESSING_FAILED)
    message = detail if detail else ERROR_MESSAGES_JA.get(code)
    if filename:
        message = f"{filename}: {message}"

    raise AppException(code, detail=message)
