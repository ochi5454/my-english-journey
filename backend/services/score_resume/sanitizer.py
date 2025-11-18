# backend/services/score_resume/sanitizer.py
import re
from janome.tokenizer import Token
from typing import Tuple, Optional, Dict
from backend.core.tokenizer_config import get_tokenizer
from backend.services.score_resume.extract import extract_person_info

# ============================================
# ✅ トークナイザー初期化
# ============================================

tokenizer = get_tokenizer()

# ============================================
# ✅ 正規表現・ホワイトリスト定義（事前コンパイル）
# ============================================

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(0\d{1,4}-\d{1,4}-\d{4})|(0\d{9,10})')
NON_NAME_WHITELIST = {
    "リード", "マネージャー", "エンジニア", "ディレクター", "デザイナー",
    "プロデューサー", "マーケター", "アーキテクト", "CTO", "CEO", "COO"
}

# ============================================
# 🧠 個人情報抽出＆マスキング（LangChain統合版）
# ============================================

def extract_email(text: str) -> Optional[str]:
    """
    📧 メールアドレスを抽出
    """
    match = EMAIL_REGEX.search(text)
    if match:
        email = match.group(0)
        print(f"✅ メールアドレス抽出: {email}")
        return email
    return None

def extract_phone(text: str) -> Optional[str]:
    """
    📞 電話番号を抽出
    """
    match = PHONE_REGEX.search(text)
    if match:
        phone = match.group(0)
        print(f"✅ 電話番号抽出: {phone}")
        return phone
    return None

def mask_personal_info(text: str, filename: Optional[str] = None) -> Tuple[str, Optional[str]]:
    """
    個人情報マスキング（旧版 - 互換性維持用）
    
    Returns:
        (masked_text, extracted_name)
    """
    masked_text, info = mask_and_extract_personal_info(text, filename=filename)
    return masked_text, info.get("name")

def mask_and_extract_personal_info(text: str, filename: Optional[str] = None) -> Tuple[str, Dict[str, Optional[str]]]:
    """
    📧 個人情報をマスク＆抽出（LangChain版）
    
    Returns:
        (masked_text, {
            "name": str,
            "gender": str,
            "email": str,
            "phone": str
        })
    """
    # 🆕 マスクする前に個人情報を抽出
    email = extract_email(text)
    phone = extract_phone(text)
    
    # ✅ LangChainで名前と性別を抽出
    extracted_name = None
    extracted_gender = None
    try:
        name, gender = extract_person_info(text)
        if name:
            extracted_name = name
            print(f"✅ LangChain名前抽出成功: {extracted_name}")
        else:
            print("⚠️ LangChainで名前を抽出できませんでした")
        if gender:
            extracted_gender = gender
            print(f"✅ LangChain性別抽出成功: {extracted_gender}")
    except Exception as e:
        print(f"❌ LangChain抽出エラー: {e}")
        extracted_name = None
        extracted_gender = None

    # 🩹 LangChainで name が取れなかったらフォールバック
    if not extracted_name:
        fallback_name = fallback_extract_name(text, filename=filename)
        if fallback_name:
            extracted_name = fallback_name
            print(f"🩹 フォールバックで名前抽出成功: {extracted_name}")
        else:
            print("⚠️ LangChain + フォールバックでも名前を抽出できませんでした")
    
    # メール・電話のマスク
    masked_text = EMAIL_REGEX.sub('＜メールアドレス削除＞', text)
    masked_text = PHONE_REGEX.sub('＜電話番号削除＞', masked_text)

    # 形態素解析による人名検出（追加のマスキング）
    tokens = tokenizer.tokenize(masked_text)
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
    
    if extracted_name:
        print(f"✅ 最終抽出名: {extracted_name}")
    else:
        print("⚠️ 名前を抽出できませんでした")

    # === 🆕 性別フォールバック（正規表現） ===
    fallback_gender = extract_gender_fallback(text)
    if fallback_gender:
        extracted_gender = fallback_gender
        print(f"🩹 フォールバックで性別抽出成功: {extracted_gender}")
    else:
        print("⚠️ 性別を抽出できませんでした（LLM+正規表現）")
    
    # 抽出した情報を辞書で返す
    extracted_info = {
        "name": extracted_name,
        "gender": extracted_gender,
        "email": email,
        "phone": phone
    }
    
    return masked_text, extracted_info

# ============================================
# 🧠 氏名フォールバック（強化版）
# ============================================

# 氏名抽出で区切りとして使うキーワード
NAME_STOPWORDS = [
    "性別", "住所", "電話", "メール", "Mail",
    "連絡先", "生年月日", "学歴", "職務要約",
    "職歴", "職務経歴", "概要", "プロフィール",
    "自己PR"
]

