// src/App.tsx
import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'

import ResumeScoring from './components/ResumeScoring'     // 2025.8.4
import ResumeInterviewerOverview from './components/ResumeInterviewerOverview' // 2025.8.12
import ResumeHRReviewDashboard from './components/ResumeHRReviewDashboard'     // 2025.8.12
import WorkerDashboard from './components/WorkerDashboard' // 2025.8.25
import WorkerDetail from './components/WorkerDetail'       // 2025.8.25

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
          <div className="nav-brand"><h1>RAG Testing Chat</h1></div>
          <div className="nav-links">
            <Link to="/resume-scoring">候補者判定</Link>
            <Link to="/ResumeInterviewerOverview">面接官判定</Link>
            <Link to="/worker-dashboard">モニタリング</Link>
          </div>
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
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<ResumeScoring userId={userId} />} />
            <Route path="/resume-scoring" element={<ResumeScoring userId={userId} />} />
            <Route path="/ResumeInterviewerOverview" element={<ResumeInterviewerOverview />} />
            <Route path="/hr-review-dashboard" element={<ResumeHRReviewDashboard interviewerId={userId} />} />
            <Route path="/worker-dashboard" element={<WorkerDashboard />} />
            <Route path="/person/:name" element={<WorkerDetail />} />
            <Route path="*" element={<div>ページが見つかりません</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App