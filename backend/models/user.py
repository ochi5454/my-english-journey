from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from backend.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)  # Nullable for Entra users
    password_salt = Column(String, nullable=True)  # Nullable for Entra users
    entra_sub = Column(String, nullable=True, unique=True, index=True)  # Entra ID user identifier
    is_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
