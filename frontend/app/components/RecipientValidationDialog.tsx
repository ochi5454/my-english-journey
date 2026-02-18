'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Check } from 'lucide-react'

export interface ValidationWarning {
  email: string
  warning_type: 'info_mismatch' | 'not_found'
  message: string
  details?: {
    name?: { uploaded: string; current: string }
    department?: { uploaded: string; current: string }
    position?: { uploaded: string; current: string }
  }
}

interface RecipientValidationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedEmails: string[]) => void
  warnings: ValidationWarning[]
  confirmText?: string
  cancelText?: string
}

export function RecipientValidationDialog({
  isOpen,
  onClose,
  onConfirm,
  warnings,
  confirmText = '確認して追加',
  cancelText = 'キャンセル',
}: RecipientValidationDialogProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())

  // 初期状態で全て選択
  useEffect(() => {
    if (isOpen) {
      setSelectedEmails(new Set(warnings.map(w => w.email)))
    }
  }, [isOpen, warnings])

  if (!isOpen) return null

  const toggleExpand = (email: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(email)) {
      newExpanded.delete(email)
    } else {
      newExpanded.add(email)
    }
    setExpandedItems(newExpanded)
  }

  const toggleSelect = (email: string) => {
    const newSelected = new Set(selectedEmails)
    if (newSelected.has(email)) {
      newSelected.delete(email)
    } else {
      newSelected.add(email)
    }
    setSelectedEmails(newSelected)
  }

  const selectAll = () => {
    setSelectedEmails(new Set(warnings.map(w => w.email)))
  }

  const deselectAll = () => {
    setSelectedEmails(new Set())
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedEmails))
  }

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`${glassCard} rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-lg font-semibold text-white">追加する宛先を選択</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs text-slate-400">{selectedEmails.size}/{warnings.length} 件選択中</span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              全選択
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={deselectAll}
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              全解除
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {warnings.map((warning, index) => {
            const isSelected = selectedEmails.has(warning.email)
            return (
              <div
                key={`${warning.email}-${index}`}
                className={`rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-400/30'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="p-3 flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(warning.email)}
                    className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors mt-0.5 ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-400'
                        : 'bg-white/5 border-white/20 hover:border-white/40'
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{warning.email}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {warning.warning_type === 'not_found'
                        ? '社内アカウントで同一情報が確認できませんでしたが、よろしいですか？'
                        : '登録情報と現在の情報が異なる可能性があります'
                      }
                    </div>

                    {/* Details toggle for info_mismatch */}
                    {warning.details && (
                      <button
                        onClick={() => toggleExpand(warning.email)}
                        className="mt-2 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        {expandedItems.has(warning.email) ? (
                          <>
                            <ChevronUp size={12} />
                            詳細を隠す
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} />
                            詳細を見る
                          </>
                        )}
                      </button>
                    )}

                    {/* Expanded Details */}
                    {warning.details && expandedItems.has(warning.email) && (
                      <div className="mt-2 bg-black/20 rounded-lg p-3 space-y-2 text-xs">
                        {warning.details.name && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">名前:</span>
                            <span className="text-white">
                              <span className="text-red-300 line-through">{warning.details.name.uploaded}</span>
                              {' → '}
                              <span className="text-green-300">{warning.details.name.current}</span>
                            </span>
                          </div>
                        )}
                        {warning.details.department && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">部署:</span>
                            <span className="text-white">
                              <span className="text-red-300 line-through">{warning.details.department.uploaded}</span>
                              {' → '}
                              <span className="text-green-300">{warning.details.department.current}</span>
                            </span>
                          </div>
                        )}
                        {warning.details.position && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">役職:</span>
                            <span className="text-white">
                              <span className="text-red-300 line-through">{warning.details.position.uploaded}</span>
                              {' → '}
                              <span className="text-green-300">{warning.details.position.current}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={selectedEmails.size === 0}
            className="flex-1 py-3 bg-emerald-500/30 backdrop-blur-sm border border-emerald-400/30 rounded-xl text-white font-medium hover:bg-emerald-400/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle size={18} />
            {confirmText} ({selectedEmails.size}件)
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
