import React, { useState, useEffect } from 'react';
import './ChatHistory.css';

interface ChatHistoryProps {
  userId: string;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  user_message: string;
  assistant_message: string;
  summary?: string;
  topics?: string[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ userId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (userId) {
      loadHistory();
    }
  }, [userId]);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/history?user_id=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setHistory(data.history || []);
    } catch (err) {
      setError('履歴の読み込み中にエラーが発生しました。');
      console.error('History loading error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHistory = history.filter(item =>
    item.user_message.toLowerCase().includes(filter.toLowerCase()) ||
    item.assistant_message.toLowerCase().includes(filter.toLowerCase()) ||
    (item.summary && item.summary.toLowerCase().includes(filter.toLowerCase()))
  );

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ja-JP');
  };

  return (
    <div className="chat-history">
      <div className="history-header">
        <h2>チャット履歴</h2>
        <p>{userId ? `ユーザー: ${userId}` : 'ユーザーIDが設定されていません'}</p>
      </div>

      {userId && (
        <>
          <div className="history-controls">
            <div className="filter-section">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="履歴を検索..."
                className="filter-input"
              />
            </div>
            <button onClick={loadHistory} className="refresh-button">
              更新
            </button>
          </div>

          {isLoading && (
            <div className="loading-message">
              履歴を読み込み中...
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {!isLoading && !error && (
            <div className="history-list">
              {filteredHistory.length > 0 ? (
                <>
                  <div className="history-stats">
                    {filter ? `${filteredHistory.length}件の結果` : `全${history.length}件の履歴`}
                  </div>
                  {filteredHistory.map((item) => (
                    <div key={item.id} className="history-item">
                      <div className="history-timestamp">
                        {formatDate(item.timestamp)}
                      </div>
                      <div className="history-conversation">
                        <div className="user-message">
                          <strong>ユーザー:</strong> {item.user_message}
                        </div>
                        <div className="assistant-message">
                          <strong>アシスタント:</strong> {item.assistant_message}
                        </div>
                      </div>
                      {item.summary && (
                        <div className="history-summary">
                          <strong>要約:</strong> {item.summary}
                        </div>
                      )}
                      {item.topics && item.topics.length > 0 && (
                        <div className="history-topics">
                          <strong>トピック:</strong>
                          <div className="topics-list">
                            {item.topics.map((topic, index) => (
                              <span key={index} className="topic-tag">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div className="no-history">
                  {filter ? '該当する履歴が見つかりません。' : 'まだチャット履歴がありません。'}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!userId && (
        <div className="no-user-message">
          チャット履歴を表示するには、まずユーザーIDを設定してください。
        </div>
      )}
    </div>
  );
};

export default ChatHistory;