import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import ProductRecommendation from './components/ProductRecommendation';
import DocumentSearch from './components/DocumentSearch';
import HashtagProcessor from './components/HashtagProcessor';
import ChatHistory from './components/ChatHistory';
import './App.css';

const App: React.FC = () => {
  const [userId, setUserId] = useState<string>(() => {
    // 初期値としてローカルストレージから取得
    return localStorage.getItem('userId') || '';
  });

  // ユーザーIDが変更されたらローカルストレージに保存
  useEffect(() => {
    if (userId) {
      localStorage.setItem('userId', userId);
    }
  }, [userId]);

  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-brand">
            <h1>Memory Persistence Chat</h1>
          </div>
          <div className="nav-links">
            <Link to="/">チャット</Link>
            <Link to="/recommend">商品推薦</Link>
            <Link to="/search">文書検索</Link>
            <Link to="/hashtag">ハッシュタグ処理</Link>
            <Link to="/history">履歴</Link>
          </div>
          <div className="user-info">
            <span>User ID: {userId || '未設定'}</span>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route 
              path="/" 
              element={<ChatInterface onUserIdChange={setUserId} />} 
            />
            <Route 
              path="/recommend" 
              element={<ProductRecommendation userId={userId} />} 
            />
            <Route 
              path="/search" 
              element={<DocumentSearch userId={userId} />} 
            />
            <Route 
              path="/hashtag" 
              element={<HashtagProcessor userId={userId} />} 
            />
            <Route 
              path="/history" 
              element={<ChatHistory userId={userId} />} 
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;