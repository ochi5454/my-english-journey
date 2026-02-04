"""
ファイルハッシュユーティリティ

ファイルの重複検出に使用
"""
import hashlib
from typing import Optional, BinaryIO


def compute_file_hash(content: bytes, algorithm: str = "sha256") -> str:
    """
    ファイル内容のハッシュを計算

    Args:
        content: ファイル内容のバイト列
        algorithm: ハッシュアルゴリズム（sha256, md5など）

    Returns:
        ハッシュ値（16進数文字列）
    """
    if algorithm == "sha256":
        return hashlib.sha256(content).hexdigest()
    elif algorithm == "md5":
        return hashlib.md5(content).hexdigest()
    elif algorithm == "sha1":
        return hashlib.sha1(content).hexdigest()
    else:
        raise ValueError(f"未対応のアルゴリズム: {algorithm}")


def compute_file_hash_streaming(
    file_obj: BinaryIO,
    algorithm: str = "sha256",
    chunk_size: int = 8192
) -> str:
    """
    ストリーミングでファイルハッシュを計算（大きなファイル用）

    Args:
        file_obj: ファイルオブジェクト
        algorithm: ハッシュアルゴリズム
        chunk_size: チャンクサイズ

    Returns:
        ハッシュ値（16進数文字列）
    """
    if algorithm == "sha256":
        hasher = hashlib.sha256()
    elif algorithm == "md5":
        hasher = hashlib.md5()
    elif algorithm == "sha1":
        hasher = hashlib.sha1()
    else:
        raise ValueError(f"未対応のアルゴリズム: {algorithm}")

    file_obj.seek(0)
    while chunk := file_obj.read(chunk_size):
        hasher.update(chunk)

    file_obj.seek(0)  # ファイルポインタを戻す
    return hasher.hexdigest()


def check_duplicate_file(
    db,
    content_hash: str,
    file_key: str
) -> Optional[dict]:
    """
    同じハッシュを持つファイルが既に存在するかチェック

    Args:
        db: データベースセッション
        content_hash: チェックするハッシュ値
        file_key: ファイルキー

    Returns:
        重複ファイルの情報、または None
    """
    from backend.models.dataset import Dataset, DatasetStatus

    # 同じfile_keyで同じハッシュのファイルを検索
    existing = db.query(Dataset).filter(
        Dataset.kind == file_key,
        Dataset.content_hash == content_hash,
        Dataset.status == DatasetStatus.ready
    ).first()

    if existing:
        return {
            "dataset_id": existing.id,
            "original_filename": existing.original_filename,
            "uploaded_at": existing.uploaded_at.isoformat() if existing.uploaded_at else None,
            "row_count": existing.row_count,
        }

    return None
