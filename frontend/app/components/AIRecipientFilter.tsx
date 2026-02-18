'use client'

import { useState, useRef, useEffect } from 'react'
import { API_BASE } from '../constants/excel'
import { CheckCircle, XCircle, Sparkles, Loader2, X } from 'lucide-react'

interface FilteredMember {
  id: number
  email: string
  name?: string
  department?: string
  position?: string
  employee_id?: string
  selected: boolean
  reason: string
}

interface FilterResult {
  selected_members: FilteredMember[]
  excluded_members: FilteredMember[]
  summary: string
  selected_count: number
  excluded_count: number
  total_count: number
}

interface AIRecipientFilterProps {
  listId: number
  onFilterComplete: (selectedMembers: FilteredMember[]) => void
  onCancel: () => void
}

export function AIRecipientFilter({ listId, onFilterComplete, onCancel }: AIRecipientFilterProps) {
  const [instruction, setInstruction] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<FilterResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // チェック状態を管理（初期値はAIの判定結果）
  const [checkedMembers, setCheckedMembers] = useState<Set<number>>(new Set())

  // Teams風UI改善: IME変換中フラグ
  const [isComposing, setIsComposing] = useState(false)

  // 自動スクロール用のref
  const resultAreaRef = useRef<HTMLDivElement>(null)

  // 結果が更新されたら自動スクロール
  useEffect(() => {
    if (result && resultAreaRef.current) {
      resultAreaRef.current.scrollTop = 0 // 結果が出たら先頭にスクロール
    }
  }, [result])

  const handleFilter = async () => {
    if (!instruction.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(`${API_BASE}/recipients/lists/${listId}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ instruction }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || 'フィルタリングに失敗しました')
      }

      const data: FilterResult = await response.json()
      setResult(data)
      // 選択されたメンバーのIDをチェック状態にセット
      setCheckedMembers(new Set(data.selected_members.map(m => m.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'フィルタリングに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMember = (memberId: number) => {
    setCheckedMembers(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
  }

  const handleConfirm = () => {
    if (!result) return
    // チェックされているメンバーのみを返す
    const allMembers = [...result.selected_members, ...result.excluded_members]
    const selectedMembers = allMembers.filter(m => checkedMembers.has(m.id))
    onFilterComplete(selectedMembers)
  }

  const checkedCount = checkedMembers.size
  const totalCount = result ? result.total_count : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-blue-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-300">
            <Sparkles size={16} />
            <span className="font-medium text-sm">AIで絞り込み</span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Results Area - スクロール可能な履歴エリア */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-400/20 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Summary */}
            <div className="px-4 py-3 bg-slate-900/30 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">
                  {totalCount}名中 <span className="text-emerald-300 font-medium">{checkedCount}名</span> を選択中
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // 全選択
                      const allIds = [...result.selected_members, ...result.excluded_members].map(m => m.id)
                      setCheckedMembers(new Set(allIds))
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    全選択
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => setCheckedMembers(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    全解除
                  </button>
                </div>
              </div>
              <div className="text-xs text-blue-400 mt-1">
                {result.summary}
              </div>
            </div>

            {/* Member List - 履歴エリアのみスクロール */}
            <div ref={resultAreaRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Warning when all excluded */}
              {result.selected_members.length === 0 && result.excluded_members.length > 0 && (
                <div className="mb-3 p-3 bg-amber-500/10 border border-amber-400/20 rounded-xl">
                  <div className="text-amber-300 text-sm font-medium mb-1">
                    条件に一致するメンバーがいません
                  </div>
                  <div className="text-amber-400/70 text-xs">
                    下のリストから手動でチェックを入れて選択することもできます
                  </div>
                </div>
              )}

              {/* Selected by AI */}
              {result.selected_members.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-emerald-400 mb-2 font-medium flex items-center gap-1">
                    <CheckCircle size={12} />
                    AIが選択（{result.selected_members.length}名）
                  </div>
                  <div className="space-y-1.5">
                    {result.selected_members.map((member) => (
                      <label
                        key={member.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${
                          checkedMembers.has(member.id)
                            ? 'bg-emerald-500/10 border border-emerald-400/20'
                            : 'bg-white/5 border border-white/5 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checkedMembers.has(member.id)}
                          onChange={() => toggleMember(member.id)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">
                            {member.name || member.email}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2">
                            {member.department && <span>{member.department}</span>}
                            {member.position && <span className="text-slate-500">/ {member.position}</span>}
                          </div>
                        </div>
                        <div className="text-xs text-emerald-400 flex-shrink-0">
                          {member.reason}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Excluded by AI */}
              {result.excluded_members.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-medium flex items-center gap-1">
                    <XCircle size={12} />
                    AIが除外（{result.excluded_members.length}名）
                  </div>
                  <div className="space-y-1.5">
                    {result.excluded_members.map((member) => (
                      <label
                        key={member.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${
                          checkedMembers.has(member.id)
                            ? 'bg-blue-500/10 border border-blue-400/20'
                            : 'bg-white/5 border border-white/5 opacity-40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checkedMembers.has(member.id)}
                          onChange={() => toggleMember(member.id)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm truncate ${checkedMembers.has(member.id) ? 'text-white' : 'text-slate-400 line-through'}`}>
                            {member.name || member.email}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            {member.department && <span>{member.department}</span>}
                            {member.position && <span>/ {member.position}</span>}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 flex-shrink-0">
                          {member.reason}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Button */}
            <div className="p-4 border-t border-white/10 flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={checkedCount === 0}
                className="flex-1 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-xl text-emerald-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} />
                {checkedCount}名を宛先に追加
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 font-medium hover:bg-white/10 transition-colors"
              >
                戻る
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !error && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                <Sparkles size={24} className="text-blue-400" />
              </div>
              <p className="text-slate-400 text-sm mb-2">
                自然言語でメンバーを絞り込み
              </p>
              <p className="text-slate-600 text-xs">
                例：「営業部の人」「課長以上」「山田さんを除いて」
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">
                AIが絞り込み中...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input Area - 下部固定 */}
      <div className="p-4 border-t border-white/10 bg-slate-900/50">
        <div className="flex gap-2 items-end">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(e) => {
              // IME変換中は送信しない
              if (isComposing) return
              // Enter送信 / Shift+Enter改行
              if (e.key === 'Enter' && !e.shiftKey && instruction.trim()) {
                e.preventDefault()
                handleFilter()
              }
            }}
            placeholder="例：営業部の人だけ選んで"
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400/50 transition-colors resize-none min-h-[40px] max-h-[120px]"
            disabled={isLoading}
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleFilter}
            disabled={isLoading || !instruction.trim()}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-xl text-blue-300 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 h-[40px]"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              '絞り込む'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export type { FilteredMember, FilterResult }
