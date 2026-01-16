from sqlalchemy import Column, Integer, String, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.core.database import Base
from datetime import date


class ExcelFile(Base):
    __tablename__ = "excel_files"
    id = Column(Integer, primary_key=True, index=True)
    file_key = Column(String, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    version = Column(Integer, default=1)
    uploaded_at = Column(Date, default=date.today)
    cells = relationship("ExcelCell", back_populates="file", cascade="all, delete-orphan")


class ExcelCell(Base):
    __tablename__ = "excel_cells"
    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("excel_files.id"), nullable=False)
    sheet_name = Column(String, nullable=False)
    row_index = Column(Integer, nullable=False)
    col_index = Column(Integer, nullable=False)
    value = Column(Text, nullable=True)
    file = relationship("ExcelFile", back_populates="cells")
