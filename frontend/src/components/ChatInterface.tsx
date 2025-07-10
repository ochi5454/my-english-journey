import React, { useState } from 'react';

interface ChatInterfaceProps {
  onUserIdChange: (userId: string) => void;
}

interface Message {
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onUserIdChange }) => {
  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string>(() => {
    return localStorage.getItem('userId') || ''; // 初期値としてローカルストレージから取得
  });

  const handleUserIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUserId = e.target.value;
    setUserId(newUserId);
    onUserIdChange(newUserId); // App.tsxの状態を更新
    localStorage.setItem('userId', newUserId); // ローカルストレージに保存
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      sender: 'user',
      content: inputMessage,
      timestamp: new Date().toLocaleString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      // API呼び出し
      const response = await fetch(`http://localhost:8000/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          message: inputMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        sender: 'assistant',
        content: data.assistant_message || 'エラーが発生しました。',
        timestamp: new Date().toLocaleString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: Message = {
        sender: 'assistant',
        content: 'エラーが発生しました。再度お試しください。',
        timestamp: new Date().toLocaleString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setInputMessage('');
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h2>AI チャット</h2>
        <div className="user-id-input">
          <input
            type="text"
            placeholder="ユーザーID (空白で自動生成)"
            value={userId}
            onChange={handleUserIdChange}
          />
        </div>
      </div>
      <div className="messages-container">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.sender === 'user' ? 'user-message' : 'assistant-message'}`}
          >
            <p>{message.content}</p>
            <span className="timestamp">{message.timestamp}</span>
          </div>
        ))}
      </div>
      <div className="input-container">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="メッセージを入力してください..."
        />
        <button onClick={sendMessage}>送信</button>
      </div>
    </div>
  );
};

export default ChatInterface;