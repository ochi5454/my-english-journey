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

def mask_personal_info(text: str) -> Tuple[str, Optional[str]]:
    """
    個人情報マスキング（旧版 - 互換性維持用）
    
    Returns:
        (masked_text, extracted_name)
    """
    masked_text, info = mask_and_extract_personal_info(text)
    return masked_text, info.get("name")

def mask_and_extract_personal_info(text: str) -> Tuple[str, Dict[str, Optional[str]]]:
    """
    📧 個人情報をマスク＆抽出（LangChain版）
    
    Returns:
        (masked_text, {
            "name": str,
            "email": str,
            "phone": str
        })
    """
    # 🆕 マスクする前に個人情報を抽出
    email = extract_email(text)
    phone = extract_phone(text)
    
    # ✅ LangChainで名前と性別を抽出
    extracted_name = None
    try:
        name, gender = extract_person_info(text)
        if name:
            extracted_name = name
            print(f"✅ LangChain名前抽出成功: {extracted_name}")
        else:
            print("⚠️ LangChainで名前を抽出できませんでした")
    except Exception as e:
        print(f"❌ LangChain抽出エラー: {e}")
        extracted_name = None
    
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
    
    # 抽出した情報を辞書で返す
    extracted_info = {
        "name": extracted_name,
        "email": email,
        "phone": phone
    }
    
    return masked_text, extracted_info

# ============================================
# 🧪 デバッグ用
# ============================================

def debug_personal_info_extraction(text: str):
    """デバッグ用: 個人情報抽出の過程を詳細表示"""
    print("=" * 60)
    print("🔍 個人情報抽出デバッグ開始")
    print("=" * 60)
    print(f"入力テキスト（最初の300文字）:\n{text[:300]}")
    print("-" * 60)
    
    masked, info = mask_and_extract_personal_info(text)
    
    print("-" * 60)
    print(f"📛 名前: {info['name']}")
    print(f"📧 メール: {info['email']}")
    print(f"📞 電話: {info['phone']}")
    print(f"\nマスク済みテキスト（最初の200文字）:\n{masked[:200]}")
    print("=" * 60)
    
    return masked, info