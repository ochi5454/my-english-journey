'use client'

import { useState } from 'react'
import { Mail, CheckCircle, XCircle, Loader2, Calendar, Eye, ChevronDown, ChevronUp, Users, FileText } from 'lucide-react'
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

type PreviewRecipient = {
  email: string
  name: string
  emp_no: string
}

type PreviewItem = {
  org6: string
  subject: string
  recipients: PreviewRecipient[]
  recipient_count: number
  body: string | null
  attachments: string[]
  overtime_row_count: number
  status: 'ready' | 'skip'
  skip_reason: string | null
}

type PreviewResult = {
  total_emails: number
  total_recipients: number
  skipped_count: number
  previews: PreviewItem[]
}

export default function NotificationsPage() {
  const [dataDate, setDataDate] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [expandedOrg6, setExpandedOrg6] = useState<string | null>(null)

  const handlePreview = async () => {
    setPreviewing(true)
    setError(null)
    setPreviewResult(null)

    try {
      const body: { data_date?: string } = {}
      if (dataDate) {
        body.data_date = dataDate
      }

      const res = await fetch(`${API_BASE}/notifications/overtime-email/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: PreviewResult = await res.json()
      setPreviewResult(data)
      setShowPreview(true)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setPreviewing(false)
    }
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    setResult(null)

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
      setShowPreview(false)
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

  const toggleOrg6Expand = (org6: string) => {
    setExpandedOrg6(expandedOrg6 === org6 ? null : org6)
  }

  return (
    <AuthGuard>
      <div className="dash-shell">
        <header className="dash-header-bar">
          <div className="header-title">メール送信システム</div>
        </header>
        <HeaderBar />
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

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

            {/* ボタン */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handlePreview}
                disabled={previewing || sending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: previewing ? '#94a3b8' : '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: previewing || sending ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
                }}
              >
                {previewing ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    読み込み中...
                  </>
                ) : (
                  <>
                    <Eye size={18} />
                    プレビュー
                  </>
                )}
              </button>
            </div>
          </section>

          {/* プレビューモーダル */}
          {showPreview && previewResult && (
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
                padding: 16,
              }}
              onClick={() => setShowPreview(false)}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  maxWidth: 800,
                  width: '100%',
                  maxHeight: '90vh',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* モーダルヘッダー */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <Eye size={24} style={{ color: '#059669' }} />
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>メールプレビュー</h3>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      送信予定: {previewResult.total_emails}件
                    </span>
                    <span style={{ color: '#2563eb' }}>
                      宛先: {previewResult.total_recipients}名
                    </span>
                    {previewResult.skipped_count > 0 && (
                      <span style={{ color: '#ca8a04' }}>
                        スキップ: {previewResult.skipped_count}件
                      </span>
                    )}
                    <span style={{ color: '#64748b' }}>
                      基準日: {formatDate(dataDate)}
                    </span>
                  </div>
                </div>

                {/* モーダルコンテンツ */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                  {previewResult.previews.map((item) => (
                    <div
                      key={item.org6}
                      style={{
                        background: item.status === 'ready' ? '#f8fafc' : '#fffbeb',
                        borderRadius: 8,
                        marginBottom: 12,
                        border: item.status === 'ready' ? '1px solid #e2e8f0' : '1px solid #fde68a',
                      }}
                    >
                      {/* org6ヘッダー */}
                      <div
                        style={{
                          padding: '12px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={() => toggleOrg6Expand(item.org6)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            style={{
                              background: item.status === 'ready' ? '#059669' : '#ca8a04',
                              color: '#fff',
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {item.org6}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
                            <Users size={14} />
                            <span>{item.recipient_count}名</span>
                            <FileText size={14} style={{ marginLeft: 8 }} />
                            <span>{item.overtime_row_count}行</span>
                          </div>
                          {item.status === 'skip' && (
                            <span style={{ color: '#ca8a04', fontSize: 13 }}>
                              ({item.skip_reason})
                            </span>
                          )}
                        </div>
                        {expandedOrg6 === item.org6 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>

                      {/* 展開時の詳細 */}
                      {expandedOrg6 === item.org6 && item.status === 'ready' && (
                        <div style={{ padding: '0 16px 16px' }}>
                          {/* 件名 */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>件名</div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                              {item.subject}
                            </div>
                          </div>

                          {/* 宛先 */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>宛先</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {item.recipients.map((r) => (
                                <span
                                  key={r.emp_no}
                                  style={{
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                  }}
                                >
                                  {r.name || r.emp_no} &lt;{r.email}&gt;
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* 添付ファイル */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>添付ファイル</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {item.attachments.map((att) => (
                                <span
                                  key={att}
                                  style={{
                                    background: '#f0fdf4',
                                    color: '#15803d',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                  }}
                                >
                                  {att}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* 本文 */}
                          <div>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>本文</div>
                            <pre
                              style={{
                                background: '#f1f5f9',
                                padding: 12,
                                borderRadius: 6,
                                fontSize: 12,
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 200,
                                overflowY: 'auto',
                                margin: 0,
                              }}
                            >
                              {item.body}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* モーダルフッター */}
                <div
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    onClick={() => setShowPreview(false)}
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
                    disabled={sending || previewResult.total_emails === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: sending || previewResult.total_emails === 0 ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: sending || previewResult.total_emails === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        送信中...
                      </>
                    ) : (
                      <>
                        <Mail size={16} />
                        {previewResult.total_emails}件を送信
                      </>
                    )}
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
                    エラー
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
