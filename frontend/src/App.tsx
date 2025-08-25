import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import ProductRecommendation from './components/ProductRecommendation';
import DocumentSearch from './components/DocumentSearch';
import HashtagProcessor from './components/HashtagProcessor';
import ChatHistory from './components/ChatHistory';
import PptxSummarizer from './components/PptxSummarizer';  // 2025.7.22 Add（summarize pptx）
import ResumeScoring from './components/ResumeScoring';  // 2025.8.4 Add（Resume）
import ResumeInterviewerOverview from './components/ResumeInterviewerOverview'; // 2025.8.12 Add（HR review）
import ResumeHRReviewDashboard from './components/ResumeHRReviewDashboard'; // 2025.8.12 Add（HR review）
import WorkerDashboard from './components/WorkerDashboard'; // 2025.8.25 Add（Worker DB）
import WorkerDetail from "./components/WorkerDetail"; // 2025.8.25 Add（Worker DB）

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

  const handleUserIdChange = (newUserId: string) => {
    setUserId(newUserId);
  };

  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-brand">
            <h1>RAG Testing Chat</h1>
          </div>
          <div className="nav-links">
            <Link to="/">チャット</Link>
            <Link to="/history">チャット履歴</Link>
            <Link to="/recommend">商品推薦</Link> 
            {/* 2025.7.22 Add（summarize pptx）START */}
            <Link to="/pptx-summary">PPTX検索</Link>
            {/* 2025.7.22 Add（summarize pptx）END */}
            <Link to="/search">文書検索</Link>
            {/* 2025.8.4 Add（Resume）START */}
            <Link to="/ResumeScoring">候補者判定</Link>
            {/* 2025.8.4 Add（Resume）END */}
            {/* 2025.8.12 Add（HR review）START */}
            <Link to="/ResumeInterviewerOverview">面接官判定</Link>
            {/* <Link to="/hashtag">ハッシュタグ処理</Link> */}
            {/* 2025.8.12 Add（HR review）END */}
            {/* 2025.8.25 Add（Worker DB）START */}
            <Link to="/worker-dashboard">モニタリング</Link>
            {/* 2025.8.25 Add（Worker DB）END */}
          </div>
          {/* 2025.7.23 Add（summarize pptx）START */}
          <div className="user-info">
            <label htmlFor="userIdInput">User ID:</label>
            <input
              id="userIdInput"
              type="text"
              value={userId}
              onChange={(e) => handleUserIdChange(e.target.value)}
              placeholder="ユーザーIDを入力"
            />
          </div>
          {/* 2025.7.23 Add（summarize pptx）END */}
        </nav>

        <main className="main-content">
          <Routes>
            <Route 
              path="/" 
              element={<ChatInterface onUserIdChange={handleUserIdChange} />} 
            />
            <Route 
              path="/recommend" 
              element={<ProductRecommendation userId={userId} />} 
            />
            {/* 2025.7.22 Add（summarize pptx）START */}
            <Route 
              path="/pptx-summary" 
              element={<PptxSummarizer userId={userId} />} 
            />
            {/* 2025.7.22 Add（summarize pptx）END */}
            <Route 
              path="/search" 
              element={<DocumentSearch userId={userId} />} 
            />
            {/* 2025.8.4 Add（Resume）START */}
            <Route 
              path="/ResumeScoring" 
              element={<ResumeScoring userId={userId} />} 
            />
            {/* 2025.8.4 Add（Resume）END */}
            {/* 2025.8.12 Add（HR review）START */}
            <Route 
              path="/ResumeInterviewerOverview" 
              element={<ResumeInterviewerOverview />} 
            />
            <Route 
              path="/hr-review-dashboard" 
              element={<ResumeHRReviewDashboard interviewerId={userId} />} 
            />
            {/* 2025.8.12 Add（HR review）END */}
            {/* 2025.8.25 Add（Worker DB）START */}
            <Route 
              path="/worker-dashboard" 
              element={<WorkerDashboard />} 
            />
            <Route 
              path="/person/:name" 
              element={<WorkerDetail />}
            />
            {/* 2025.8.25 Add（Worker DB）END */}
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