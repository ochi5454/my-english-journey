# backend/scripts/rotate_encryption_keys.py
from backend.core.database import SessionLocal
from backend.models.userrole import User
from backend.utils.encryption import rotate_encryption_key

def rotate_all_encrypted_fields():
    """全ての暗号化フィールドを最新キーで再暗号化"""
    with SessionLocal() as db:
        users = db.query(User).all()
        
        for user in users:
            if user.encrypted_field:
                user.encrypted_field = rotate_encryption_key(user.encrypted_field)
        
        db.commit()
        print(f"✅ {len(users)} users re-encrypted")

if __name__ == "__main__":
    rotate_all_encrypted_fields()