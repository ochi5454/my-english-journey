// src/App.tsx
import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'

import ResumeScoringChatMode from './components/ResumeScoringChatMode/ResumeScoringChatMode'
import AdminPanel from './components/AdminPanel/AdminPanel'

import './App.css'

const App: React.FC = () => {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '')

  useEffect(() => {
    if (userId) localStorage.setItem('userId', userId)
  }, [userId])

  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="navbar-left">
            <div className="nav-brand">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                RAG Test
                <span className="badge">支社ver</span>
              </h1>
            </div>
          </div>

          <div className="navbar-center">
            <div className="nav-links">
              <Link to="/resume-scoring-chatmode">候補者判定</Link>
              <Link to="/admin">管理</Link>
            </div>
          </div>

          <div className="navbar-right">
            <div className="user-info">
              <label htmlFor="userIdInput">User ID:</label>
              <input
                id="userIdInput"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="ユーザーIDを入力"
              />
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<ResumeScoringChatMode userId={userId} />} />
            <Route path="/resume-scoring-chatmode" element={<ResumeScoringChatMode userId={userId} />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<div>ページが見つかりません</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App