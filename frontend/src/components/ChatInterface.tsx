import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';
import { chatApi } from '../services/api'; // ← 変更

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
    return localStorage.getItem('userId') || '';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleUserIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUserId = e.target.value;
    setUserId(newUserId);
    onUserIdChange(newUserId);
    localStorage.setItem('userId', newUserId);
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
      // ← ここを変更
      const data = await chatApi.sendMessage({
        user_id: userId,
        message: inputMessage,
      });

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 改行を保持してテキストを表示するためのヘルパー関数
  const formatTextWithLineBreaks = (text: string) => {
    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h2>AI チャット</h2>
        <div className="user-id-input">
          <input
            type="text"
            placeholder="ユーザーID"
            value={userId}
            onChange={handleUserIdChange}
          />
        </div>
      </div>
      
      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.sender}-message`}>
            <div className={`message-avatar ${message.sender}-avatar`}>
              {message.sender === 'user' ? 'U' : 'AI'}
            </div>
            <div className="message-content">
              <div className="message-bubble">
                {formatTextWithLineBreaks(message.content)}
              </div>
              <div className="timestamp">
                {message.timestamp}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-container">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="メッセージを入力してください..."
          rows={1}
        />
        <button onClick={sendMessage} disabled={!inputMessage.trim()}>
          送信
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;