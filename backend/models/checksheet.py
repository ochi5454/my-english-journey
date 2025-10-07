from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from backend.core.database import Base

# ============================================
# ✅ 最終評価
# ============================================

class ChecksheetHiringDecision(Base):
    __tablename__ = "checksheet_hiring_decisions"

    id = Column(String, primary_key=True)  # "no_hire", "hire_ok", etc.
    value = Column(String, nullable=False)  # emoji付き: "🙅‍♂️ 採用すべきでない"
    label = Column(String, nullable=False)  # 表示名: "採用すべきでない"
    order = Column(Integer, nullable=False)  # 並び順
    description = Column(String, nullable=True)  # 説明文

class ChecksheetRoleTitle(Base):
    __tablename__ = "checksheet_roletitle"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    value = Column(String, nullable=False, unique=True)  # 例: 'C'
    label = Column(String, nullable=False)               # 例: 'C（担当）'
    order = Column(Integer, nullable=False)              # 例: 1

# ============================================
# ✅ 定性評価
# ============================================

class ChecksheetQualitativeItem(Base):
    __tablename__ = "checksheet_qualitativeitems"

    id = Column(String, primary_key=True, index=True)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    placeholder = Column(String)

# ============================================
# ✅ 定量評価
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