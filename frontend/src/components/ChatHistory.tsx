import React, { useState, useEffect, useCallback } from 'react';
import { chatHistoryApi } from '../services/api';
import './ChatHistory.css';

interface ChatHistoryProps {
  userId: string;
}

interface Message {
  role: string;
  content: string;
}

interface Conversation {
  timestamp: string;
  messages: Message[];
}

interface BackendConversation {
  timestamp: string;
  messages: Message[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ userId }) => {
  const [history, setHistory] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!userId) {
      setHistory([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await chatHistoryApi.getChatHistory(userId);
      console.log('APIから取得したデータ:', data);

      // Handle the actual backend response structure based on emitbreaker.json
      if (data.messages && Array.isArray(data.messages)) {
        // If backend returns {messages: [...]}
        const formattedHistory: Conversation[] = data.messages.map((conversation: any) => ({
          timestamp: conversation.timestamp || 'N/A',
          messages: conversation.messages || []
        }));
        console.log('変換後の履歴データ:', formattedHistory);
        setHistory(formattedHistory);
      } else if (Array.isArray(data)) {
        // If backend returns array directly (like emitbreaker.json)
        const formattedHistory: Conversation[] = data.map((conversation: BackendConversation) => ({
          timestamp: conversation.timestamp || 'N/A',
          messages: conversation.messages || []
        }));
        console.log('変換後の履歴データ:', formattedHistory);
        setHistory(formattedHistory);
      } else {
        setHistory([]);
        setError('履歴データが正しい形式ではありません。');
      }
    } catch (err: any) {
      console.error('履歴読み込みエラー:', err);
      setError('履歴の読み込み中にエラーが発生しました。');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="chat-history">
      <div className="chat-header">
        <h2>チャット履歴</h2>
        <div className="user-info">
          <span>User ID: {userId || '未設定'}</span>
          {history.length > 0 && (
            <span className="history-count">({history.length}件)</span>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!userId ? (
        <div className="no-user-message">ユーザーIDを設定してください。</div>
      ) : loading ? (
        <div className="loading-message">履歴を読み込み中...</div>
      ) : (
        <div className="messages-container">
          {history.length > 0 ? (
            history.map((conversation, index) => (
              <div key={index} className="conversation">
                <div className="conversation-timestamp">
                  {new Date(conversation.timestamp).toLocaleString('ja-JP')}
                </div>
                {conversation.messages.map((message, msgIndex) => (
                  <div
                    key={msgIndex}
                    className={`message ${
                      message.role === 'user'
                        ? 'user-message'
                        : message.role === 'assistant'
                        ? 'assistant-message'
                        : 'context-message'
                    }`}
                  >
                    <div className="message-content">{message.content}</div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="no-history-message">履歴がありません。</div>
          )}
        </div>
      )}

      <div className="history-controls">
        <button onClick={loadHistory} disabled={loading || !userId}>
          {loading ? '読み込み中...' : '履歴を更新'}
        </button>
      </div>
    </div>
  );
};

export default ChatHistory;