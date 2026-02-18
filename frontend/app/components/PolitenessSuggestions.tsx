'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../constants/excel'
import { Sparkles, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

interface Suggestion {
  original: string
  suggested: string
  position: { start: number; end: number }
  reason: string
  level: string
}

interface PolitenessSuggestionsProps {
  text: string
  tone: 'formal' | 'polite' | 'casual'
  onApply: (original: string, suggested: string) => void
  className?: string
}

export function PolitenessSuggestions({
  text,
  tone,
  onApply,
  className = '',
}: PolitenessSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set())

  // デバウンス付きでサジェスチョンを取得
  const fetchSuggestions = useCallback(async () => {
    if (!text.trim() || tone === 'casual') {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/mail/suggest-polite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text, tone }),
      })

      if (res.ok) {
        const data = await res.json()
        // 既に適用済みのものは除外
        const filtered = data.suggestions.filter(
          (s: Suggestion) => !appliedSuggestions.has(`${s.original}-${s.suggested}`)
        )
        setSuggestions(filtered)
      }
    } catch (e) {
      console.error('Failed to fetch suggestions:', e)
    } finally {
      setLoading(false)
    }
  }, [text, tone, appliedSuggestions])

  // テキストが変わったらデバウンスしてチェック
  useEffect(() => {
    const timer = setTimeout(fetchSuggestions, 1000)
    return () => clearTimeout(timer)
  }, [fetchSuggestions])

  // サジェスチョンを適用
  const handleApply = (suggestion: Suggestion) => {
    onApply(suggestion.original, suggestion.suggested)
    setAppliedSuggestions(prev => new Set(prev).add(`${suggestion.original}-${suggestion.suggested}`))
    setSuggestions(prev => prev.filter(s => s.original !== suggestion.original))
  }

  // サジェスチョンを無視
  const handleIgnore = (suggestion: Suggestion) => {
    setAppliedSuggestions(prev => new Set(prev).add(`${suggestion.original}-${suggestion.suggested}`))
    setSuggestions(prev => prev.filter(s => s.original !== suggestion.original))
  }

  // casualモードまたはサジェスチョンがない場合は表示しない
  if (tone === 'casual' || (suggestions.length === 0 && !loading)) {
    return null
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-amber-500/10 border border-amber-400/20 rounded-t-xl text-amber-300 text-xs font-medium hover:bg-amber-500/15 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={12} />
          <span>丁寧語サジェスチョン</span>
          {suggestions.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-500/30 rounded text-[10px]">
              {suggestions.length}件
            </span>
          )}
        </div>
        {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border border-t-0 border-amber-400/20 rounded-b-xl overflow-hidden">
          {loading ? (
            <div className="p-3 text-center text-slate-500 text-xs">
              チェック中...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-center text-slate-500 text-xs">
              提案はありません
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-300 line-through">{suggestion.original}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-300">{suggestion.suggested}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {suggestion.reason}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleApply(suggestion)}
                        className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded transition-colors"
                        title="適用"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => handleIgnore(suggestion)}
                        className="p-1 text-slate-500 hover:text-slate-300 hover:bg-white/10 rounded transition-colors"
                        title="無視"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
