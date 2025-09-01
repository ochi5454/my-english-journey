import re
from janome.tokenizer import Tokenizer, Token
from backend.core.config import NG_COMPANY_PATH
from backend.core.tokenizer_config import get_tokenizer

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

def mask_names_by_label(text: str) -> str:
    # ラベルの候補
    name_labels = ["氏名", "姓名", "名前", "Name", "Full Name"]
    
    for label in name_labels:
        # 改行や空白を挟んで氏名が続くパターンにマッチ
        pattern = rf"({label}\s*[\r\n]*)[^\s\n]+[\s　]+[^\s\n]+"
        text = re.sub(pattern, r"\1＜人名削除＞", text)

    return text

def mask_name_headline(text: str) -> str:
    # 文頭〜2行目くらいを対象にする
    lines = text.splitlines()
    for i in range(min(3, len(lines))):
        line = lines[i].strip()
        if re.match(r"^[\u4E00-\u9FFF]{1,4}[\s　][\u3040-\u9FFF]{1,4}$", line):
            lines[i] = '＜人名削除＞'
            break
    return '\n'.join(lines)

def normalize_pdf_text(text: str) -> str:
    text = text.replace('\u3000', ' ')  # 全角スペースを半角に
    text = re.sub(r'(?<=[^\n])\n(?=[^\n])', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def mask_personal_info(text: str) -> str:
    # ステップ1: ラベル付き氏名をマスク
    text = mask_names_by_label(text)

    # ステップ2: 文頭のラベルなし氏名をマスク
    text = mask_name_headline(text)

    # ステップ3: メールアドレスと電話番号をマスク
    text = EMAIL_REGEX.sub('＜メールアドレス削除＞', text)
    text = PHONE_REGEX.sub('＜電話番号削除＞', text)

    # ステップ4: 人名（文中）をマスク
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

        if is_name:
            # ホワイトリストに含まれていたらスキップ（＝そのまま出力）
            if surface in NON_NAME_WHITELIST:
                masked_words.append(surface)
                in_name = False
            else:
                if not in_name:
                    masked_words.append("＜人名削除＞")
                    in_name = True
                # 連続人名はスキップ
        else:
            masked_words.append(surface)
            in_name = False

    masked_text = ''.join(masked_words)

    # 会社名マスク（必要なら再有効化）
    # company_names = load_company_names()
    # masked_text = mask_company_names(masked_text, company_names)

    return masked_text

# --- 📄 * 必要に応じて会社名マスク ---------------

def load_company_names() -> list[str]:
    try:        
        with NG_COMPANY_PATH.open("r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except Exception as e:
        print(f"⚠️ 会社名ファイルの読み込み失敗: {e}")
        return []

def mask_company_names(text: str, company_names: list[str]) -> str:
    for name in company_names:
        if name in text:
            text = text.replace(name, '＜会社名削除＞')
    return text