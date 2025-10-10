import re
from janome.tokenizer import Token
from typing import Tuple, Optional
from backend.core.tokenizer_config import get_tokenizer
from backend.services.score_resume.extract import extract_name_from_table

# ============================================
# ✅ トークナイザー初期化
# ============================================

tokenizer = get_tokenizer()

# ============================================
# ✅ 正規表現・ホワイトリスト定義
# ============================================

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(0\d{1,4}-\d{1,4}-\d{4})|(0\d{9,10})')
NON_NAME_WHITELIST = {
    "リード", "マネージャー", "エンジニア", "ディレクター", "デザイナー",
    "プロデューサー", "マーケター", "アーキテクト", "CTO", "CEO", "COO"
}

# ============================================
# 🧠 個人情報マスキングユーティリティ
# ============================================

def mask_names_by_label(text: str) -> Tuple[str, Optional[str]]:
    name_labels = ["氏名", "姓名", "名前", "Name", "Full Name"]
    extracted_name = None

    for label in name_labels:
        pattern = rf"({label}\s*[:：]?\s*)([^\s\n（(]+)[\s　]+([^\s\n（(]+)"
        match = re.search(pattern, text)
        if match:
            name_part = f"{match.group(2)} {match.group(3)}".strip()
            name_part = re.sub(r"[（(].*", "", name_part).strip()
            extracted_name = name_part
            text = re.sub(pattern, rf"\1＜人名削除＞", text)
            break

    # 表形式対応の fallback
    if not extracted_name:
        extracted_name = extract_name_from_table(text)
        if extracted_name:
            text = re.sub(r"(氏名\s+[^\s（(]+[\s　]+[^\s（(]+)", "氏名 ＜人名削除＞", text)

    return text, extracted_name

def mask_name_headline(text: str) -> Tuple[str, Optional[str]]:
    lines = text.splitlines()
    extracted_name = None
    for i in range(min(3, len(lines))):
        line = lines[i].strip()
        if re.match(r"^[\u4E00-\u9FFF]{1,4}[\s　][\u3040-\u9FFF]{1,4}$", line):
            extracted_name = line.strip()
            lines[i] = '＜人名削除＞'
            break
    return '\n'.join(lines), extracted_name

def mask_personal_info(text: str) -> Tuple[str, Optional[str]]:
    name1 = None
    name2 = None

    text, name1 = mask_names_by_label(text)
    text, name2 = mask_name_headline(text)

    text = EMAIL_REGEX.sub('＜メールアドレス削除＞', text)
    text = PHONE_REGEX.sub('＜電話番号削除＞', text)

    tokens = tokenizer.tokenize(text)
    masked_words = []
    in_name = False

    for token in tokens:
        if not isinstance(token, Token):
            continue
        surface = token.surface
        pos_parts = (token.part_of_speech or "").split(',')

        is_name = (
            pos_parts[0] == "名詞" and
            (
                (len(pos_parts) > 2 and pos_parts[1] == "固有名詞" and pos_parts[2] == "人名") or
                (len(pos_parts) > 3 and pos_parts[1] == "固有名詞" and pos_parts[2] == "名") or
                (len(pos_parts) > 3 and pos_parts[1] == "固有名詞" and pos_parts[2] == "姓")
            )
        )

        if is_name and surface not in NON_NAME_WHITELIST:
            if not in_name:
                masked_words.append("＜人名削除＞")
                in_name = True
        else:
            masked_words.append(surface)
            in_name = False

    masked_text = ''.join(masked_words)
    extracted_name = name1 or name2
    return masked_text, extracted_name