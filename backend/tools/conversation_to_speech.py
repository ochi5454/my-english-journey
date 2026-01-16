#!/usr/bin/env python3
"""
会話テキストを音声データに変換するスクリプト
gTTSを使用して日本語の会話を音声ファイルに変換します
"""

import os
import re
import subprocess
from gtts import gTTS
from pydub import AudioSegment


# 会話テキスト
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


def parse_conversation(text):
    lines = text.strip().split("\n")
    dialogue = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^(R|AR1|AR2|4th):\s*(.+)$", line, re.DOTALL)
        if match:
            speaker = match.group(1)
            txt = match.group(2).strip()
            dialogue.append({"speaker": speaker, "text": txt})
    return dialogue


def create_speech_files(dialogue, output_dir="output_audio"):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    audio_files = []
    for i, item in enumerate(dialogue):
        speaker = item["speaker"]
        txt = item["text"]
        tts = gTTS(text=txt, lang="ja", slow=False)
        filename = f"{output_dir}/segment_{i:03d}_{speaker}.mp3"
        tts.save(filename)
        audio_files.append({"filename": filename, "speaker": speaker})
    return audio_files


def merge_audio_files(audio_files, output_filename="conversation_full.mp3", pause_duration=800):
    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=pause_duration)
    for i, item in enumerate(audio_files):
        audio = AudioSegment.from_mp3(item["filename"])
        combined += audio
        if i < len(audio_files) - 1:
            combined += pause
    combined.export(output_filename, format="mp3")


def main():
    dialogue = parse_conversation(conversation)
    audio_files = create_speech_files(dialogue)
    merge_audio_files(audio_files, output_filename="referee_meeting.mp3", pause_duration=800)


if __name__ == "__main__":
    main()
