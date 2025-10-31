# backend/core/encryption.py
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.backends import default_backend
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class EncryptionManager:
    """
    フィールドレベル暗号化を管理するクラス
    """
    _instance = None
    _fernet: Optional[Fernet] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EncryptionManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._fernet is None:
            self._initialize_encryption()
    
    def _initialize_encryption(self):
        """
        暗号化キーを初期化
        環境変数 ENCRYPTION_KEY または ENCRYPTION_PASSWORD から取得
        """
        # 方法1: 直接Fernetキーを使用（推奨: 本番環境ではKMSから取得）
        encryption_key = os.getenv("ENCRYPTION_KEY")
        
        if encryption_key:
            try:
                # Base64でエンコードされたキーをデコード
                key = base64.urlsafe_b64decode(encryption_key.encode())
                self._fernet = Fernet(encryption_key.encode())
                logger.info("Encryption initialized with ENCRYPTION_KEY")
                return
            except Exception as e:
                logger.error(f"Failed to load ENCRYPTION_KEY: {e}")
        
        # 方法2: パスワードから鍵を派生（開発環境用）
        encryption_password = os.getenv("ENCRYPTION_PASSWORD", "default-dev-password-change-in-production")
        salt = os.getenv("ENCRYPTION_SALT", "default-salt-change-in-production").encode()
        
        if encryption_password == "default-dev-password-change-in-production":
            logger.warning("⚠️  Using default encryption password! Set ENCRYPTION_PASSWORD in production!")
        
        # PBKDF2で鍵を派生
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(encryption_password.encode()))
        self._fernet = Fernet(key)
        logger.info("Encryption initialized with ENCRYPTION_PASSWORD")
    
    def encrypt(self, plaintext: str) -> str:
        """
        文字列を暗号化してBase64エンコードした文字列を返す
        
        Args:
            plaintext: 暗号化する文字列
            
        Returns:
            暗号化されたBase64文字列
        """
        if not plaintext:
            return plaintext
        
        try:
            encrypted_bytes = self._fernet.encrypt(plaintext.encode('utf-8'))
            return encrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise
    
    def decrypt(self, ciphertext: str) -> str:
        """
        暗号化された文字列を復号化
        
        Args:
            ciphertext: 暗号化されたBase64文字列
            
        Returns:
            復号化された文字列
        """
        if not ciphertext:
            return ciphertext
        
        try:
            decrypted_bytes = self._fernet.decrypt(ciphertext.encode('utf-8'))
            return decrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise

# シングルトンインスタンス
_encryption_manager = EncryptionManager()

def encrypt_field(value: Optional[str]) -> Optional[str]:
    """
    フィールド値を暗号化
    
    Args:
        value: 暗号化する値
        
    Returns:
        暗号化された値（Noneの場合はNone）
    """
    if value is None:
        return None
    return _encryption_manager.encrypt(value)

def decrypt_field(value: Optional[str]) -> Optional[str]:
    """
    フィールド値を復号化
    
    Args:
        value: 復号化する値
        
    Returns:
        復号化された値（Noneの場合はNone）
    """
    if value is None:
        return None
    return _encryption_manager.decrypt(value)

def generate_encryption_key() -> str:
    """
    新しいFernetキーを生成（初回セットアップ用）
    
    Returns:
        Base64エンコードされた暗号化キー
    """
    return Fernet.generate_key().decode('utf-8')

# デバッグ用：暗号化キーを生成して表示
if __name__ == "__main__":
    print("Generated Encryption Key (store this securely!):")
    print(generate_encryption_key())