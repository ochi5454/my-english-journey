// src/App.tsx
import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import NewProjectManagement from './components/NewProjectManagement/NewProjectManagement'
import RefereeReport from './components/RefereeReport/RefereeReport'
import RefereeReportHistory from './components/RefereeReport/RefereeReportHistory'
import PrefectureAssociation from './components/PrefectureAssociation/PrefectureAssociation'
import PlayerManagementA from './components/PlayerManagementA/PlayerManagementA'
import PlayerManagementB from './components/PlayerManagementB/PlayerManagementB'

import './App.css'

const AppContent: React.FC = () => {
  const location = useLocation()

  return (
    <div className="app">
      <nav className="navbar">
        {/* 上段: ブランド・バッジ・ユーザー情報 */}
        <div className="navbar-top">
          <div className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>JFA(案)</h1>
          </div>

        </div>

        {/* 下段: メニューリンク */}
        <div className="navbar-bottom">
          <div className="nav-links">
            <Link to="/project-management-new">試合運営</Link>
            <div className="nav-dropdown">
              <button type="button" className="nav-dropdown-trigger">
                移籍管理
              </button>
              <div className="nav-dropdown-menu">
                <Link to="/player-management-a" className={`nav-dropdown-item ${location.pathname.startsWith('/player-management-a') ? 'active' : ''}`}>
                  PROTHENTIAFC
                </Link>
                <Link to="/player-management-b" className={`nav-dropdown-item ${location.pathname.startsWith('/player-management-b') ? 'active' : ''}`}>
                  横浜Fマリノス
                </Link>
                <Link to="/prefecture-association" className={`nav-dropdown-item ${location.pathname.startsWith('/prefecture-association') ? 'active' : ''}`}>
                  都道府県協会
                </Link>
              </div>
            </div>
            <div className="nav-dropdown">
              <button type="button" className="nav-dropdown-trigger">審判報告書</button>
              <div className="nav-dropdown-menu">
                <Link to="/referee-report" className={`nav-dropdown-item ${location.pathname === '/referee-report' ? 'active' : ''}`}>
                  報告書作成
                </Link>
                <Link to="/referee-report/history" className={`nav-dropdown-item ${location.pathname === '/referee-report/history' ? 'active' : ''}`}>
                  過去の履歴を見る
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div key={location.pathname} className="page-transition">
          <Routes>
            <Route path="/" element={<Navigate to="/project-management-new" replace />} />
            <Route path="/project-management-new" element={<NewProjectManagement />} />
            <Route path="/player-management-a" element={<PlayerManagementA />} />
            <Route path="/player-management-b" element={<PlayerManagementB />} />
            <Route path="/prefecture-association" element={<PrefectureAssociation />} />
            <Route path="/referee-report" element={<RefereeReport />} />
            <Route path="/referee-report/history" element={<RefereeReportHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
