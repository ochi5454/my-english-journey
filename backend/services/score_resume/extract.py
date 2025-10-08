import io
import docx
import openpyxl
import pdfplumber
from backend.services.score_resume.sanitizer import normalize_pdf_text

# ============================================
# 🧠 履歴書からテキストの抽出
# ============================================

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