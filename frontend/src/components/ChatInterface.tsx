import React, { useState, useEffect, useRef } from 'react';
import { chatApi } from '../services/api';
import './ChatInterface.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  summary?: string;
  topics?: string[];
}

interface Props {
  onUserIdChange: (userId: string) => void;
}

const ChatInterface: React.FC<Props> = ({ onUserIdChange }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await chatApi.sendMessage({
        user_id: userId,
        message: inputMessage
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.assistant_message,
        timestamp: new Date().toISOString(),
        summary: response.summary,
        topics: response.topics
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // ユーザーIDを更新
      if (response.user_id && response.user_id !== userId) {
        setUserId(response.user_id);
        onUserIdChange(response.user_id);
      }

    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'エラーが発生しました。再度お試しください。',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
            onChange={(e) => {
              setUserId(e.target.value);
              onUserIdChange(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content}
            </div>
            <div className="message-meta">
              <span className="timestamp">
                {new Date(message.timestamp).toLocaleString('ja-JP')}
              </span>
              {message.topics && message.topics.length > 0 && (
                <div className="topics">
                  トピック: {message.topics.join(', ')}
                </div>
              )}
              {message.summary && (
                <div className="summary">
                  要約: {message.summary}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant loading">
            <div className="loading-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="メッセージを入力してください..."
          rows={3}
          disabled={isLoading}
        />
        <button 
          onClick={sendMessage} 
          disabled={isLoading || !inputMessage.trim()}
          className="send-button"
        >
          送信
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;