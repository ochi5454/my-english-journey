'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogIn } from 'lucide-react'
import { API_BASE } from '../constants/excel'
const CALLBACK_PATH = '/auth/callback'

const buildLoginUrl = (origin: string) =>
  `${API_BASE}/auth/entra/login?redirect_uri=${encodeURIComponent(`${origin}${CALLBACK_PATH}`)}`

export default function LoginPage() {
  const [loginUrl, setLoginUrl] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminStatus, setAdminStatus] = useState<string | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setLoginUrl(buildLoginUrl(window.location.origin))
  }, [])

  const handleLogin = () => {
    if (!loginUrl) return
    window.location.href = loginUrl
  }

  const handleAdminLogin = async () => {
    if (!email || !password) {
      setAdminStatus('メールとパスワードを入力してください')
      return
    }
    setAdminLoading(true)
    setAdminStatus(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login/basic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      setAdminStatus('ログイン成功！トップへ移動します…')
      // Cookieが設定されるのを待ってから遷移
      await new Promise((r) => setTimeout(r, 300))
      window.location.href = '/'
    } catch (e: any) {
      setAdminStatus(`ログイン失敗: ${e?.message || e}`)
    } finally {
      setAdminLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
        color: '#e2e8f0',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#0b1220',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          border: '1px solid rgba(226,232,240,0.08)',
          }}
      >
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>サインイン</h1>
        <p style={{ color: '#cbd5e1', marginBottom: '20px', lineHeight: 1.6 }}>
          Microsoft Entra ID または 管理者メール/パスワードでログインできます。
        </p>

        {/* Entra ID */}
        <div style={{ marginBottom: '18px' }}>
          <button
            type="button"
            onClick={handleLogin}
            disabled={!loginUrl}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: '#2563eb',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loginUrl ? 'pointer' : 'not-allowed',
              boxShadow: '0 10px 30px rgba(37,99,235,0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseDown={(e) => {
              if (!loginUrl) return
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)'
            }}
            onMouseUp={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            }}
          >
            <LogIn size={18} />
            <span>Microsoftでログイン</span>
          </button>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
            ※ ログイン後は自動的に元の画面へ戻ります。
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(148,163,184,0.2)', margin: '16px 0' }} />

        {/* Admin login */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0' }}>管理者ログイン</div>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ID"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: '14px',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: '14px',
            }}
          />
          <button
            type="button"
            onClick={handleAdminLogin}
            disabled={adminLoading}
            style={{
              width: '100%',
              background: adminLoading ? '#94a3b8' : '#0ea5e9',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: adminLoading ? 'wait' : 'pointer',
              boxShadow: '0 10px 30px rgba(14,165,233,0.35)',
            }}
          >
            {adminLoading ? 'サインイン中…' : '管理者でログイン'}
          </button>
          {adminStatus && (
            <div style={{ fontSize: '13px', color: adminStatus.startsWith('ログイン成功') ? '#22c55e' : '#f87171' }}>
              {adminStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
