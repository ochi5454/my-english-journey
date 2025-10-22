from sqlalchemy import Column, Integer, String, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.core.database import Base

# ============================================
# ✅ 最終評価のラベル
# ============================================

class ChecksheetHiringDecision(Base):
    __tablename__ = "checksheet_hiring_decisions"

    id = Column(String, primary_key=True)  # "no_hire", "hire_ok", etc.
    value = Column(String, nullable=False)  # emoji付き: "🙅‍♂️ 採用すべきでない"
    label = Column(String, nullable=False)  # 表示名: "採用すべきでない"
    order = Column(Integer, nullable=False)  # 並び順
    description = Column(String, nullable=True)  # 説明文

class EmploymentType(Base):
    __tablename__ = "checksheet_employment_types"
    id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(String, unique=True, index=True, nullable=False)  # 例: "fulltime"
    label = Column(String, nullable=False)                           # 例: "正社員"
    pay_type = Column(String, nullable=False)                        # "daily_monthly" or "hourly"
    pay_type_label = Column(String, nullable=False)                       # ★ "日給月給者" / "時給者"

class ChecksheetRoleTitle(Base):
    __tablename__ = "checksheet_roletitle"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    value = Column(String, nullable=False, unique=True)  # 例: 'C'
    label = Column(String, nullable=False)               # 例: 'C（担当）'
    order = Column(Integer, nullable=False)              # 例: 1

# ============================================
# ✅ 定性評価のラベル
# ============================================

class ChecksheetQualitativeItem(Base):
    __tablename__ = "checksheet_qualitativeitems"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    placeholder = Column(String)
    order = Column(Integer, nullable=True)
    pay_type = Column(String, nullable=False, default="daily_monthly")
    is_active = Column(Boolean, nullable=False, default=True)

# ============================================
# ✅ 定量評価のラベル
# ============================================
class ChecksheetQuantitativeItem(Base):
    __tablename__ = "checksheet_quantitativeitems"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String, unique=True, nullable=False)
    label = Column(String, nullable=False)
    hint = Column(String)
    comment_placeholder = Column(String)

    rubrics = relationship("ChecksheetQuantitativeItemRubric", back_populates="item", cascade="all, delete-orphan")
    levels = relationship("ChecksheetQuantitativeItemLevel", back_populates="item", cascade="all, delete-orphan")

class ChecksheetQuantitativeItemRubric(Base):
    __tablename__ = "checksheet_quantitativeitem_rubrics"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    quantitativeitem_key = Column(String, ForeignKey("checksheet_quantitativeitems.key"), nullable=False)
    rubric = Column(String, nullable=False)

    item = relationship("ChecksheetQuantitativeItem", back_populates="rubrics")

class ChecksheetQuantitativeItemLevel(Base):
    __tablename__ = "checksheet_quantitativeitem_levels"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    quantitativeitem_key = Column(String, ForeignKey("checksheet_quantitativeitems.key"), nullable=False)
    value = Column(Integer, nullable=False)
    label = Column(String, nullable=False)

    item = relationship("ChecksheetQuantitativeItem", back_populates="levels")