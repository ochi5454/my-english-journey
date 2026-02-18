'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

// Types
export interface Recipient {
  email: string
  name?: string
  department?: string
  score?: number
  source?: string
}

interface RecipientInputProps {
  label: 'To' | 'Cc' | 'Bcc'
  value: Recipient[]
  onChange: (recipients: Recipient[]) => void
  onSearch: (query: string) => Promise<Recipient[]>
  onOpenList?: () => void
  onDrop?: (recipient: Recipient, fromField: string) => void  // ドロップ時のコールバック
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

  const addRecipient = useCallback((recipient: Recipient) => {
    if (!value.find(r => r.email === recipient.email)) {
      onChange([...value, recipient])
    }
    setSearch('')
    setResults([])
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }, [value, onChange])

  const removeRecipient = useCallback((email: string) => {
    onChange(value.filter(r => r.email !== email))
  }, [value, onChange])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // If dropdown is open, handle navigation
    if (isOpen && results.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < results.length - 1 ? prev + 1 : 0
          )
          return
        case 'ArrowUp':
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

  const handleInputBlur = (e: React.FocusEvent) => {
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
        <div className="flex-1 flex flex-wrap items-center gap-2">
          {/* Selected Recipients (Chips) - ドラッグ可能 */}
          {value.map(r => (
            <span
              key={r.email}
              draggable
              onDragStart={(e) => handleDragStart(e, r)}
              className={`inline-flex items-center gap-1 px-3 py-1 ${colors.chip} rounded-full text-sm border backdrop-blur-sm group cursor-grab active:cursor-grabbing`}
              title={`${r.name || ''}\n${r.email}${r.department ? `\n${r.department}` : ''}\n\n💡 ドラッグして他のフィールドへ移動`}
            >
              <span className="truncate max-w-[150px]">{r.name || r.email}</span>
              <button
                onClick={() => removeRecipient(r.email)}
                className={`${colors.chipButton} ml-1 opacity-60 group-hover:opacity-100 transition-opacity`}
                aria-label={`${r.name || r.email}を削除`}
              >
                <X size={14} />
              </button>
            </span>
          ))}

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
            📋 メーリングリストから追加
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={listRef}
          id={`${label}-suggestions`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 border-t border-white/5 bg-slate-900/95 backdrop-blur-xl max-h-60 overflow-y-auto rounded-b-xl shadow-xl"
        >
          {/* Header */}
          <div className="px-4 py-1.5 text-xs text-slate-500 border-b border-white/5 sticky top-0 bg-slate-900/95 backdrop-blur-xl flex items-center justify-between">
            <span>検索結果（{results.length}件）</span>
            <span className="text-slate-600">↑↓で選択 / Enterで確定</span>
          </div>

          {/* Results List */}
          {results.map((r, index) => (
            <button
              key={r.email}
              ref={el => { itemRefs.current[index] = el }}
              onClick={() => addRecipient(r)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={selectedIndex === index}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                selectedIndex === index
                  ? 'bg-blue-500/20 border-l-2 border-blue-400'
                  : 'hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white truncate flex items-center gap-2">
                  {r.name || r.email}
                  {selectedIndex === index && (
                    <span className="text-xs text-blue-400">← Enter</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 truncate flex items-center gap-2">
                  <span>{r.email}</span>
                  {r.department && <span className="text-slate-500">| {r.department}</span>}
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {r.score !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${getScoreBadgeClass(r.score)}`}>
                    {Math.round(r.score * 100)}%
                  </span>
                )}
                {r.source && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    r.source === 'local' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'
                  }`}>
                    {r.source === 'local' ? '📁' : '☁️'}
                  </span>
                )}
              </div>
            </button>
          ))}
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
