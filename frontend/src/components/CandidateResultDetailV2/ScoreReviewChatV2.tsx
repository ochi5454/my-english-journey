import React, { useRef, useEffect } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface Props {
  chatLog: ChatMessage[];
  chatInput: string;
  isSending: boolean;
  hasMustCheckFailure: boolean;
  onInputChange: (val: string) => void;
  onSend: () => void;
}

// 簡易的なマークダウン→HTML変換
const renderMarkdown = (text: string): string => {
  let html = text;

  // マークダウンテーブルを<table>に変換（改行変換の前に実施）
  html = html.replace(/\|(.+?)\|\n\|[-:\s|]+\|\n((?:\|.+?\|(?:\n|$))+)/g, (_match, header, rows) => {
    const headers = header.split('|').map((h: string) => h.trim()).filter(Boolean);
    const rowsArray = rows.trim().split('\n').map((row: string) =>
      row.split('|').map((cell: string) => cell.trim()).filter(Boolean)
    );

    const headerHtml = '<tr>' + headers.map((h: string) => `<th>${h}</th>`).join('') + '</tr>';
    const rowsHtml = rowsArray.map((row: string[]) =>
      '<tr>' + row.map((cell: string) => `<td>${cell}</td>`).join('') + '</tr>'
    ).join('');

    return `<table class="markdown-table"><thead>${headerHtml}</thead><tbody>${rowsHtml}</tbody></table>`;
  });

  // 太字 **text** → <strong>text</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 改行を<br>に（テーブル変換後に実施）
  html = html.replace(/\n/g, '<br>');

  return html;
};

const ScoreReviewChatV2: React.FC<Props> = ({
  chatLog,
  chatInput,
  isSending,
  hasMustCheckFailure,
  onInputChange,
  onSend,
}) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 自動スクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  return (
    <div className="floating-chat-body">
      <div className="chat-box">
        {chatLog.length === 0 && <div className="chat-empty">チャットログがありません</div>}
        {chatLog.map((msg, i) => (
          <div
            key={i}
            className={`chat-bubble ${msg.role === "user" ? "user" : "ai"}`}
          >
            <span>{msg.role === "user" ? "👤" : "🤖"}</span>{" "}
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          </div>
        ))}
        {isSending && (
          <div className="chat-bubble ai thinking">
            <div className="dot-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={chatInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={
            hasMustCheckFailure
              ? "⚠️ 必須要件未達のため、AIスコア精査は実施できません"
              : "質問・修正依頼を入力..."
          }
          disabled={hasMustCheckFailure || isSending}
        />
        <button
          onClick={onSend}
          disabled={isSending || hasMustCheckFailure}
          className="action-button primary send-btn"
        >
          {isSending ? "送信中..." : "送信"}
        </button>
      </div>
    </div>
  );
};

export default ScoreReviewChatV2;
