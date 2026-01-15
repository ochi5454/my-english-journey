import React from 'react'

// 簡易ダミー: ルートから除外したため、他コンポーネントで参照された場合のプレースホルダー
const HRFinalReviewDashboard: React.FC<{ interviewerId: string }> = ({ interviewerId }) => {
  return (
    <div style={{ padding: '24px' }}>
      <h2>HRFinalReviewDashboard</h2>
      <p>interviewerId: {interviewerId}</p>
      <p>このページは現在ナビゲーションから削除されています。</p>
    </div>
  )
}

export default HRFinalReviewDashboard
