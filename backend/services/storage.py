import os
from pathlib import Path
from typing import BinaryIO

from backend.core.config import DATA_DIR


class Storage:
    """
    Abstract storage interface to allow future S3 swap.
    """

    def put(self, src: BinaryIO, key: str) -> str:
        raise NotImplementedError

    def get_path(self, key: str) -> str:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError


class LocalStorage(Storage):
    def __init__(self, base_dir: Path | None = None):
        self.base_dir = base_dir or (DATA_DIR / "uploads")
        os.makedirs(self.base_dir, exist_ok=True)

    def put(self, src: BinaryIO, key: str) -> str:
        dest = Path(self.base_dir) / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(src.read())
        return str(dest)

    def get_path(self, key: str) -> str:
        dest = Path(self.base_dir) / key
        if not dest.exists():
            raise FileNotFoundError(f"{dest} not found")
        return str(dest)

    def delete(self, key: str) -> None:
        dest = Path(self.base_dir) / key
        try:
            dest.unlink()
        except FileNotFoundError:
            pass
