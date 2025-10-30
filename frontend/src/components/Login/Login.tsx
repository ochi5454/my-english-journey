// src/components/Login/Login.tsx
import React, { useState } from 'react'
import './Login.css'

interface LoginProps {
  onLogin: (userId: string) => void
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // 簡易的なバリデーション
    if (!userId || !password) {
      setError('IDとパスワードを入力してください')
      return
    }

    // TODO: ここで実際の認証処理を行う
    // 現在は入力されたuserIdをそのまま使用
    onLogin(userId)
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>RAG Test</h1>
        <h2>ログイン</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userId">ユーザーID</label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="ユーザーIDを入力"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button">
            ログイン
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login