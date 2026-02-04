import base64
import json
import os
import secrets
from functools import lru_cache
from typing import Any, Dict

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.core.config import Settings


@lru_cache
def _settings() -> Settings:
    # Use cached Settings so we load .env once even when the process starts
    return Settings()


def _get_key(env_name: str = "ENCRYPTION_KEY") -> bytes:
    # Prefer real environment variable (for prod), fall back to Settings which reads .env in dev
    key_b64 = os.getenv(env_name) or _settings().encryption_key
    if not key_b64:
        raise RuntimeError(f"{env_name} is not set")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise RuntimeError(f"{env_name} must be 32-byte key base64 encoded")
    return key


def encrypt_json(payload: Dict[str, Any], *, env_name: str = "ENCRYPTION_KEY") -> str:
    """
    Encrypt a dict and return versioned ciphertext string.
    Uses AES-256-GCM with random 12-byte nonce.
    Format: v1:<base64(nonce|ciphertext|tag)>
    """
    key = _get_key(env_name)
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ct = aesgcm.encrypt(nonce, raw, None)
    return "v1:" + base64.b64encode(nonce + ct).decode("ascii")


def decrypt_json(token: str, *, env_name: str = "ENCRYPTION_KEY") -> Dict[str, Any]:
    if not token or not token.startswith("v1:"):
        raise ValueError("Invalid token version")
    key = _get_key(env_name)
    aesgcm = AESGCM(key)
    data = base64.b64decode(token[3:])
    nonce, ct = data[:12], data[12:]
    raw = aesgcm.decrypt(nonce, ct, None)
    return json.loads(raw.decode("utf-8"))
