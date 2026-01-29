import base64
import hashlib
import hmac
import os
from typing import Tuple


def _pbkdf2_hash(password: str, salt: bytes, iterations: int = 100_000) -> bytes:
    # PBKDF2 with SHA-256; standard library only to avoid extra deps
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)


def hash_password(password: str, *, salt: bytes | None = None) -> Tuple[str, str]:
    """
    Returns (password_hash_b64, salt_b64).
    """
    salt_bytes = salt or os.urandom(16)
    derived = _pbkdf2_hash(password, salt_bytes)
    return base64.b64encode(derived).decode("ascii"), base64.b64encode(salt_bytes).decode("ascii")


def verify_password(password: str, stored_hash_b64: str, salt_b64: str) -> bool:
    try:
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(stored_hash_b64)
    except Exception:
        return False
    candidate = _pbkdf2_hash(password, salt)
    return hmac.compare_digest(candidate, expected)
