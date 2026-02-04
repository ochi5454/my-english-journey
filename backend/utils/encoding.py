"""
エンコーディング自動検出ユーティリティ

日本語Excelファイル（Shift-JIS, CP932など）に対応
"""
import codecs
from typing import Optional, Tuple
from pathlib import Path


# 試行するエンコーディングの優先順位
ENCODING_CANDIDATES = [
    "utf-8-sig",  # BOM付きUTF-8（Excelのデフォルト）
    "utf-8",      # BOM無しUTF-8
    "cp932",      # Windows日本語（Shift-JIS拡張）
    "shift_jis",  # 標準Shift-JIS
    "euc-jp",     # EUC-JP
    "iso-2022-jp",  # JIS
]


def detect_encoding(file_path: str, sample_size: int = 8192) -> str:
    """
    ファイルのエンコーディングを自動検出

    Args:
        file_path: 検出対象ファイルのパス
        sample_size: 検出に使用するバイト数

    Returns:
        検出されたエンコーディング名
    """
    with open(file_path, "rb") as f:
        raw_data = f.read(sample_size)

    return detect_encoding_from_bytes(raw_data)


def detect_encoding_from_bytes(raw_data: bytes) -> str:
    """
    バイト列からエンコーディングを自動検出

    Args:
        raw_data: 検出対象のバイト列

    Returns:
        検出されたエンコーディング名
    """
    # BOMチェック
    bom_encoding = _check_bom(raw_data)
    if bom_encoding:
        return bom_encoding

    # 各エンコーディングで試行
    for encoding in ENCODING_CANDIDATES:
        if _try_decode(raw_data, encoding):
            return encoding

    # フォールバック: UTF-8
    return "utf-8"


def _check_bom(data: bytes) -> Optional[str]:
    """BOM（Byte Order Mark）をチェック"""
    if data.startswith(codecs.BOM_UTF8):
        return "utf-8-sig"
    if data.startswith(codecs.BOM_UTF16_LE):
        return "utf-16-le"
    if data.startswith(codecs.BOM_UTF16_BE):
        return "utf-16-be"
    if data.startswith(codecs.BOM_UTF32_LE):
        return "utf-32-le"
    if data.startswith(codecs.BOM_UTF32_BE):
        return "utf-32-be"
    return None


def _try_decode(data: bytes, encoding: str) -> bool:
    """
    指定エンコーディングでデコードを試行

    日本語テキストとして妥当かどうかも簡易チェック
    """
    try:
        decoded = data.decode(encoding)

        # 制御文字（改行・タブ以外）が多い場合は不正とみなす
        control_chars = sum(
            1 for c in decoded
            if ord(c) < 32 and c not in '\n\r\t'
        )
        if control_chars > len(decoded) * 0.1:  # 10%以上なら不正
            return False

        # 置換文字が含まれる場合は不正
        if '\ufffd' in decoded:
            return False

        return True
    except (UnicodeDecodeError, LookupError):
        return False


def read_file_with_encoding(
    file_path: str,
    encoding: Optional[str] = None
) -> Tuple[str, str]:
    """
    エンコーディングを自動検出してファイルを読み込み

    Args:
        file_path: 読み込むファイルのパス
        encoding: 指定がある場合はそのエンコーディングを使用

    Returns:
        (ファイル内容, 使用されたエンコーディング)
    """
    if encoding is None:
        encoding = detect_encoding(file_path)

    with open(file_path, "r", encoding=encoding, errors="replace") as f:
        content = f.read()

    return content, encoding


def safe_decode(data: bytes, fallback: str = "utf-8") -> Tuple[str, str]:
    """
    バイト列を安全にデコード

    Args:
        data: デコードするバイト列
        fallback: 検出失敗時のフォールバックエンコーディング

    Returns:
        (デコード済み文字列, 使用されたエンコーディング)
    """
    encoding = detect_encoding_from_bytes(data)

    try:
        return data.decode(encoding), encoding
    except UnicodeDecodeError:
        # フォールバックで再試行
        return data.decode(fallback, errors="replace"), fallback
