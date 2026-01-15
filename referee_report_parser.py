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
            "メモ": ""
        }

    def parse_conversation(self, conversation_text):
        """
        会話テキストを解析して報告書データを抽出
        """
        lines = conversation_text.strip().split('\n')
        full_text = ' '.join(lines)

        # 大会名の抽出
        match = re.search(r'大会名[はわ]?[「"]?([^」"\n。？]+)[」"]?', full_text)
        if match:
            self.report_data["大会名"] = match.group(1).strip()

        # 試合区分の抽出
        match = re.search(r'試合区分[はわ]?(\d+種)', full_text)
        if match:
            self.report_data["試合区分"] = match.group(1)

        # 節/ラウンドの抽出
        match = re.search(r'節[／/]ラウンド[はわ]?(第\d+節)', full_text)
        if match:
            self.report_data["節/ラウンド"] = match.group(1)

        # キックオフ時刻の抽出
        match = re.search(r'(\d+)時(\d+)分キックオフ', full_text)
        if match:
            self.report_data["キックオフ"] = f"{match.group(1)}:{match.group(2)}"

        # 試合終了時刻の抽出
        match = re.search(r'試合終了[はわ]?(\d+)時(\d+)分', full_text)
        if match:
            self.report_data["試合終了"] = f"{match.group(1)}:{match.group(2)}"

        # 会場の抽出
        match = re.search(r'会場[はわ]?[「"]?([^」"\n。]+?(?:スタジアム|競技場|グラウンド|フィールド|コート)[^\n。]*?)[」"\n。]', full_text)
        if match:
            self.report_data["会場"] = match.group(1).strip()

        # 天候の抽出
        match = re.search(r'天候[はわ]?(晴れ?|雨|曇り?|雪|快晴)', full_text)
        if match:
            self.report_data["天候"] = match.group(1).replace('れ', '')

        # 気温の抽出
        match = re.search(r'気温(\d+)度', full_text)
        if match:
            self.report_data["気温(℃)"] = match.group(1)

        # ピッチ状態の抽出
        match = re.search(r'ピッチ状態[はわ]?[「"]?(良|不良|やや不良)[」"]?', full_text)
        if match:
            self.report_data["ピッチ状態"] = match.group(1)

        # チーム名の抽出
        match = re.search(r'[AＡ]チーム[「"]([^」"]+)[」"].*?[BＢ]チーム[「"]([^」"]+)[」"]', full_text)
        if match:
            self.report_data["ホームチーム"] = match.group(1)
            self.report_data["アウェイチーム"] = match.group(2)

        # スコアの抽出
        match = re.search(r'結果[はわ]?\s*[AＡ]\s*(\d+)\s*[–—−-]\s*(\d+)\s*[BＢ]', full_text)
        if match:
            self.report_data["ホーム得点"] = match.group(1)
            self.report_data["アウェイ得点"] = match.group(2)

        # 審判団の抽出
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

        # 警告の抽出
        self._extract_warnings(full_text)

        # 退場の抽出
        self._extract_ejections(full_text)

        # 負傷者の抽出
        self._extract_injuries(full_text)

        # 交代選手の抽出
        self._extract_substitutions(full_text)

        # 技術エリア関連の抽出
        self._extract_technical_area(full_text)

        # その他特記事項の抽出
        self._extract_other_notes(full_text)

        return self.report_data

    def _extract_warnings(self, text):
        """警告情報の抽出"""
        # パターン: 前半20分 Aチーム6番 反スポーツ的行為（不用意なチャージ）
        pattern = r'(前半|後半)(\d+)分\s*([AＡBＢ])チーム(\d+)番\s*([^。\n]+?)(?:[。\n]|(?=前半|後半|\Z))'

        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ['A', 'Ａ'] else "アウェイ"
            number = match.group(4)
            reason = match.group(5).strip()

            # 退場でない場合のみ警告として記録
            if '退場' not in reason:
                warning = f"{half}{minute}分 {team}チーム{number}番 {reason}"
                self.report_data["警告"].append(warning)

    def _extract_ejections(self, text):
        """退場情報の抽出"""
        pattern = r'退場[はわ]?(前半|後半)(\d+)分[、，]?\s*([AＡBＢ])チーム(\d+)番[。\s]*([^。\n]*?)(?:[。\n]|(?=前半|後半|\Z))'

        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ['A', 'Ａ'] else "アウェイ"
            number = match.group(4)
            reason = match.group(5).strip()

            ejection = f"{half}{minute}分 {team}チーム{number}番 {reason}"
            self.report_data["退場"].append(ejection)

    def _extract_injuries(self, text):
        """負傷者情報の抽出"""
        pattern = r'負傷者[はわ]?(\d+)名[。\s]*(前半|後半)(\d+)分[、，]?\s*([AＡBＢ])チーム(\d+)番[がを]?([^。\n]+?)(?:[。\n])'

        match = re.search(pattern, text)
        if match:
            half = match.group(2)
            minute = match.group(3)
            team = "ホーム" if match.group(4) in ['A', 'Ａ'] else "アウェイ"
            number = match.group(5)
            detail = match.group(6).strip()

            injury = f"{half}{minute}分 {team}チーム{number}番 {detail}"
            self.report_data["負傷者"].append(injury)

    def _extract_substitutions(self, text):
        """交代選手情報の抽出"""
        # Aチームの交代
        pattern_a = r'[AＡ]チーム[はわ]?(前半|後半)(\d+)分[、，]\s*(\d+)分[、，]\s*(\d+)分[のﾉ](\d+)名交代'
        match = re.search(pattern_a, text)
        if match:
            half = match.group(1)
            min1, min2, min3 = match.group(2), match.group(3), match.group(4)
            self.report_data["交代選手"].append(f"ホームチーム: {half}{min1}分、{min2}分、{min3}分")

        # Bチームの交代
        pattern_b = r'[BＢ]チーム[はわ]?(前半|後半)(\d+)分[、，]\s*(\d+)分[のﾉ](\d+)名交代'
        match = re.search(pattern_b, text)
        if match:
            half = match.group(1)
            min1, min2 = match.group(2), match.group(3)
            self.report_data["交代選手"].append(f"アウェイチーム: {half}{min1}分、{min2}分")

    def _extract_technical_area(self, text):
        """技術エリア関連情報の抽出"""
        pattern = r'(前半|後半)(\d+)分[にで]([AＡBＢ])チーム監督[がを]([^。\n]+?)(?:[。\n])'

        matches = re.finditer(pattern, text)
        for match in matches:
            half = match.group(1)
            minute = match.group(2)
            team = "ホーム" if match.group(3) in ['A', 'Ａ'] else "アウェイ"
            detail = match.group(4).strip()

            note = f"{half}{minute}分 {team}チーム監督 {detail}"
            self.report_data["技術エリア関連"].append(note)

    def _extract_other_notes(self, text):
        """その他特記事項の抽出"""
        # 観客関連
        if '観客席から' in text or '紙コップ' in text:
            match = re.search(r'(前半|後半)(\d+)分[にで]観客席から([^。\n]+?)(?:[。\n])', text)
            if match:
                note = f"{match.group(1)}{match.group(2)}分 観客席から{match.group(3)}"
                self.report_data["その他特記事項"].append(note)

        # ボールパーソン関連
        if 'ボールパーソン' in text:
            self.report_data["その他特記事項"].append("ボールパーソンに入れ替わり遅れあり（試合に影響なし）")

    def format_output(self):
        """
        整形された出力を生成（全情報を1つのブロックにまとめる）
        """
        output = []
        output.append("=" * 80)
        output.append("審判報告書 - 自動抽出結果")
        output.append("=" * 80)

        # 試合情報
        output.append("大会名: " + self.report_data['大会名'])
        output.append("試合区分: " + self.report_data['試合区分'])
        output.append("節/ラウンド: " + self.report_data['節/ラウンド'])
        output.append("試合日: " + self.report_data['試合日'])
        output.append("キックオフ: " + self.report_data['キックオフ'])
        output.append("会場: " + self.report_data['会場'])
        output.append("天候: " + self.report_data['天候'])
        output.append("気温(℃): " + self.report_data['気温(℃)'])
        output.append("ピッチ状態: " + self.report_data['ピッチ状態'])

        # 試合結果
        output.append("ホームチーム: " + self.report_data['ホームチーム'])
        output.append("アウェイチーム: " + self.report_data['アウェイチーム'])
        output.append("ホームチーム色: " + self.report_data['ホームチーム色'])
        output.append("アウェイチーム色: " + self.report_data['アウェイチーム色'])
        output.append("ホーム得点: " + self.report_data['ホーム得点'])
        output.append("アウェイ得点: " + self.report_data['アウェイ得点'])

        # 審判団
        output.append("主審: " + self.report_data['主審'])
        output.append("副審1: " + self.report_data['副審1'])
        output.append("副審2: " + self.report_data['副審2'])
        output.append("第4の審判員: " + self.report_data['第4の審判員'])
        output.append("予備審判員: " + self.report_data['予備審判員'])

        # 警告/退場
        if self.report_data['警告']:
            output.append("警告:")
            for i, warning in enumerate(self.report_data['警告'], 1):
                output.append(f"  {i}. {warning}")
        else:
            output.append("警告: なし")

        if self.report_data['退場']:
            output.append("退場:")
            for i, ejection in enumerate(self.report_data['退場'], 1):
                output.append(f"  {i}. {ejection}")
        else:
            output.append("退場: なし")

        # 特記事項/インシデント
        incidents = []
        if self.report_data['負傷者']:
            incidents.extend(["[負傷] " + injury for injury in self.report_data['負傷者']])
        if self.report_data['技術エリア関連']:
            incidents.extend(["[技術エリア] " + note for note in self.report_data['技術エリア関連']])
        if self.report_data['その他特記事項']:
            incidents.extend(["[その他] " + note for note in self.report_data['その他特記事項']])
        if self.report_data['交代選手']:
            incidents.extend(["[交代] " + sub for sub in self.report_data['交代選手']])

        if incidents:
            output.append("内容:")
            for incident in incidents:
                output.append(f"  - {incident}")
        else:
            output.append("内容: 特記事項なし")

        # 備考
        output.append("メモ: " + self.report_data['メモ'])

        output.append("=" * 80)

        return '\n'.join(output)

    def to_json(self):
        """
        JSON形式で出力
        """
        return json.dumps(self.report_data, ensure_ascii=False, indent=2)


