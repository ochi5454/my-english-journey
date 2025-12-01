import React, { useRef, useEffect, useState } from "react";
import appConfig from '../../config';
import type { StatusMasterRow } from "./StatusBar";


type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface Props {
  chatLog: ChatMessage[];
  chatInput: string;
  chatStage: string;
  isSending: boolean;
  hasMustCheckFailure: boolean;
  onInputChange: (val: string) => void;
  onStageChange: (stage: string) => void;
  onSend: () => void;
}

const ScoreReviewChat: React.FC<Props> = ({
  chatLog,
  chatInput,
  chatStage,
  isSending,
  hasMustCheckFailure,
  onInputChange,
  onStageChange,
  onSend,
}) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [reviewStageOptions, setReviewStageOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
      .then(res => res.json())
      .then((rows: StatusMasterRow[]) => {
        const stages = rows
          .filter((r: StatusMasterRow) => r.is_review_target)
          .sort(
            (a: StatusMasterRow, b: StatusMasterRow) =>
              (a.order ?? 999) - (b.order ?? 999)
          )
          .map((r: StatusMasterRow) => r.label);

        setReviewStageOptions(stages);
      })
      .catch(err => console.error("StatusMaster取得エラー:", err));
  }, []);

  // 📜 自動スクロール制御（入力中は止める）
  useEffect(() => {
    if (!isUserInteracting) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatLog]);

  return (
    <div className="result-d-detail-right">
      <div className="result-d-chat-header">
        <h4>AIとのスコア精査チャット</h4>
      </div>

      {/* 💬 チャットログ */}
      <div className="result-d-chat-box styled-chat-box">
        {chatLog.map((msg, i) => (
          <div
            key={i}
            className={`chat-bubble ${
              msg.role === "user" ? "bubble-user" : "bubble-ai"
            }`}
          >
            <div className="bubble-content">
            {msg.role === "user" ? "👤" : "🤖"}{" "}
            {msg.content
                .replace("###FINAL", "")
                .replace(/^[\s\S]*?(会話|確定|確認|提案)フェーズ\s*→\s*/, "") // ←絵文字や改行含め柔軟に対応
                .trim()}
            </div>
          </div>
        ))}

        {/* ⏳ 応答中インジケータ */}
        {isSending && (
          <div className="bubble-ai thinking">
            <div className="dot-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 🔽 ステージ選択 */}
      <select
        value={chatStage}
        onChange={(e) => onStageChange(e.target.value)}
        className="result-d-chat-stage-selector"
        disabled={hasMustCheckFailure || isSending}
      >
        {reviewStageOptions.map(stage => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>

      {/* ✍ 入力欄 */}
      <textarea
        className="result-d-chat-input"
        value={chatInput}
        onFocus={() => setIsUserInteracting(true)}
        onBlur={() => setIsUserInteracting(false)}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={
          hasMustCheckFailure
            ? "⚠️ マスト要件未達のため、AIスコア精査は実施できません"
            : "質問・修正依頼を入力..."
        }
        disabled={hasMustCheckFailure || isSending}
      />

      {/* 🚀 送信ボタン */}
      <button
        onClick={onSend}
        disabled={isSending || hasMustCheckFailure}
        className={`result-d-submit ${isSending ? "sending" : ""}`}
      >
        {isSending ? "送信中..." : "送信"}
      </button>
    </div>
  );
};

export default ScoreReviewChat;