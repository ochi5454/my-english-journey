'use client'

import { useEffect, useState } from 'react'
import { api } from './lib/api'

type Progress = {
  total: { minutes: number; hours: number; target_hours: number }
  categories: Record<string, { minutes: number; hours: number; target_hours: number }>
  subcategories: { category: string; subcategory: string; minutes: number; hours: number; target_hours: number }[]
}

export default function HomePage() {
  const [data, setData] = useState<Progress | null>(null)

  useEffect(() => {
    api<Progress>('/api/progress').then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="p-4 text-gray-500">読み込み中...</div>

  const pct = data.total.target_hours > 0
    ? Math.min((data.total.hours / data.total.target_hours) * 100, 100)
    : 0

  const catPct = (cat: string) => {
    const c = data.categories[cat]
    if (!c || c.target_hours === 0) return 0
    return Math.min((c.hours / c.target_hours) * 100, 100)
  }

  const subOrder = {
    '基礎': ['発音', '単語', '文法'],
    '運用': ['スピーキング', 'リスニング', 'リーディング', 'ライティング'],
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-[#c9a84c] mb-4">My English Journey</h1>

      {/* 総進捗 */}
      <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-800">
        <div className="flex justify-between items-baseline mb-1">
          <p className="text-sm text-gray-400">総進捗</p>
          <p className="text-xs text-gray-500">{pct.toFixed(1)}%</p>
        </div>
        <p className="text-2xl font-bold">{data.total.hours}h <span className="text-base text-gray-500">/ {data.total.target_hours.toLocaleString()}h</span></p>
        <div className="mt-2 h-3 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-[#c9a84c] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* カテゴリ別 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {(['基礎', '運用'] as const).map((cat) => {
          const c = data.categories[cat] || { hours: 0, target_hours: 0 }
          return (
            <div key={cat} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <p className="text-xs text-gray-400 mb-1">{cat}学習</p>
              <p className="text-lg font-bold">{c.hours}h <span className="text-sm text-gray-500">/ {c.target_hours}h</span></p>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-[#c9a84c] rounded-full transition-all" style={{ width: `${catPct(cat)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* サブカテゴリ内訳 */}
      {(['基礎', '運用'] as const).map((cat) => (
        <div key={cat} className="bg-gray-900 rounded-xl p-4 mb-3 border border-gray-800">
          <p className="text-sm font-bold text-gray-300 mb-3">{cat}学習 内訳</p>
          <div className="space-y-3">
            {subOrder[cat].map((sub) => {
              const found = data.subcategories.find(
                (s) => s.category === cat && s.subcategory === sub
              )
              const hours = found?.hours || 0
              const target = found?.target_hours || 0
              const subPct = target > 0 ? Math.min((hours / target) * 100, 100) : 0
              return (
                <div key={sub}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-400">{sub}</span>
                    <span className="font-bold">{hours}h <span className="text-gray-500 font-normal">/ {target}h</span></span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c9a84c] rounded-full transition-all"
                      style={{ width: `${subPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
