"""
丁寧語サジェスチョンサービス

メール本文中のカジュアルな表現を検出し、より丁寧な代替表現を提案する
"""
from typing import List, Dict, Optional
from dataclasses import dataclass
import re


@dataclass
class PoliteSuggestion:
    """丁寧語の提案"""
    original: str
    suggested: str
    start: int
    end: int
    reason: str
    level: str  # 'polite' or 'formal'


# 敬語変換辞書
POLITENESS_RULES = [
    # 基本的な敬語変換
    {"from": "相談したく", "to": "ご相談したく", "level": "polite", "reason": "接頭語「ご」を付けてより丁寧に"},
    {"from": "確認したく", "to": "ご確認いただきたく", "level": "formal", "reason": "より丁寧な依頼表現"},
    {"from": "連絡します", "to": "ご連絡いたします", "level": "polite", "reason": "謙譲語を使用"},
    {"from": "送ります", "to": "お送りいたします", "level": "polite", "reason": "謙譲語を使用"},
    {"from": "見てください", "to": "ご確認ください", "level": "polite", "reason": "ビジネス向けの表現"},
    {"from": "教えてください", "to": "ご教示ください", "level": "formal", "reason": "フォーマルな依頼表現"},
    {"from": "お願いします", "to": "お願いいたします", "level": "polite", "reason": "より丁寧な表現"},
    {"from": "わかりました", "to": "承知いたしました", "level": "formal", "reason": "ビジネス向けの返答"},
    {"from": "了解しました", "to": "承知いたしました", "level": "formal", "reason": "「了解」は目上には不適切"},
    {"from": "できません", "to": "いたしかねます", "level": "formal", "reason": "丁寧な断り表現"},
    {"from": "知っています", "to": "存じております", "level": "formal", "reason": "謙譲語を使用"},
    {"from": "思います", "to": "存じます", "level": "formal", "reason": "謙譲語を使用"},
    {"from": "いいですか", "to": "よろしいでしょうか", "level": "polite", "reason": "丁寧な確認表現"},
    {"from": "ありがとうございます", "to": "誠にありがとうございます", "level": "formal", "reason": "より丁寧な感謝表現"},
    {"from": "すみません", "to": "申し訳ございません", "level": "formal", "reason": "ビジネス向けの謝罪表現"},
    {"from": "ごめんなさい", "to": "申し訳ございません", "level": "formal", "reason": "ビジネス向けの謝罪表現"},
    {"from": "どうですか", "to": "いかがでしょうか", "level": "polite", "reason": "丁寧な確認表現"},
    {"from": "あとで", "to": "後ほど", "level": "polite", "reason": "ビジネス向けの表現"},
    {"from": "今日", "to": "本日", "level": "polite", "reason": "ビジネス向けの表現"},
    {"from": "明日", "to": "明日（みょうにち）", "level": "formal", "reason": "フォーマルな読み"},
    {"from": "昨日", "to": "昨日（さくじつ）", "level": "formal", "reason": "フォーマルな読み"},
    {"from": "さっき", "to": "先ほど", "level": "polite", "reason": "ビジネス向けの表現"},
    {"from": "ちょっと", "to": "少々", "level": "polite", "reason": "ビジネス向けの表現"},
    {"from": "すぐ", "to": "早急に", "level": "formal", "reason": "ビジネス向けの表現"},
    {"from": "もらえますか", "to": "いただけますでしょうか", "level": "formal", "reason": "丁寧な依頼表現"},
    {"from": "してほしい", "to": "していただきたい", "level": "polite", "reason": "丁寧な依頼表現"},
    {"from": "会いたい", "to": "お目にかかりたい", "level": "formal", "reason": "謙譲語を使用"},
    {"from": "行きます", "to": "伺います", "level": "formal", "reason": "謙譲語を使用"},
    {"from": "来てください", "to": "お越しください", "level": "polite", "reason": "尊敬語を使用"},
    {"from": "言います", "to": "申します", "level": "formal", "reason": "謙譲語を使用"},
    {"from": "聞きたい", "to": "お伺いしたい", "level": "formal", "reason": "謙譲語を使用"},
]

# NGワード・誤変換チェック
NG_WORDS = [
    {"word": "境内", "suggestion": "件内 または 本件", "reason": "「けんない」の誤変換の可能性"},
    {"word": "よろしくお願いします。よろしくお願いします。", "suggestion": "重複を削除", "reason": "重複表現"},
    {"word": "お疲れ様です。お疲れ様です。", "suggestion": "重複を削除", "reason": "重複表現"},
    {"word": "いつもお世話になっております。いつもお世話になっております。", "suggestion": "重複を削除", "reason": "重複表現"},
]


def check_politeness(text: str, target_level: str = "polite") -> List[PoliteSuggestion]:
    """
    テキスト内の表現をチェックし、より丁寧な代替表現を提案する

    Args:
        text: チェック対象のテキスト
        target_level: 目標の丁寧度 ('polite' or 'formal')

    Returns:
        提案のリスト
    """
    suggestions = []

    # NGワードチェック
    for ng in NG_WORDS:
        pattern = re.escape(ng["word"])
        for match in re.finditer(pattern, text):
            suggestions.append(PoliteSuggestion(
                original=ng["word"],
                suggested=ng["suggestion"],
                start=match.start(),
                end=match.end(),
                reason=ng["reason"],
                level="error"
            ))

    # 敬語変換チェック
    for rule in POLITENESS_RULES:
        # target_levelがformalの場合は全ルール、politeの場合はpoliteのみ
        if target_level == "polite" and rule["level"] == "formal":
            continue

        pattern = re.escape(rule["from"])
        for match in re.finditer(pattern, text):
            # 既にその位置に提案がないか確認
            overlap = False
            for existing in suggestions:
                if not (match.end() <= existing.start or match.start() >= existing.end):
                    overlap = True
                    break

            if not overlap:
                suggestions.append(PoliteSuggestion(
                    original=rule["from"],
                    suggested=rule["to"],
                    start=match.start(),
                    end=match.end(),
                    reason=rule["reason"],
                    level=rule["level"]
                ))

    # 位置順にソート
    suggestions.sort(key=lambda x: x.start)

    return suggestions


def suggest_polite_alternatives(text: str, tone: str = "polite") -> Dict:
    """
    APIレスポンス用のフォーマットで丁寧語サジェスチョンを返す

    Args:
        text: チェック対象のテキスト
        tone: 目標のトーン ('formal', 'polite', 'casual')

    Returns:
        サジェスチョンのリストを含む辞書
    """
    # casualの場合はサジェスチョンなし
    if tone == "casual":
        return {"suggestions": [], "count": 0}

    target_level = "formal" if tone == "formal" else "polite"
    results = check_politeness(text, target_level)

    return {
        "suggestions": [
            {
                "original": s.original,
                "suggested": s.suggested,
                "position": {"start": s.start, "end": s.end},
                "reason": s.reason,
                "level": s.level
            }
            for s in results
        ],
        "count": len(results)
    }
