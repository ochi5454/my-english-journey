// src/App.tsx
import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'

import Login from './components/Login/Login'
import ResumeScoringChatMode from './components/ResumeScoringChatMode/ResumeScoringChatMode'
import ResumeScoring from './components/ResumeScoring/ResumeScoring'
import InterviewerOverview from './components/InterviewerOverview/InterviewerOverview'
import HRFinalReviewDashboard from './components/HRFinalReviewDashboard/HRFinalReviewDashboard'
import AdminPanel from './components/AdminPanel/AdminPanel'

import './App.css'

const AppContent: React.FC<{ userId: string; onLogout: () => void }> = ({ userId, onLogout }) => {
  const location = useLocation()
  
  // 現在のルートに基づいてバッジを切り替え
  const badgeText = location.pathname === '/resume-scoring-chatmode' ? '支社ver' : '本社ver'

  return (
    <div className="app">
      <nav className="navbar">
        {/* 上段: ブランド・バッジ・ユーザー情報 */}
        <div className="navbar-top">
          <div className="nav-brand">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              採用支援AIエージェント
              <span className="badge">{badgeText}</span>
            </h1>
          </div>

          <div className="user-info">
            <span className="user-display">User: {userId}</span>
            <button onClick={onLogout} className="logout-button">
              ログアウト
            </button>
          </div>
        </div>

        {/* 下段: メニューリンク */}
        <div className="navbar-bottom">
          <div className="nav-links">
            <Link to="/resume-scoring-chatmode">候補者判定（簡易）</Link>
            <Link to="/resume-scoring">候補者判定（詳細）</Link>
            <Link to="/interviewer-overview">面接官判定</Link>
            <Link to="/admin">管理</Link>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<ResumeScoring userId={userId} />} />
          <Route path="/resume-scoring-chatmode" element={<ResumeScoringChatMode userId={userId} />} />
          <Route path="/resume-scoring" element={<ResumeScoring userId={userId} />} />
          <Route path="/interviewer-overview" element={<InterviewerOverview />} />
          <Route path="/hr-final-review" element={<HRFinalReviewDashboard interviewerId={userId} />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

const App: React.FC = () => {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('userId'))

  const handleLogin = (id: string) => {
    setUserId(id)
    setIsAuthenticated(true)
    localStorage.setItem('userId', id)
  }

  const handleLogout = () => {
    setUserId('')
    setIsAuthenticated(false)
    localStorage.removeItem('userId')
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <Router>
      <AppContent userId={userId} onLogout={handleLogout} />
    </Router>
  )
}

export default App