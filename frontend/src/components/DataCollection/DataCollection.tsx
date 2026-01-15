import React from 'react'

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(12,74,110,0.12)',
  borderRadius: '14px',
  background: 'linear-gradient(135deg, #f8fafc, #eef2ff)',
  padding: '16px',
  boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
}

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  borderRadius: '999px',
  background: '#0ea5e9',
  color: '#f8fafc',
  fontSize: '12px',
  fontWeight: 700,
}

const statCard = (title: string, value: string, sub: string, tone: string) => (
  <div
    style={{
      borderRadius: '14px',
      padding: '14px',
      background: tone,
      color: '#0f172a',
      boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
    }}
  >
    <div style={{ fontSize: '12px', color: '#334155', marginBottom: '4px' }}>{title}</div>
    <div style={{ fontSize: '26px', fontWeight: 800 }}>{value}</div>
    <div style={{ fontSize: '12px', color: '#475569' }}>{sub}</div>
  </div>
)

const DataCollection: React.FC = () => {
  return (
    <div style={{ padding: '24px', color: '#0f172a', background: 'radial-gradient(circle at 20% 20%, #e0f2fe 0, transparent 25%), radial-gradient(circle at 80% 10%, #e5e7eb 0, transparent 22%)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0b2545' }}>データ収集</h2>
          <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '14px' }}>
            育成年代の所属チームとプロ到達・キャリア年数の相関分析用ダミーデータを生成／配布するダッシュボード。
          </p>
        </div>
      </div>
    </div>
  )
}

export default DataCollection
