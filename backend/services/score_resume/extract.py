import io
import re
import docx
import openpyxl
import pdfplumber
from dateutil.relativedelta import relativedelta
from datetime import datetime
from typing import Optional
from backend.core.openai_config import get_openai_client

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

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

def extract_resume_text_from_docx(file_stream):
    from docx import Document

    doc = Document(file_stream)
    lines = []

    # ① 段落（paragraph）を抽出
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            lines.append(text)

    # ② 表（table）を抽出
    for table in doc.tables:
        for row in table.rows:
            row_text = []
            for cell in row.cells:
                cell_text = cell.text.strip()
                if cell_text:
                    row_text.append(cell_text)
            if row_text:
                lines.append(" ".join(row_text))  # 行ごとに連結して1行として扱う

    return "\n".join(lines)

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
    
def normalize_pdf_text(text: str) -> str:
    text = text.replace('\u3000', ' ')  # 全角スペースを半角に
    text = re.sub(r'(?<=[^\n])\n(?=[^\n])', '', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    return text.strip()

# ============================================
# 🧠 履歴書から名前の抽出
# ============================================

def extract_name_from_table(text: str) -> Optional[str]:
    # 氏名 ラベルに続く任意の空白やタブ、全角スペース
    match = re.search(r"氏名[ \t\u3000]*([^\s（(]+)[\s\u3000]+([^\s（(]+)", text)
    if match:
        full_name = f"{match.group(1)} {match.group(2)}"
        return re.sub(r"[（(].*", "", full_name).strip()
    return None

# ============================================
# 🧠 履歴書から性別の抽出
# ============================================

def extract_gender_from_text(text: str) -> str:
    match = re.search(r"性別[ \t\u3000]*([男女]性?)", text)
    if match:
        value = match.group(1)
        if "男" in value:
            return "男"
        elif "女" in value:
            return "女"
    return "不明"
    
# ============================================
# 🧠 履歴書から志望動機の抽出
# ============================================

def extract_motivation(text: str) -> str:
    if not text or not text.strip():
        return ""

    prompt = f"""
以下の履歴書の本文から、「志望動機」または「自己PR」に該当する部分のみを抽出してください。
見つからない場合は空文字で構いません。

履歴書内容:
{text}

抽出結果:
"""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"❌ 志望動機抽出に失敗: {e}")
        return ""

def summarize_motivation(text: str, max_length: int = 100) -> str:
    prompt = f"""
以下の志望動機を{max_length}文字以内で要約してください。候補者の熱意や志望理由が簡潔に伝わるようにしてください。

志望動機:
{text}

要約（{max_length}文字以内）:
"""

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()

# ============================================
# 🧠 履歴書から社会人歴の抽出
# ============================================

def parse_date(date_str):
    if date_str in ["現在", "今"]:
        return datetime.today()
    try:
        match = re.match(r"(\d{4})年(\d{1,2})月", date_str)
        if match:
            return datetime(year=int(match.group(1)), month=int(match.group(2)), day=1)
    except Exception:
        pass
    return None

def calculate_total_experience(work_histories):
    periods = []

    for history in work_histories:
        start = parse_date(history.start_date)
        end = parse_date(history.end_date) or datetime.today()

        if start and end:
            periods.append((start, end))

    # 重複期間のマージ
    periods.sort()
    merged = []

    for start, end in periods:
        if not merged:
            merged.append((start, end))
        else:
            last_start, last_end = merged[-1]
            if start <= last_end:
                merged[-1] = (last_start, max(last_end, end))
            else:
                merged.append((start, end))

    # 総経験年数を月単位で計算
    total_months = sum((relativedelta(end, start).years * 12 + relativedelta(end, start).months for start, end in merged))

    return round(total_months / 12, 1)  # 年数を1桁小数で返す