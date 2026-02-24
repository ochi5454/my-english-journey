'use client'

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { X, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'

// Types
export interface Recipient {
  email: string
  name?: string
  department?: string
  score?: number
  source?: string
  // 検証ステータス
  isExternal?: boolean      // 社外アドレス
  isVerified?: boolean      // Entra検証済み
  validationError?: string  // 検証エラーメッセージ
}

export interface ValidationResult {
  isExternal: boolean
  isVerified: boolean
  error?: string
}

interface RecipientInputProps {
  label: 'To' | 'Cc' | 'Bcc'
  value: Recipient[]
  onChange: React.Dispatch<React.SetStateAction<Recipient[]>>
  onSearch: (query: string) => Promise<Recipient[]>
  onOpenList?: () => void
  onDrop?: (recipient: Recipient, fromField: string) => void  // ドロップ時のコールバック
  onValidateRecipient?: (email: string) => Promise<ValidationResult>  // 宛先追加時の検証
  userDomain?: string  // ログインユーザーのドメイン（@以降）。これと異なれば社外扱い
  placeholder?: string
  className?: string
}

// Color schemes for different fields
const colorSchemes = {
  To: {
    chip: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
    chipButton: 'text-blue-400 hover:text-white',
  },
  Cc: {
    chip: 'bg-teal-500/20 text-teal-300 border-teal-400/30',
    chipButton: 'text-teal-400 hover:text-white',
  },
  Bcc: {
    chip: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
    chipButton: 'text-slate-400 hover:text-white',
  },
}

export function RecipientInput({
  label,
  value,
  onChange,
  onSearch,
  onOpenList,
  onDrop,
  onValidateRecipient,
  userDomain = '',
  placeholder = '',
  className = '',
}: RecipientInputProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Recipient[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const colors = colorSchemes[label]

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (e: React.DragEvent, recipient: Recipient) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ recipient, fromField: label }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDropOnField = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const { recipient, fromField } = data as { recipient: Recipient; fromField: string }
      if (fromField !== label && onDrop) {
        // 別のフィールドからドロップされた場合
        onDrop(recipient, fromField)
      }
    } catch (err) {
      console.error('Drop failed:', err)
    }
  }

  // Search with debounce
  useEffect(() => {
    if (search.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const searchResults = await onSearch(search)
        // Filter out already selected
        const existingEmails = new Set(value.map(r => r.email))
        const filtered = searchResults.filter(r => !existingEmails.has(r.email))
        setResults(filtered)
        setIsOpen(filtered.length > 0)
        setSelectedIndex(-1)
      } catch (e) {
        console.error('Search failed:', e)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, onSearch, value])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [selectedIndex])

  // ドメインが社内かどうかチェック（ログインユーザーのドメインと比較）
  const isInternalDomain = useCallback((email: string): boolean => {
    if (!userDomain) return true // ドメインが指定されていない場合は社内扱い
    const domain = email.split('@')[1]?.toLowerCase()
    return domain === userDomain.toLowerCase()
  }, [userDomain])

  const addRecipient = useCallback(async (recipient: Recipient) => {
    if (value.find(r => r.email === recipient.email)) {
      setSearch('')
      setResults([])
      setIsOpen(false)
      setSelectedIndex(-1)
      inputRef.current?.focus()
      return
    }

    // 社外チェック（クライアントサイド即座に判定）
    const isExternal = !isInternalDomain(recipient.email)

    // 検証付きで追加
    const validatedRecipient: Recipient = {
      ...recipient,
      isExternal,
      isVerified: undefined, // 検証中
    }

    onChange([...value, validatedRecipient])
    setSearch('')
    setResults([])
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()

    // Entra検証を非同期で実行
    if (onValidateRecipient) {
      const emailToValidate = recipient.email
      try {
        const result = await onValidateRecipient(emailToValidate)
        // 検証結果を反映
        onChange(prev => prev.map(r =>
          r.email === emailToValidate
            ? { ...r, isVerified: result.isVerified, isExternal: result.isExternal, validationError: result.error }
            : r
        ))
      } catch {
        console.error('Validation failed')
        // エラー時は検証失敗として記録
        onChange(prev => prev.map(r =>
          r.email === emailToValidate
            ? { ...r, isVerified: false, validationError: '検証に失敗しました' }
            : r
        ))
      }
    }
  }, [onChange, isInternalDomain, onValidateRecipient])

  const removeRecipient = useCallback((email: string) => {
    onChange(value.filter(r => r.email !== email))
  }, [value, onChange])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // If dropdown is open, handle navigation
    if (isOpen && results.length > 0) {
      const cols = 2 // 2列表示
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => {
            const next = prev + cols
            return next < results.length ? next : prev % cols
          })
          return
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => {
            const next = prev - cols
            if (next >= 0) return next
            // 最後の行の同じ列へ移動
            const col = prev < 0 ? 0 : prev % cols
            const lastRowStart = Math.floor((results.length - 1) / cols) * cols
            return Math.min(lastRowStart + col, results.length - 1)
          })
          return
        case 'ArrowRight':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < results.length - 1 ? prev + 1 : 0
          )
          return
        case 'ArrowLeft':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : results.length - 1
          )
          return
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            addRecipient(results[selectedIndex])
          } else if (search.includes('@')) {
            // Add as manual email
            addRecipient({ email: search })
          }
          return
        case 'Tab':
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            e.preventDefault()
            addRecipient(results[selectedIndex])
          }
          return
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setSelectedIndex(-1)
          return
      }
    } else {
      // Dropdown closed
      switch (e.key) {
        case 'Enter':
          if (search.includes('@')) {
            e.preventDefault()
            addRecipient({ email: search })
          }
          return
        case 'Backspace':
          if (search === '' && value.length > 0) {
            // Remove last recipient
            removeRecipient(value[value.length - 1].email)
          }
          return
      }
    }
  }, [isOpen, results, selectedIndex, search, value, addRecipient, removeRecipient])

  const handleInputFocus = () => {
    if (results.length > 0) {
      setIsOpen(true)
    }
  }

  const handleInputBlur = () => {
    // Delay to allow click on result
    setTimeout(() => {
      // Only close if focus moved outside the component
      if (!listRef.current?.contains(document.activeElement)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }, 150)
  }

  // Score badge color
  const getScoreBadgeClass = (score: number) => {
    if (score >= 0.8) return 'bg-emerald-500/20 text-emerald-300'
    if (score >= 0.5) return 'bg-blue-500/20 text-blue-300'
    return 'bg-slate-500/20 text-slate-400'
  }

  return (
    <div className={`relative ${className}`}>
      {/* Input Row - ドロップターゲット */}
      <div
        className={`flex items-center px-4 py-3 transition-colors ${isDragOver ? 'bg-blue-500/10 ring-1 ring-blue-400/30' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnField}
      >
        <span className="text-slate-400 text-sm w-12">{label}:</span>
        <div className="flex-1 flex flex-col gap-1">
          {/* カテゴリ別に宛先を分類 */}
          {(() => {
            const external = value.filter(r => r.isExternal === true)
            const unverified = value.filter(r => r.isExternal !== true && r.isVerified === false)
            const verified = value.filter(r => r.isExternal !== true && r.isVerified === true)
            const pending = value.filter(r => r.isExternal !== true && r.isVerified === undefined)

            const renderChip = (r: Recipient) => {
              const isExternal = r.isExternal === true
              const isUnverified = r.isVerified === false
              const chipClass = isExternal
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                : isUnverified
                ? 'bg-red-500/20 text-red-300 border-red-400/30'
                : r.isVerified === true
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                : colors.chip

              const tooltipLines = [
                r.name || '',
                r.email,
                r.department || '',
                '',
                isExternal ? '⚠️ 社外アドレス' : '',
                isUnverified ? '❌ Entra未登録' : '',
                r.isVerified === true ? '✅ Entra確認済み' : '',
                r.validationError ? `⚠️ ${r.validationError}` : '',
                '',
                '💡 ドラッグして他のフィールドへ移動'
              ].filter(Boolean)

              return (
                <span
                  key={r.email}
                  draggable
                  onDragStart={(e) => handleDragStart(e, r)}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 ${chipClass} rounded-full text-xs border backdrop-blur-sm group cursor-grab active:cursor-grabbing`}
                  title={tooltipLines.join('\n')}
                >
                  {isExternal && <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />}
                  {isUnverified && !isExternal && <ShieldAlert size={11} className="text-red-400 flex-shrink-0" />}
                  {r.isVerified === true && !isExternal && <ShieldCheck size={11} className="text-emerald-400 flex-shrink-0" />}
                  <span className="truncate max-w-[120px]">{r.name || r.email}</span>
                  <button
                    onClick={() => removeRecipient(r.email)}
                    className={`${isExternal ? 'text-amber-400' : isUnverified ? 'text-red-400' : r.isVerified === true ? 'text-emerald-400' : colors.chipButton} ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity hover:text-white`}
                    aria-label={`${r.name || r.email}を削除`}
                  >
                    <X size={12} />
                  </button>
                </span>
              )
            }

            return (
              <>
                {/* 社外アドレス */}
                {external.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1 mr-1">
                      <AlertTriangle size={10} />社外
                    </span>
                    {external.map(renderChip)}
                  </div>
                )}
                {/* Entra未登録 */}
                {unverified.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-red-400 font-medium flex items-center gap-1 mr-1">
                      <ShieldAlert size={10} />未登録
                    </span>
                    {unverified.map(renderChip)}
                  </div>
                )}
                {/* Entra確認済み */}
                {verified.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mr-1">
                      <ShieldCheck size={10} />確認済
                    </span>
                    {verified.map(renderChip)}
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pending.map(renderChip)}
                  </div>
                )}
              </>
            )
          })()}

          {/* Search Input */}
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={value.length === 0 ? (placeholder || '宛先を追加...') : ''}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-white placeholder-slate-500"
            aria-label={`${label}宛先を入力`}
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={`${label}-suggestions`}
            role="combobox"
          />
        </div>

        {/* List Button */}
        {onOpenList && (
          <button
            onClick={onOpenList}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 hover:bg-blue-500/10 rounded-lg whitespace-nowrap"
            aria-label="メーリングリストから追加"
          >
            📋 リスト
          </button>
        )}
      </div>

      {/* Dropdown Results - 画面最上部に表示 */}
      {isOpen && results.length > 0 && (
        <div
          ref={listRef}
          id={`${label}-suggestions`}
          role="listbox"
          className="fixed z-[200] bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 overflow-hidden"
          style={{
            width: 'min(700px, 90vw)',
            left: '50%',
            transform: 'translateX(-50%)',
            top: '16px'
          }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white">🔍 候補</span>
              <span className="text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded-full">{results.length}件</span>
            </div>
            <button
              onClick={() => { setIsOpen(false); setSelectedIndex(-1) }}
              className="text-slate-400 hover:text-white transition-colors p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* Results List - 2 Column Grid */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            <div className="grid grid-cols-2 gap-1">
              {results.map((r, index) => (
                <button
                  key={r.email}
                  ref={el => { itemRefs.current[index] = el }}
                  onClick={() => addRecipient(r)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="option"
                  aria-selected={selectedIndex === index}
                  className={`text-left px-3 py-2 text-xs transition-all flex items-center gap-2 rounded-lg ${
                    selectedIndex === index
                      ? 'bg-blue-500/20 ring-1 ring-blue-400/50'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate font-medium">{r.name || r.email}</div>
                    <div className="text-[10px] text-slate-500 truncate">{r.email}</div>
                  </div>
                  {r.score !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${getScoreBadgeClass(r.score)}`}>
                      {Math.round(r.score * 100)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Searching Indicator */}
      {searching && (
        <div className="absolute right-14 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