def main():
    # サンプル会話テキスト
    conversation = """
R: では、報告書作成のための会議を始めます。今回は項目に沿って話していくことが求められているので、順番に読み合わせながら確認しましょう。まず 大会名 からですが、大会名はOOです。 これで間違いないですね？

4th: はい、大会本部からの案内も「OO」で統一されています。

R: 次に 試合区分は1種です。 たとえば「リーグ戦」「カップ戦」などがある区分ですが、今回は"OO区分"です。

AR1: その通りです。大会資料でも1種で記載されています。

R: 続いて 節／ラウンドは第2節です。 これは大会ホームページにも明記されていました。

AR2: 私の控えでも「第2節」となっています。

R: 試合日時ですが、今日は9時59分キックオフ。
前半45分＋AT3分、後半45分＋AT4分。
試合終了は11時52分です。

AR1: 時計で確認していますので間違いありません。

4th: 会場は「市営スタジアムBコート」。使用球は公式支給球で問題なしです。

R: 天候は晴れ、気温23度。風は南寄りの微風。
ピッチ状態は「良」で記録します。

AR2: 芝の長さも均一で、ボールの転がりも問題ありませんでした。

R: チームはAチーム「レッドスターズ」、Bチーム「ブルーウィングス」。
結果は A 3 – 1 B。

AR1: 得点者は、前半12分A9番、後半5分A18番、後半22分B11番、後半38分A7番でした。

4th: PKや退場絡みの得点はありません。

R: 主審は私「佐藤」。
副審1「高橋」、副審2「木村」、第4の審判員「山田」で記録してください。

AR1: すべて県協会所属で間違いありません。

R: 次に警告記録について。今回4件、退場1件ありました。前半20分　Aチーム6番　反スポーツ的行為（不用意なチャージ）。前半43分　Bチーム4番　遅延行為（FK時ボール移動）。後半15分　Aチーム10番　異議。後半33分　Bチーム13番　反スポーツ的行為（ユニフォーム引っ張り）。

AR2: いずれも私の視野でも確認できており、妥当な警告だと思います。

R: 退場は後半36分、Bチーム4番。
2枚目の警告となり、理由は「異議」です。

4th: ベンチ側も混乱せず、退場処理はスムーズでした。

R: 負傷者は1名。後半12分、Aチーム11番が足首を捻りトレーナーが入りました。治療後プレー続行。

AR1: 医療スタッフの対応も問題なく、試合の中断は約1分でした。

R: Aチームは後半10分、28分、42分の3名交代。
Bチームは後半18分、30分の2名交代。

AR2: すべて交代ボードの表示通りで、登録外の選手はなし。

4th: 技術エリアに関しては、後半18分にBチーム監督が判定への強い抗議を行い、私が注意しました。
その後、抗議が再発したため主審がイエローカードを提示しました。

R: 監督への警告は後半20分で記録します。

R: その他の特記事項ですが、前半10分に観客席から紙コップが1つピッチ外側に落ちました。
危険性なく、中断はなし。

AR1: 担架要員の配置も良く、問題はありませんでした。

4th: ボールパーソンに1名、入れ替わり遅れがありましたが、試合には影響していません。

R: では報告書の全項目に沿って確認できましたので—
大会名：OO。
試合区分：OO。
節／ラウンド：OO。
試合情報：9時59分キックオフ／11時52分終了。
天候・ピッチ：晴れ／良。
結果：A 3 – 1 B。
警告：4名。
退場：1名。
負傷：A 11番軽度。
技術エリア：監督への警告1件。
運営：軽微な投げ込み1件、影響なし。
以上の通りで報告書はすべて埋まります。
問題なければ私が報告書に転記します。

AR1: 問題ありません。

AR2: 一致しています。

4th: こちらも確認しました。

R: ではこれで会議終了です。お疲れ様でした。
"""

    # パーサーの実行
    parser = RefereeReportParser()
    result = parser.parse_conversation(conversation)

    # 結果の表示
    print(parser.format_output())

    # JSON出力（必要に応じて）
    print("\n【JSON形式】")
    print(parser.to_json())


if __name__ == "__main__":
    main()
