import io
import docx
import docx2txt
import pandas as pd
import fitz
import openpyxl
import pdfplumber
from pathlib import Path
from backend.services.resume_upload.text_sanitizer import normalize_pdf_text

# ============================================
# 🧠 履歴書からテキストの抽出
# ============================================

# --- 📄 パタン1 履歴書をそのまま保存し、スコア判定（/resume-score） ---------------

def extract_text_from_pdf_resume(file_path: str) -> str:
    doc = fitz.open(file_path)  # type: ignore[attr-defined]
    text = "\n".join(page.get_text() for page in doc)  # type: ignore[attr-defined]
    doc.close()
    return text

def extract_text_from_docx_resume(file_path: str) -> str:
    return docx2txt.process(file_path)

def extract_text_from_xlsx_resume(file_path: str) -> str:
    try:
        dfs = pd.read_excel(file_path, sheet_name=None)
        text = ""
        for sheet_name, df in dfs.items():
            text += f"[{sheet_name}]\n"
            text += df.astype(str).to_string(index=False)
            text += "\n"
        return text
    except Exception as e:
        return f"Excel読み込みエラー: {str(e)}"

def extract_text_from_resume(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf_resume(file_path)
    elif ext == ".docx":
        return extract_text_from_docx_resume(file_path)
    elif ext in [".xls", ".xlsx"]:
        return extract_text_from_xlsx_resume(file_path)
    else:
        return "対応していないファイル形式です。"

# --- 📄 パタン2 履歴書をマスクし、ベクトルDB、SQLに保存し、スコア判定（/resume-score-no-save） ------

def extract_resume_text_from_pdf(file_stream: io.BytesIO) -> str:
    try:
        with pdfplumber.open(file_stream) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        return normalize_pdf_text(text)
    except Exception as e:
        print(f"❌ PDF抽出エラー: {e}")
        return ""

def extract_resume_text_from_docx(file_stream: io.BytesIO) -> str:
    try:
        document = docx.Document(file_stream)
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())
    except Exception as e:
        print(f"❌ DOCX抽出エラー: {e}")
        return ""

def extract_resume_text_from_xlsx(file_stream: io.BytesIO) -> str:
    try:
        wb = openpyxl.load_workbook(file_stream, data_only=True)
        text = ""

        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                for cell in row:
                    if cell is not None:
                        text += str(cell).strip() + "\n"

        return text
    except Exception as e:
        print(f"❌ XLSX抽出エラー: {e}")
        return ""