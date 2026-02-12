'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, ChevronDown, Clock } from 'lucide-react'

interface SendButtonProps {
  onSendNow: () => void
  onSchedule: () => void
  sending: boolean
  disabled: boolean
}

export function SendButton({ onSendNow, onSchedule, sending, disabled }: SendButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 外部クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex">
        {/* メイン送信ボタン */}
        <button
          onClick={onSendNow}
          disabled={sending || disabled}
          className="flex items-center gap-2 px-6 py-3 bg-blue-500/80 backdrop-blur-sm border border-blue-400/30 rounded-l-2xl text-white font-medium hover:bg-blue-400/80 disabled:opacity-30 transition-all"
        >
          <Send size={18} />
          {sending ? '送信中...' : '送信'}
        </button>

        {/* ドロップダウントグル */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={sending || disabled}
          className="px-2 py-3 bg-blue-500/80 backdrop-blur-sm border border-l-0 border-blue-400/30 rounded-r-2xl text-white hover:bg-blue-400/80 disabled:opacity-30 transition-all"
        >
          <ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-56 backdrop-blur-xl bg-slate-900/95 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          <button
            onClick={() => { onSendNow(); setIsOpen(false) }}
            className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
          >
            <Send size={16} className="text-blue-400" />
            今すぐ送信
          </button>
          <button
            onClick={() => { onSchedule(); setIsOpen(false) }}
            className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 flex items-center gap-3 border-t border-white/5 transition-colors"
          >
            <Clock size={16} className="text-purple-400" />
            送信日時を指定...
          </button>
        </div>
      )}
    </div>
  )
}
