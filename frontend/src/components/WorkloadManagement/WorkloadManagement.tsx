import React from 'react'

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  background: '#fff',
  boxShadow: '0 4px 10px rgba(0,0,0,0.04)',
  padding: '16px',
}

const WorkloadManagement: React.FC = () => {
  return (
    <div style={{ padding: '24px', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '12px' }}>工数管理</h2>
      <div style={{ display: 'grid', gap: '16px' }}>
        <section style={cardStyle}>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>概要</h3>
          <p style={{ margin: 0, color: '#4b5563', fontSize: '13px' }}>
            工数やリソース配分を管理するページです。稼働時間や割り当てをここに追加していきます。
          </p>
        </section>
        <section style={cardStyle}>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>TODO</h3>
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#374151', fontSize: '13px', lineHeight: 1.6 }}>
            <li>工数入力フォーム</li>
            <li>チーム/個人ごとの集計</li>
            <li>グラフ・テーブル表示</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

export default WorkloadManagement
