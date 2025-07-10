import React, { useState, useEffect, useCallback } from 'react';

interface ChatHistoryProps {
  userId: string;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ userId }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // API call placeholder
      console.log('Loading history for user:', userId);
      // setHistory(data);
    } catch (error) {
      console.error('History loading error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]); // userIdを依存関係に追加

  useEffect(() => {
    loadHistory();
  }, [loadHistory]); // loadHistoryを依存関係に追加

  return (
    <div className="chat-history">
      <h2>チャット履歴</h2>
      <p>User ID: {userId || '未設定'}</p>
      
      {!userId ? (
        <p>履歴を表示するにはユーザーIDを設定してください。</p>
      ) : loading ? (
        <p>履歴を読み込み中...</p>
      ) : (
        <div className="history-list">
          {history.length > 0 ? (
            history.map((item, index) => (
              <div key={index} className="history-item">
                <p>{item.message}</p>
              </div>
            ))
          ) : (
            <p>履歴がありません。</p>
          )}
        </div>
      )}
      
      <button onClick={loadHistory} disabled={loading || !userId}>
        履歴を更新
      </button>
    </div>
  );
};

export default ChatHistory;