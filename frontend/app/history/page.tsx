'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'

type StudyRecord = {
  id: number
  date: string
  category: string
  subcategory: string
  minutes: number
  note: string | null
}

const CATEGORIES: { [key: string]: string[] } = {
  '基礎': ['発音', '単語', '文法'],
  '運用': ['スピーキング', 'リスニング', 'リーディング', 'ライティング'],
}

type Tab = '週' | '月' | '年'

function fmt(d: Date) { return d.toISOString().split('T')[0] }

function getDateRange(tab: Tab, offset: number): { from: string; to: string; label: string } {
  const today = new Date()

  if (tab === '週') {
    const end = new Date(today)
    end.setDate(end.getDate() + offset * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    return {
      from: fmt(start),
      to: fmt(end),
      label: `${start.getMonth() + 1}/${start.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()}`,
    }
  }

  if (tab === '月') {
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return {
      from: fmt(base),
      to: fmt(end),
      label: `${base.getFullYear()}年${base.getMonth() + 1}月`,
    }
  }

  // 年
  const year = today.getFullYear() + offset
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: `${year}年`,
  }
}

type BarData = { label: string; minutes: number }

function buildChartData(tab: Tab, offset: number, records: StudyRecord[]): BarData[] {
  const today = new Date()

  if (tab === '週') {
    const end = new Date(today)
    end.setDate(end.getDate() + offset * 7)
    const bars: BarData[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      const dateStr = fmt(d)
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`
      const total = records.filter(r => r.date === dateStr).reduce((s, r) => s + r.minutes, 0)
      bars.push({ label: dayLabel, minutes: total })
    }
    return bars
  }

  if (tab === '月') {
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    const bars: BarData[] = []
    const labelDays = [1, 10, 20, daysInMonth]
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const total = records.filter(r => r.date === dateStr).reduce((s, r) => s + r.minutes, 0)
      bars.push({ label: labelDays.includes(d) ? `${d}` : '', minutes: total })
    }
    return bars
  }

  // 年: 12ヶ月
  const year = today.getFullYear() + offset
  const bars: BarData[] = []
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`
    const total = records.filter(r => r.date.startsWith(monthStr)).reduce((s, r) => s + r.minutes, 0)
    bars.push({ label: `${m}月`, minutes: total })
  }
  return bars
}

function gridLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`
}

function calcGridLines(maxData: number, tab: Tab): number[] {
  if (maxData <= 0) {
    return tab === '年' ? [60 * 20, 60 * 40, 60 * 60] : [60, 180, 300]
  }
  // 最大値に合わせて3本の目盛線を生成
  const niceSteps = [10, 15, 20, 30, 60, 90, 120, 180, 300, 600, 60*20, 60*40, 60*60, 60*100]
  const target = maxData / 2.5 // 最上の目盛線がデータの上あたりに来るように
  const step = niceSteps.find(s => s >= target) || niceSteps[niceSteps.length - 1]
  return [step, step * 2, step * 3]
}

function BarChart({ data, tab }: { data: BarData[]; tab: Tab }) {
  const maxData = Math.max(...data.map(d => d.minutes))
  const gridLines = calcGridLines(maxData, tab)
  const maxGrid = gridLines[gridLines.length - 1]
  const maxVal = Math.max(maxData * 1.2, maxGrid * 1.1)
  const chartH = 144 // h-36 = 9rem = 144px

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
      {/* チャート本体: SVG で描画 */}
      <svg width="100%" height={chartH} className="block">
        {/* 目盛の横線 */}
        {gridLines.map((line) => {
          const y = chartH - (line / maxVal) * chartH
          if (y < chartH * 0.05) return null
          return (
            <g key={line}>
              <line x1="0" y1={y} x2="100%" y2={y} stroke="#374151" strokeOpacity={0.5} strokeWidth={1} />
              <text x="100%" y={y - 3} textAnchor="end" fill="#4B5563" fontSize={9}>{gridLabel(line)}</text>
            </g>
          )
        })}
        {/* 棒 */}
        {data.map((d, i) => {
          const barH = maxVal > 0 ? Math.max((d.minutes / maxVal) * chartH, d.minutes > 0 ? 3 : 0) : 0
          const count = data.length
          const barW = tab === '週' ? 12 : tab === '年' ? `${60 / count}%` : `${(100 / count) - 0.3}%`
          const x = `${((i + 0.5) / count) * 100}%`
          return (
            <rect
              key={i}
              x={x}
              y={chartH - barH}
              width={barW}
              height={barH}
              fill="#c9a84c"
              rx={1}
              style={{ transform: `translateX(-50%)` }}
            />
          )
        })}
      </svg>
      {/* ラベル */}
      <div className="flex mt-1 overflow-hidden">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center min-w-0">
            <span className={`text-gray-500 leading-tight block truncate ${tab === '月' ? 'text-[7px]' : 'text-[9px]'}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>('週')
  const [offset, setOffset] = useState(0)
  const [records, setRecords] = useState<StudyRecord[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [editData, setEditData] = useState({ category: '', subcategory: '', minutes: '', date: '', note: '' })

  const load = () => {
    const { from, to } = getDateRange(tab, offset)
    api<StudyRecord[]>(`/api/records?date_from=${from}&date_to=${to}`).then(setRecords).catch(console.error)
  }

  useEffect(() => { load() }, [tab, offset])

  const switchTab = (t: Tab) => {
    setTab(t)
    setOffset(0)
  }

  const { label: periodLabel } = getDateRange(tab, offset)
  const isCurrentPeriod = offset === 0

  const startEdit = (r: StudyRecord) => {
    setEditId(r.id)
    setEditData({
      category: r.category,
      subcategory: r.subcategory,
      minutes: String(r.minutes),
      date: r.date,
      note: r.note || '',
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    const mins = parseInt(editData.minutes)
    if (!mins || mins <= 0) return
    try {
      await api(`/api/records/${editId}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: editData.date,
          category: editData.category,
          subcategory: editData.subcategory,
          minutes: mins,
          note: editData.note || null,
        }),
      })
      setEditId(null)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  const deleteRecord = async (id: number) => {
    if (!confirm('この記録を削除しますか？')) return
    try {
      await api(`/api/records/${id}`, { method: 'DELETE' })
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  const totalMinutes = records.reduce((sum, r) => sum + r.minutes, 0)
  const chartData = buildChartData(tab, offset, records)

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-[#c9a84c] mb-4">学習履歴</h1>

      {/* タブ */}
      <div className="flex gap-2 mb-3">
        {(['週', '月', '年'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border ${
              tab === t
                ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]'
                : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500 self-center">
          合計 {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
        </span>
      </div>

      {/* 期間ナビ */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOffset(offset - 1)} className="text-gray-400 p-1">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm text-gray-300 font-medium">{periodLabel}</span>
        <button
          onClick={() => !isCurrentPeriod && setOffset(offset + 1)}
          className={`p-1 ${isCurrentPeriod ? 'text-gray-700' : 'text-gray-400'}`}
          disabled={isCurrentPeriod}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 棒グラフ */}
      {chartData.length > 0 && <BarChart data={chartData} tab={tab} />}

      {/* 記録一覧 */}
      {records.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
          <p className="text-gray-500">この期間の学習記録はありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              {editId === r.id ? (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={editData.date}
                    onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2">
                    {Object.keys(CATEGORIES).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setEditData({ ...editData, category: cat, subcategory: CATEGORIES[cat][0] })}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border ${
                          editData.category === cat
                            ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]'
                            : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(CATEGORIES[editData.category] || []).map((sub: string) => (
                      <button
                        key={sub}
                        onClick={() => setEditData({ ...editData, subcategory: sub })}
                        className={`px-2 py-1 rounded-full text-xs border ${
                          editData.subcategory === sub
                            ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]'
                            : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={editData.minutes}
                    onChange={(e) => setEditData({ ...editData, minutes: e.target.value })}
                    placeholder="分"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="text-gray-400 p-1"><X size={16} /></button>
                    <button onClick={saveEdit} className="text-[#c9a84c] p-1"><Check size={16} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">{r.date}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.category === '基礎' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300'
                      }`}>
                        {r.category}
                      </span>
                      <span className="text-xs text-gray-400">{r.subcategory}</span>
                    </div>
                    <p className="font-bold">{r.minutes}分</p>
                    {r.note && <p className="text-xs text-gray-500 mt-1">{r.note}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(r)} className="text-gray-500 p-1"><Pencil size={14} /></button>
                    <button onClick={() => deleteRecord(r.id)} className="text-gray-500 p-1"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
