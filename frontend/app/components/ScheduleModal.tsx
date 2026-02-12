'use client'

import { useState } from 'react'
import { X, Calendar, Clock } from 'lucide-react'

interface ScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onSchedule: (scheduledAt: Date, timezone: string) => void
}

export function ScheduleModal({ isOpen, onClose, onSchedule }: ScheduleModalProps) {
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('09')
  const [minute, setMinute] = useState('00')
  const timezone = 'Asia/Tokyo'

  if (!isOpen) return null

  // クイック選択オプション
  const getQuickDate = (offset: string): Date => {
    const now = new Date()
    switch (offset) {
      case 'tomorrow':
        now.setDate(now.getDate() + 1)
        return now
      case 'dayAfter':
        now.setDate(now.getDate() + 2)
        return now
      case 'nextMonday': {
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7
        now.setDate(now.getDate() + daysUntilMonday)
        return now
      }
      case '1hour':
        now.setHours(now.getHours() + 1)
        return now
      default:
        return now
    }
  }

  const handleQuickSelect = (offset: string) => {
    const quickDate = getQuickDate(offset)
    setDate(quickDate.toISOString().split('T')[0])
    if (offset === '1hour') {
      setHour(String(quickDate.getHours()).padStart(2, '0'))
      setMinute(String(Math.floor(quickDate.getMinutes() / 15) * 15).padStart(2, '0'))
    } else {
      setHour('09')
      setMinute('00')
    }
  }

  const handleSubmit = () => {
    if (!date) return
    const scheduledAt = new Date(`${date}T${hour}:${minute}:00`)
    onSchedule(scheduledAt, timezone)
    onClose()
  }

  // 今日の日付を取得（最小値として使用）
  const today = new Date().toISOString().split('T')[0]

  const glassCardStatic = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${glassCardStatic} rounded-2xl w-full max-w-md overflow-hidden shadow-2xl`}>
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-white">送信予約</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-5 space-y-5">
          {/* 日付選択 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={today}
              className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white focus:border-purple-400/50 outline-none transition-colors"
            />
          </div>

          {/* 時刻選択 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">時刻</label>
            <div className="flex items-center gap-2">
              <select
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white focus:border-purple-400/50 outline-none transition-colors"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, '0')} className="bg-slate-900">
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="text-white text-xl">:</span>
              <select
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white focus:border-purple-400/50 outline-none transition-colors"
              >
                {['00', '15', '30', '45'].map(m => (
                  <option key={m} value={m} className="bg-slate-900">{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* クイック選択 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 flex items-center gap-1">
              <Clock size={14} />
              クイック選択
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'tomorrow', label: '明日 9:00' },
                { key: 'dayAfter', label: '明後日 9:00' },
                { key: 'nextMonday', label: '来週月曜 9:00' },
                { key: '1hour', label: '1時間後' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleQuickSelect(opt.key)}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 選択中の日時表示 */}
          {date && (
            <div className="p-3 bg-purple-500/10 border border-purple-400/20 rounded-xl">
              <div className="text-sm text-purple-300 flex items-center gap-2">
                <Calendar size={16} />
                <span>
                  {new Date(`${date}T${hour}:${minute}:00`).toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  に送信予定
                </span>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!date}
            className="px-4 py-2 bg-purple-500/80 hover:bg-purple-400/80 border border-purple-400/30 rounded-xl text-white font-medium disabled:opacity-30 transition-colors"
          >
            予約送信を設定
          </button>
        </div>
      </div>
    </div>
  )
}
