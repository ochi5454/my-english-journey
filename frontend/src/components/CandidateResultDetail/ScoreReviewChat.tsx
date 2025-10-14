import React from "react";
import { reviewStages } from "../Utils/candidateStatus";

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
    return (
        <div className="result-d-detail-right">
        <div className="result-d-chat-header">
            <h4>AIとのスコア精査チャット</h4>
        </div>

        {/* 💬 チャットログ */}
        <div className="result-d-chat-box">
            {chatLog.map((msg, i) => (
            <div key={i} className={`result-d-chat-msg ${msg.role}`}>
                <strong>{msg.role === "user" ? "👤" : "🤖"}:</strong> {msg.content}
            </div>
            ))}
        </div>

        {/* 🔽 ステージ選択 */}
        <select
            value={chatStage}
            onChange={(e) => onStageChange(e.target.value)}
            className="result-d-chat-stage-selector"
            disabled={hasMustCheckFailure}
        >
            {reviewStages
            .filter((stage) => stage !== "アップロード")
            .map((stage) => (
                <option key={stage} value={stage}>
                {stage}
                </option>
            ))}
        </select>

        {/* ✍ 入力欄 */}
        <textarea
            className="result-d-chat-input"
            value={chatInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={
            hasMustCheckFailure
                ? "⚠️ マスト要件未達のため、AIスコア精査は実施できません"
                : "質問・修正依頼を入力..."
            }
            disabled={hasMustCheckFailure}
        />

        {/* 🚀 送信ボタン */}
        <button
            onClick={onSend}
            disabled={isSending || hasMustCheckFailure}
            className="result-d-submit"
        >
            {isSending ? "送信中..." : "送信"}
        </button>
        </div>
    );
};

export default ScoreReviewChat;