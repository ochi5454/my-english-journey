import React, { useEffect, useState } from 'react'

type ApprovalItem = {
  id: number
  pdfName: string
  pdfUrl: string
  date: string
  status: 'pending' | 'approved' | 'rejected'
  destination?: string
  team?: string
}

const STORAGE_KEY = 'transfer-approval-list'

const TransferApproval: React.FC = () => {
  const [items, setItems] = useState<ApprovalItem[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {
      setItems([])
    }
  }, [])

  const updateStatus = (id: number, status: ApprovalItem['status']) => {
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, status, team: it.destination || it.team } : it
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <div style={{ padding: '24px', color: '#0f172a' }}>
      <h2 style={{ marginBottom: '12px', color: '#0b2545' }}>移籍承認</h2>
      <div
        style={{
          border: '1px solid #d8c69c',
          borderRadius: '12px',
          background: '#fdfbf6',
          padding: '16px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
        }}
      >
        {items.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>承認待ちのデータはありません。</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center',
                  gap: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a href={it.pdfUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                    {it.pdfName}
                  </a>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>登録日時: {new Date(it.date).toLocaleString()}</span>
                  {it.team && (
                    <span style={{ fontSize: '12px', color: '#111827' }}>チーム: {it.team}</span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: '#111827', textAlign: 'center' }}>{it.status}</div>
                <button
                  onClick={() => updateStatus(it.id, 'approved')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#22c55e',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => updateStatus(it.id, 'rejected')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TransferApproval
