import React, { useEffect, useState } from 'react'

// 履歴データの型（RefereeReport.tsxと整合させる）
type ReportHistory = {
  title: string
  competition?: string
  submittedAt: string
  form?: any
  html?: string
}

const RefereeReportHistory: React.FC = () => {
  const [history, setHistory] = useState<ReportHistory[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('refReportHistory')
      if (saved) setHistory(JSON.parse(saved))
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }, [])

  const openHistoryPdf = (entry: ReportHistory) => {
    if (!entry.form) {
      alert('この履歴には詳細が保存されていません。')
      return
    }
    const html = entry.html || '<p>データがありません。</p>'
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      alert('ポップアップがブロックされました。許可してください。')
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: '960px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '12px' }}>審判報告書の履歴</h2>
      {history.length === 0 && <div style={{ color: '#475569' }}>提出履歴はまだありません。</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {history.map((h, idx) => (
          <div
            key={`${h.submittedAt}-${idx}`}
            onClick={() => openHistoryPdf(h)}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px',
              background: '#fff',
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0b2545' }}>{h.title || '未設定'}</div>
            {h.competition && <div style={{ fontSize: '12px', color: '#475569' }}>{h.competition}</div>}
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(h.submittedAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RefereeReportHistory
