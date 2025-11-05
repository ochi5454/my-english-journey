# backend/utils/encryption.py
import os
import base64
from cryptography.fernet import Fernet, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)

class EncryptionManager:
    """
    フィールドレベル暗号化を管理するクラス（複数世代対応）
    """
    _instance: Optional['EncryptionManager'] = None
    _fernet: MultiFernet  # ✅ MultiFernet に変更
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EncryptionManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_fernet'):
            self._initialize_encryption()
    
    def _initialize_encryption(self):
        """
        暗号化キーを初期化（複数世代対応）
        
        環境変数の設定例:
        ENCRYPTION_KEYS=key1,key2,key3  # カンマ区切りで複数指定
        
        最初のキーが暗号化に使用され、全てのキーが復号化に試行される
        """
        # 方法1: 複数キーを環境変数から取得
        encryption_keys_str = os.getenv("ENCRYPTION_KEYS")
        
        if encryption_keys_str:
            try:
                keys = [k.strip() for k in encryption_keys_str.split(',') if k.strip()]
                fernet_instances = [Fernet(key.encode()) for key in keys]
                self._fernet = MultiFernet(fernet_instances)
                logger.info(f"Encryption initialized with {len(fernet_instances)} keys")
                return
            except Exception as e:
                logger.error(f"Failed to load ENCRYPTION_KEYS: {e}")
        
        # 方法2: 単一キー（後方互換性）
        encryption_key = os.getenv("ENCRYPTION_KEY")
        
        if encryption_key:
            try:
                self._fernet = MultiFernet([Fernet(encryption_key.encode())])
                logger.info("Encryption initialized with single ENCRYPTION_KEY")
                return
            except Exception as e:
                logger.error(f"Failed to load ENCRYPTION_KEY: {e}")
        
        # 方法3: パスワードから鍵を派生（開発環境用）
        encryption_password = os.getenv("ENCRYPTION_PASSWORD", "default-dev-password-change-in-production")
        salt = os.getenv("ENCRYPTION_SALT", "default-salt-change-in-production").encode()
        
        if encryption_password == "default-dev-password-change-in-production":
            logger.warning("⚠️  Using default encryption password! Set ENCRYPTION_KEYS in production!")
        
        # PBKDF2で鍵を派生
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(encryption_password.encode()))
        self._fernet = MultiFernet([Fernet(key)])
        logger.info("Encryption initialized with ENCRYPTION_PASSWORD")
    
    def encrypt_method(self, plaintext: str) -> str:
        """
        文字列を暗号化（常に最新のキーを使用）
        
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
    
    def decrypt_method(self, ciphertext: str) -> str:
        """
        暗号化された文字列を復号化（全てのキーで試行）
        
        Args:
            ciphertext: 暗号化されたBase64文字列
            
        Returns:
            復号化された文字列
        """
        if not ciphertext:
            return ciphertext
        
        try:
            # MultiFernetが自動的に全てのキーで復号化を試行
            decrypted_bytes = self._fernet.decrypt(ciphertext.encode('utf-8'))
            return decrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise
    
    def rotate_key(self, ciphertext: str) -> str:
        """
        古いキーで暗号化されたデータを最新キーで再暗号化
        
        Args:
            ciphertext: 古いキーで暗号化された文字列
            
        Returns:
            最新キーで再暗号化された文字列
        """
        if not ciphertext:
            return ciphertext
        
        try:
            # MultiFernet.rotateは自動的に復号化→再暗号化を行う
            rotated_bytes = self._fernet.rotate(ciphertext.encode('utf-8'))
            return rotated_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Key rotation failed: {e}")
            raise

# シングルトンインスタンス
_encryption_manager = EncryptionManager()

# パブリック関数
def encrypt(value: str) -> str:
    """文字列を暗号化"""
    return _encryption_manager.encrypt_method(value)

def decrypt(value: str) -> str:
    """文字列を復号化"""
    return _encryption_manager.decrypt_method(value)

def rotate_encryption_key(value: str) -> str:
    """暗号化キーをローテーション"""
    return _encryption_manager.rotate_key(value)

def encrypt_field(value: Optional[str]) -> Optional[str]:
    """フィールド値を暗号化"""
    if value is None:
        return None
    return _encryption_manager.encrypt_method(value)

def decrypt_field(value: Optional[str]) -> Optional[str]:
    """フィールド値を復号化"""
    if value is None:
        return None
    return _encryption_manager.decrypt_method(value)

def generate_encryption_key() -> str:
    """新しいFernetキーを生成"""
    return Fernet.generate_key().decode('utf-8')

if __name__ == "__main__":
    print("Generated Encryption Key (store this securely!):")
    print(generate_encryption_key())