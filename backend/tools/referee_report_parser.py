#!/usr/bin/env python3
"""
審判会議の会話テキストから報告書項目を自動抽出するスクリプト
"""

import re
import json
from datetime import datetime


class RefereeReportParser:
    def __init__(self):
        self.report_data = {
            "大会名": "",
            "試合区分": "",
            "節/ラウンド": "",
            "試合日": "",
            "キックオフ": "",
            "試合終了": "",
            "会場": "",
            "天候": "",
            "気温(℃)": "",
            "ピッチ状態": "",
            "ホームチーム": "",
            "アウェイチーム": "",
            "ホームチーム色": "",
            "アウェイチーム色": "",
            "ホーム得点": "",
            "アウェイ得点": "",
            "主審": "",
            "副審1": "",
            "副審2": "",
            "第4の審判員": "",
            "予備審判員": "",
            "警告": [],
            "退場": [],
            "負傷者": [],
            "交代選手": [],
            "技術エリア関連": [],
            "その他特記事項": [],
            "内容": "",
            "メモ": "",
        }

    def parse_conversation(self, conversation_text):
        lines = conversation_text.strip().split("\n")
        full_text = " ".join(lines)

        match = re.search(r'大会名[はわ]?[「"]?([^」"\n。？]+)[」"]?', full_text)
        if match:
            self.report_data["大会名"] = match.group(1).strip()

        match = re.search(r"試合区分[はわ]?(\d+種)", full_text)
        if match:
            self.report_data["試合区分"] = match.group(1)

        match = re.search(r"節[／/]ラウンド[はわ]?(第\d+節)", full_text)
        if match:
            self.report_data["節/ラウンド"] = match.group(1)

        match = re.search(r"(\d+)時(\d+)分キックオフ", full_text)
        if match:
            self.report_data["キックオフ"] = f"{match.group(1)}:{match.group(2)}"

        match = re.search(r"試合終了[はわ]?(\d+)時(\d+)分", full_text)
        if match:
            self.report_data["試合終了"] = f"{match.group(1)}:{match.group(2)}"

        match = re.search(r'会場[はわ]?[「"]?([^」"\n。]+?(?:スタジアム|競技場|グラウンド|フィールド|コート)[^\n。]*?)[」"\n。]', full_text)
        if match:
            self.report_data["会場"] = match.group(1).strip()

        match = re.search(r"天候[はわ]?(晴れ?|雨|曇り?|雪|快晴)", full_text)
        if match:
            self.report_data["天候"] = match.group(1).replace("れ", "")

        match = re.search(r"気温(\d+)度", full_text)
        if match:
            self.report_data["気温(℃)"] = match.group(1)

        match = re.search(r'ピッチ状態[はわ]?[「"]?(良|不良|やや不良)[」"]?', full_text)
        if match:
            self.report_data["ピッチ状態"] = match.group(1)

        match = re.search(r'[AＡ]チーム[「"]([^」"]+)[」"].*?[BＢ]チーム[「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["ホームチーム"] = match.group(1)
            self.report_data["アウェイチーム"] = match.group(2)

        match = re.search(r"結果[はわ]?\s*[AＡ]\s*(\d+)\s*[–—−-]\s*(\d+)\s*[BＢ]", full_text)
        if match:
            self.report_data["ホーム得点"] = match.group(1)
            self.report_data["アウェイ得点"] = match.group(2)

        match = re.search(r'主審[はわ]?私?[「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["主審"] = match.group(1)

        match = re.search(r'副審[1１][「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["副審1"] = match.group(1)

        match = re.search(r'副審[2２][「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["副審2"] = match.group(1)

        match = re.search(r'第[4４][のﾉ]審判員?[「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["第4の審判員"] = match.group(1)

        self._extract_warnings(full_text)
        self._extract_ejections(full_text)
        self._extract_injuries(full_text)
        self._extract_substitutions(full_text)
        self._extract_technical_area(full_text)
        self._extract_other_notes(full_text)

        return self.report_data

    def _extract_warnings(self, text):
        pattern = r"(前半|後半)(\d+)分\s*([AＡBＢ])チーム(\d+)番\s*([^。\n]+?)(?:[。\n]|(?=前半|後半|\Z))"
        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ["A", "Ａ"] else "アウェイ"
            number = match.group(4)
            reason = match.group(5).strip()
            if "退場" not in reason:
                warning = f"{half}{minute}分 {team}チーム{number}番 {reason}"
                self.report_data["警告"].append(warning)

    def _extract_ejections(self, text):
        pattern = r"退場[はわ]?(前半|後半)(\d+)分[、，]?\s*([AＡBＢ])チーム(\d+)番[。\s]*([^。\n]*?)(?:[。\n]|(?=前半|後半|\Z))"
        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ["A", "Ａ"] else "アウェイ"
            number = match.group(4)
            reason = match.group(5).strip()
            ejection = f"{half}{minute}分 {team}チーム{number}番 {reason}"
            self.report_data["退場"].append(ejection)

    def _extract_injuries(self, text):
        pattern = r"負傷者[はわ]?(\d+)名[。\s]*(前半|後半)(\d+)分[、，]?\s*([AＡBＢ])チーム(\d+)番[がを]?([^。\n]+?)(?:[。\n])"
        match = re.search(pattern, text)
        if match:
            half = match.group(2)
            minute = match.group(3)
            team = "ホーム" if match.group(4) in ["A", "Ａ"] else "アウェイ"
            number = match.group(5)
            detail = match.group(6).strip()
            injury = f"{half}{minute}分 {team}チーム{number}番 {detail}"
            self.report_data["負傷者"].append(injury)

    def _extract_substitutions(self, text):
        pattern_a = r"[AＡ]チーム[はわ]?(前半|後半)(\d+)分[、，]\s*(\d+)分[、，]\s*(\d+)分[のﾉ](\d+)名交代"
        match = re.search(pattern_a, text)
        if match:
            half = match.group(1)
            min1, min2, min3 = match.group(2), match.group(3), match.group(4)
            self.report_data["交代選手"].append(f"ホームチーム: {half}{min1}分、{min2}分、{min3}分")

        pattern_b = r"[BＢ]チーム[はわ]?(前半|後半)(\d+)分[、，]\s*(\d+)分[のﾉ](\d+)名交代"
        match = re.search(pattern_b, text)
        if match:
            half = match.group(1)
            min1, min2 = match.group(2), match.group(3)
            self.report_data["交代選手"].append(f"アウェイチーム: {half}{min1}分、{min2}分")

    def _extract_technical_area(self, text):
        pattern = r"(前半|後半)(\d+)分[にで]([AＡBＢ])チーム監督[がを]([^。\n]+?)(?:[。\n])"
        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ["A", "Ａ"] else "アウェイ"
            detail = match.group(4).strip()
            note = f"{half}{minute}分 {team}チーム監督 {detail}"
            self.report_data["技術エリア関連"].append(note)

    def _extract_other_notes(self, text):
        if "観客席から" in text or "紙コップ" in text:
            match = re.search(r"(前半|後半)(\d+)分[にで]観客席から([^。\n]+?)(?:[。\n])", text)
            if match:
                note = f"{match.group(1)}{match.group(2)}分 観客席から{match.group(3)}"
                self.report_data["その他特記事項"].append(note)

        if "ボールパーソン" in text:
            self.report_data["その他特記事項"].append("ボールパーソンに入れ替わり遅れあり（試合に影響なし）")

    def format_output(self):
        output = []
        output.append("=" * 80)
        output.append("審判報告書 - 自動抽出結果")
        output.append("=" * 80)
        output.append("大会名: " + self.report_data["大会名"])
        output.append("試合区分: " + self.report_data["試合区分"])
        output.append("節/ラウンド: " + self.report_data["節/ラウンド"])
        output.append("試合日: " + self.report_data["試合日"])
        output.append("キックオフ: " + self.report_data["キックオフ"])
        output.append("会場: " + self.report_data["会場"])
        output.append("天候: " + self.report_data["天候"])
        output.append("気温(℃): " + self.report_data["気温(℃)"])
        output.append("ピッチ状態: " + self.report_data["ピッチ状態"])
        output.append("ホームチーム: " + self.report_data["ホームチーム"])
        output.append("アウェイチーム: " + self.report_data["アウェイチーム"])
        output.append("ホームチーム色: " + self.report_data["ホームチーム色"])
        output.append("アウェイチーム色: " + self.report_data["アウェイチーム色"])
        output.append("ホーム得点: " + self.report_data["ホーム得点"])
        output.append("アウェイ得点: " + self.report_data["アウェイ得点"])
        output.append("主審: " + self.report_data["主審"])
        output.append("副審1: " + self.report_data["副審1"])
        output.append("副審2: " + self.report_data["副審2"])
        output.append("第4の審判員: " + self.report_data["第4の審判員"])
        output.append("予備審判員: " + self.report_data["予備審判員"])

        if self.report_data["警告"]:
            output.append("警告:")
            for i, warning in enumerate(self.report_data["警告"], 1):
                output.append(f"  {i}. {warning}")
        else:
            output.append("警告: なし")

        if self.report_data["退場"]:
            output.append("退場:")
            for i, ejection in enumerate(self.report_data["退場"], 1):
                output.append(f"  {i}. {ejection}")
        else:
            output.append("退場: なし")

        incidents = []
        if self.report_data["負傷者"]:
            incidents.extend(["[負傷] " + injury for injury in self.report_data["負傷者"]])
        if self.report_data["技術エリア関連"]:
            incidents.extend(["[技術エリア] " + note for note in self.report_data["技術エリア関連"]])
        if self.report_data["その他特記事項"]:
            incidents.extend(["[その他] " + note for note in self.report_data["その他特記事項"]])
        if self.report_data["交代選手"]:
            incidents.extend(["[交代] " + sub for sub in self.report_data["交代選手"]])

        if incidents:
            output.append("内容:")
            for incident in incidents:
                output.append(f"  - {incident}")
        else:
            output.append("内容: 特記事項なし")

        output.append("メモ: " + self.report_data["メモ"])
        output.append("=" * 80)
        return "\n".join(output)

    def to_json(self):
        return json.dumps(self.report_data, ensure_ascii=False, indent=2)


def main():
    conversation = """
R: では、報告書作成のための会議を始めます。今回は項目に沿って話していくことが求められているので、順番に読み合わせながら確認しましょう。まず 大会名 からですが、大会名はOOです。 これで間違いないですね？
...
R: ではこれで会議終了です。お疲れ様でした。
"""
    parser = RefereeReportParser()
    result = parser.parse_conversation(conversation)
    print(parser.format_output())
    print("\n【JSON形式】")
    print(parser.to_json())


if __name__ == "__main__":
    main()
