from backend.core.config import Settings
from backend.core.database import SessionLocal
from backend.models.user import User
from backend.utils.security import hash_password


def ensure_default_admin():
    """
    Ensure a single built-in admin account exists.
    Controlled via env:
      ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_BOOTSTRAP_ENABLED
    """
    settings = Settings()
    if not settings.admin_bootstrap_enabled:
        return
    if not settings.admin_email or not settings.admin_password:
        return

    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == settings.admin_email).one_or_none()
        if existing:
            return
        password_hash, salt = hash_password(settings.admin_password)
        # Use email field to store the built-in admin ID (e.g., "admin") so UI can show it's a built-in user.
        user = User(
            email=settings.admin_email,
            name=settings.admin_name or "Admin",
            password_hash=password_hash,
            password_salt=salt,
            is_admin=True,
            is_active=True,
        )
        db.add(user)
        db.commit()
