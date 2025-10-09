import io
import re
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

# ============================================
# 🧠 履歴書から性別の抽出
# ============================================

def extract_gender_from_text(text: str) -> str:
    # よくある性別の表現にマッチ
    if re.search(r"性別\s*[:：]?\s*男", text) or re.search(r"\b男性\b", text):
        return "男"
    elif re.search(r"性別\s*[:：]?\s*女", text) or re.search(r"\b女性\b", text):
        return "女"
    elif re.search(r"\b男\b", text):
        return "男"
    elif re.search(r"\b女\b", text):
        return "女"
    else:
        return "不明"