def cut_after_stopwords(text: str) -> str:
    """
    氏名欄の後ろについてくる不要な文章（性別・住所・職務要約など）を除去する。
    """
    for kw in NAME_STOPWORDS:
        if kw in text:
            return text.split(kw)[0]
    return text

# 文書中の氏名欄を探すための正規表現
NAME_PATTERNS = [
    r'履歴書氏名[：:]\s*(.+)',
    r'職務経歴書氏名[：:]\s*(.+)',
    r'氏名[：:]\s*(.+)'
]

def fallback_extract_name_from_body(text: str) -> Optional[str]:
    """
    LangChain で name が取れなかったときに、
    文書中の「氏名：〜」パターンから名前を抽出するフォールバック。
    """
    for p in NAME_PATTERNS:
        m = re.search(p, text)
        if not m:
            continue

        raw = m.group(1).strip()

        # 後続の項目（性別・住所など）を切り落とす
        raw = cut_after_stopwords(raw)

        # ふりがな（例： （おかだ ともあき））を削除
        raw = re.sub(r'（.*?）', '', raw)

        # 全角スペース／半角スペースを統一して整理
        raw = ' '.join(raw.split())

        # 「名前としてはありえない長さ」を排除（誤抽出防止）
        if 1 < len(raw) <= 15:
            return raw

    return None


def fallback_extract_name(text: str, filename: Optional[str] = None) -> Optional[str]:
    """
    LangChainで取得できなかったときの総合フォールバック。
    - ① ファイル名から抽出
    - ② 文書本文から抽出（氏名：〜）
    - ③ 余力があれば Janome での人名解析を追加することも可能
    """

    # ① ファイル名から抽出（最も確実）
    if filename:
        name = extract_name_from_filename(filename)
        if name:
            print(f"🩹 フォールバック（ファイル名）で名前抽出成功: {name}")
            return name

    # ② 文書中の氏名欄から抽出
    name = fallback_extract_name_from_body(text)
    if name:
        print(f"🩹 フォールバック（本文）で名前抽出成功: {name}")
        return name

    # ③ （必要なら）形態素解析を活用することも可能 — 今は未使用
    # name = extract_name_from_morph(text)
    # if name:
    #     print(f"🩹 フォールバック（形態素解析）で名前抽出成功: {name}")
    #     return name

    return None


def extract_name_from_filename(filename: str) -> Optional[str]:
    """
    ファイル名に含まれる氏名らしき部分を抽出する。
    例:
        '岡田智昭_職務経歴書.docx' → '岡田智昭'
        '佐藤 花子（営業）.pdf' → '佐藤 花子'
    """
    # 拡張子除去
    base = re.sub(r'\.[^.]+$', '', filename)

    # 先頭の「名前らしき部分」を抽出（アンダースコア/ハイフン前まで）
    m = re.match(r'^([^\s_（(]+(?:\s*[^\s_（(]+)?)', base)
    if m:
        name = m.group(1).strip()
        # 括弧内（部署名など）を削除
        name = re.sub(r'（.*?）', '', name)
        name = ' '.join(name.split())
        # 氏名として適切かチェック
        if 1 < len(name) <= 15:
            return name

    return None

# ============================================
# 🧠 性別フォールバック（正規表現ベース）
# ============================================

GENDER_PATTERNS = [
    r'性別[：:]\s*(男|男性)',
    r'性別[：:]\s*(女|女性)',
    r'\b(男|男性)\b',
    r'\b(女|女性)\b'
]

def extract_gender_fallback(text: str) -> Optional[str]:
    """
    LangChain が gender="その他" や None を返したときのフォールバック。
    正規表現で本文から性別を再判定する。
    """
    for p in GENDER_PATTERNS:
        m = re.search(p, text)
        if not m:
            continue
        g = m.group(1)
        if "男" in g:
            return "男性"
        if "女" in g:
            return "女性"
    return None

# ============================================
# 🧪 デバッグ用
# ============================================

def debug_personal_info_extraction(text: str, filename: Optional[str] = None):
    """デバッグ用: 個人情報抽出の過程を詳細表示"""
    print("=" * 60)
    print("🔍 個人情報抽出デバッグ開始")
    print("=" * 60)
    print(f"入力テキスト（最初の300文字）:\n{text[:300]}")
    if filename:
        print(f"📁 filename: {filename}")
    print("-" * 60)
    
    masked, info = mask_and_extract_personal_info(text, filename=filename)
    
    print("-" * 60)
    print(f"📛 名前: {info['name']}")
    print(f"🧬 性別: {info.get('gender')}")
    print(f"📧 メール: {info['email']}")
    print(f"📞 電話: {info['phone']}")
    print(f"\nマスク済みテキスト（最初の200文字）:\n{masked[:200]}")
    print("=" * 60)
    
    return masked, info