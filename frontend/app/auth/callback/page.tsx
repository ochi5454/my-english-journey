'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { API_BASE } from '../../constants/excel'

const CALLBACK_PATH = '/auth/callback'

function AuthCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [message, setMessage] = useState('認証コードを確認しています…')
  const [isError, setIsError] = useState(false)
  const exchangeStarted = useRef(false)

  useEffect(() => {
    if (!searchParams) return
    // Prevent duplicate calls (React StrictMode runs effects twice)
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      setMessage(`認証エラー: ${error}`)
      setIsError(true)
      return
    }
    if (!code) {
      setMessage('認証コードが見つかりませんでした。')
      setIsError(true)
      return
    }

    const exchange = async () => {
      try {
        const redirectUri = `${window.location.origin}${CALLBACK_PATH}`
        const res = await fetch(`${API_BASE}/auth/entra/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state, redirect_uri: redirectUri }),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        setMessage('サインインに成功しました。画面に戻ります…')
        setTimeout(() => router.replace('/'), 600)
      } catch (e: any) {
        setIsError(true)
        setMessage(`サインインに失敗しました: ${e?.message || e}`)
      }
    }

    exchange()
  }, [router, searchParams])

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '420px',
        background: '#0b1220',
        borderRadius: '14px',
        padding: '22px',
        border: '1px solid rgba(226,232,240,0.08)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 600, color: isError ? '#fca5a5' : '#cbd5e1' }}>{message}</div>
      {!isError && (
        <div style={{ marginTop: '12px', color: '#94a3b8', fontSize: '13px' }}>
          数秒経っても切り替わらない場合は、このページを閉じて再度ログインしてください。
        </div>
      )}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '420px',
        background: '#0b1220',
        borderRadius: '14px',
        padding: '22px',
        border: '1px solid rgba(226,232,240,0.08)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#cbd5e1' }}>読み込み中…</div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
        padding: '24px',
      }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <AuthCallbackContent />
      </Suspense>
    </div>
  )
}
