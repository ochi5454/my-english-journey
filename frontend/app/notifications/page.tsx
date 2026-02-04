'use client'

import { useState } from 'react'
import { Mail, AlertTriangle, CheckCircle, XCircle, Loader2, Calendar } from 'lucide-react'
import { API_BASE } from '../constants/excel'
import { AuthGuard } from '../components/AuthGuard'
import { HeaderBar } from '../components/HeaderBar'

type SendResult = {
  sent: Array<{
    org6: string
    emails: string[]
    recipient_count: number
    rows: number
    attachments: string[]
  }>
  skipped: Array<{
    org6: string
    emails: string[]
    reason: string
  }>
}

export default function NotificationsPage() {
  const [dataDate, setDataDate] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleSend = async () => {
    setSending(true)
    setError(null)
    setResult(null)
    setShowConfirm(false)

    try {
      const body: { data_date?: string } = {}
      if (dataDate) {
        body.data_date = dataDate
      }

      const res = await fetch(`${API_BASE}/notifications/overtime-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: SendResult = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSending(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '本日'
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <AuthGuard>
      <div className="dash-shell">
        <header className="dash-header-bar">
          <div className="header-title">メール送信システム</div>
        </header>
        <HeaderBar />
        <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>

          {/* メール送信セクション */}
          <section
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Mail size={24} style={{ color: '#2563eb' }} />
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
                時間外労働状況メール送信
              </h2>
            </div>

            <p style={{ color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              所属名称6（org6）ごとに、残業時間レポートをメールで送信します。
              <br />
              送信先は person_progress データセットに登録されているメンバーです。
            </p>

            {/* 日付選択 */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#475569',
                  marginBottom: 8,
                }}
              >
                <Calendar size={16} />
                データ基準日（オプション）
              </label>
              <input
                type="date"
                value={dataDate}
                onChange={(e) => setDataDate(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 14,
                  width: 200,
                }}
              />
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                未指定の場合は本日の日付がメール本文に記載されます
              </p>
            </div>

            {/* 送信ボタン */}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={sending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: sending ? '#94a3b8' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              }}
            >
              {sending ? (
                <>
                  <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  送信中...
                </>
              ) : (
                <>
                  <Mail size={18} />
                  メールを送信
                </>
              )}
            </button>
          </section>

          {/* 確認ダイアログ */}
          {showConfirm && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}
              onClick={() => setShowConfirm(false)}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  width: '90%',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>送信確認</h3>
                </div>
                <p style={{ color: '#475569', marginBottom: 8, lineHeight: 1.6 }}>
                  以下の内容でメールを送信します。よろしいですか？
                </p>
                <ul style={{ color: '#64748b', fontSize: 14, marginBottom: 20, paddingLeft: 20 }}>
                  <li>基準日: <strong>{formatDate(dataDate)}</strong></li>
                  <li>送信先: 全org6のメンバー</li>
                  <li>添付: Excel + PDF</li>
                </ul>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowConfirm(false)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSend}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    送信する
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <section
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <XCircle size={24} style={{ color: '#dc2626' }} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>
                    送信エラー
                  </h3>
                  <p style={{ color: '#991b1b', fontSize: 14 }}>{error}</p>
                </div>
              </div>
            </section>
          )}

          {/* 結果表示 */}
          {result && (
            <section
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <CheckCircle size={24} style={{ color: '#16a34a' }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>送信結果</h2>
              </div>

              {/* サマリー */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    background: '#f0fdf4',
                    borderRadius: 8,
                    padding: 16,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#16a34a' }}>
                    {result.sent.length}
                  </div>
                  <div style={{ fontSize: 14, color: '#15803d' }}>送信成功</div>
                </div>
                <div
                  style={{
                    background: '#fef9c3',
                    borderRadius: 8,
                    padding: 16,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#ca8a04' }}>
                    {result.skipped.length}
                  </div>
                  <div style={{ fontSize: 14, color: '#a16207' }}>スキップ</div>
                </div>
              </div>

              {/* 送信成功リスト */}
              {result.sent.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#16a34a', marginBottom: 12 }}>
                    送信成功 ({result.sent.length}件)
                  </h4>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {result.sent.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#f8fafc',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 8,
                          fontSize: 14,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.org6}</div>
                        <div style={{ color: '#64748b' }}>
                          {item.recipient_count}名に送信 / {item.rows}行のデータ
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* スキップリスト */}
              {result.skipped.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#ca8a04', marginBottom: 12 }}>
                    スキップ ({result.skipped.length}件)
                  </h4>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {result.skipped.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#fffbeb',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 8,
                          fontSize: 14,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.org6}</div>
                        <div style={{ color: '#92400e' }}>{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </AuthGuard>
  )
}
