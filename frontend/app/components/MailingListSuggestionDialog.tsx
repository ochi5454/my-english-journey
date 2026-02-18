'use client'

import { useState, useEffect } from 'react'
import { X, Send, Plus, Users, Check, ChevronDown } from 'lucide-react'
import { API_BASE } from '../constants/excel'

interface Recipient {
  email: string
  name?: string
  department?: string
}

interface RecipientList {
  id: number
  name: string
  member_count: number
}

interface MailingListSuggestionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (addedToList: boolean) => void
  recipients: {
    to: Recipient[]
    cc: Recipient[]
    bcc: Recipient[]
  }
}

export function MailingListSuggestionDialog({
  isOpen,
  onClose,
  onConfirm,
  recipients,
}: MailingListSuggestionDialogProps) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [mailingLists, setMailingLists] = useState<RecipientList[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [newListName, setNewListName] = useState('')
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showListDropdown, setShowListDropdown] = useState(false)

  // Get all recipients
  const allRecipients = [
    ...recipients.to.map(r => ({ ...r, field: 'To' })),
    ...recipients.cc.map(r => ({ ...r, field: 'Cc' })),
    ...recipients.bcc.map(r => ({ ...r, field: 'Bcc' })),
  ]

  // Fetch mailing lists
  useEffect(() => {
    if (isOpen) {
      fetchMailingLists()
      // Select all by default
      setSelectedEmails(new Set(allRecipients.map(r => r.email)))
    }
  }, [isOpen])

  const fetchMailingLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/recipients/lists`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setMailingLists(data)
      }
    } catch (e) {
      console.error('Failed to fetch mailing lists:', e)
    }
  }

  const toggleEmail = (email: string) => {
    const newSet = new Set(selectedEmails)
    if (newSet.has(email)) {
      newSet.delete(email)
    } else {
      newSet.add(email)
    }
    setSelectedEmails(newSet)
  }

  const toggleAll = () => {
    if (selectedEmails.size === allRecipients.length) {
      setSelectedEmails(new Set())
    } else {
      setSelectedEmails(new Set(allRecipients.map(r => r.email)))
    }
  }

  const handleAddToListAndSend = async () => {
    if (selectedEmails.size === 0) {
      onConfirm(false)
      return
    }

    setLoading(true)
    try {
      const membersToAdd = allRecipients
        .filter(r => selectedEmails.has(r.email))
        .map(r => ({
          email: r.email,
          name: r.name || undefined,
          department: r.department || undefined,
        }))

      if (showNewListInput && newListName.trim()) {
        // Create new list with members
        const res = await fetch(`${API_BASE}/recipients/lists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: newListName.trim(),
            members: membersToAdd,
          }),
        })
        if (!res.ok) {
          throw new Error('Failed to create list')
        }
      } else if (selectedListId) {
        // Add to existing list
        const res = await fetch(`${API_BASE}/recipients/lists/${selectedListId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ members: membersToAdd }),
        })
        if (!res.ok) {
          throw new Error('Failed to add members')
        }
      }

      onConfirm(true)
    } catch (e) {
      console.error('Failed to add to mailing list:', e)
      // Still proceed with sending even if adding failed
      onConfirm(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSendWithoutAdding = () => {
    onConfirm(false)
  }

  if (!isOpen) return null

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`${glassCard} rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col`}>
        {/* Header - Light Cyan */}
        <div className="flex items-center justify-between p-4 border-b border-cyan-400/20 bg-cyan-500/10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">メーリングリストに追加</h2>
              <p className="text-sm text-cyan-300/70">この宛先を頻繁に使う場合は便利です</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Info Banner */}
          <div className="p-3 bg-cyan-500/10 border border-cyan-400/20 rounded-xl">
            <p className="text-sm text-cyan-200">
              選択した宛先をメーリングリストに登録すると、次回から簡単に追加できます。
            </p>
          </div>

          {/* Select List or Create New */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-300">登録先を選択</div>

            {/* List Selection Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowListDropdown(!showListDropdown)}
                className="w-full flex items-center justify-between p-3 bg-slate-900/50 border border-cyan-400/20 rounded-xl text-white hover:border-cyan-400/40 transition-colors"
              >
                <span className={selectedListId || showNewListInput ? 'text-white' : 'text-slate-400'}>
                  {showNewListInput
                    ? '新規リストを作成'
                    : selectedListId
                    ? mailingLists.find(l => l.id === selectedListId)?.name
                    : 'リストを選択...'}
                </span>
                <ChevronDown size={18} className={`text-slate-400 transition-transform ${showListDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showListDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-xl border border-cyan-400/20 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                  {/* New List Option */}
                  <button
                    onClick={() => {
                      setShowNewListInput(true)
                      setSelectedListId(null)
                      setShowListDropdown(false)
                    }}
                    className="w-full flex items-center gap-2 p-3 text-left text-cyan-300 hover:bg-cyan-500/10 transition-colors border-b border-white/5"
                  >
                    <Plus size={16} />
                    新規リストを作成
                  </button>

                  {/* Existing Lists */}
                  {mailingLists.map(list => (
                    <button
                      key={list.id}
                      onClick={() => {
                        setSelectedListId(list.id)
                        setShowNewListInput(false)
                        setShowListDropdown(false)
                      }}
                      className={`w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors ${
                        selectedListId === list.id ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <span className="text-white">{list.name}</span>
                      <span className="text-xs text-slate-400">{list.member_count}名</span>
                    </button>
                  ))}

                  {mailingLists.length === 0 && (
                    <div className="p-3 text-center text-slate-500 text-sm">
                      リストがありません
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* New List Name Input */}
            {showNewListInput && (
              <input
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="新しいリスト名を入力..."
                className="w-full p-3 bg-slate-900/50 border border-cyan-400/20 rounded-xl text-white placeholder-slate-500 focus:border-cyan-400/50 outline-none transition-colors"
              />
            )}
          </div>

          {/* Recipients List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-300">
                登録する宛先を選択 ({selectedEmails.size}/{allRecipients.length})
              </div>
              <button
                onClick={toggleAll}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {selectedEmails.size === allRecipients.length ? '全て解除' : '全て選択'}
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {allRecipients.map((recipient, index) => (
                <label
                  key={`${recipient.email}-${index}`}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedEmails.has(recipient.email)
                      ? 'bg-cyan-500/10 border border-cyan-400/30'
                      : 'bg-slate-900/30 border border-white/5 hover:border-white/10'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedEmails.has(recipient.email)
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white/10 border border-white/20'
                    }`}
                  >
                    {selectedEmails.has(recipient.email) && <Check size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {recipient.name || recipient.email}
                    </div>
                    {recipient.name && (
                      <div className="text-xs text-slate-400 truncate">{recipient.email}</div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    recipient.field === 'To'
                      ? 'bg-blue-500/20 text-blue-300'
                      : recipient.field === 'Cc'
                      ? 'bg-teal-500/20 text-teal-300'
                      : 'bg-slate-500/20 text-slate-300'
                  }`}>
                    {recipient.field}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handleSendWithoutAdding}
              disabled={loading}
              className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              登録せず送信
            </button>
            <button
              onClick={handleAddToListAndSend}
              disabled={loading || (selectedEmails.size > 0 && !selectedListId && (!showNewListInput || !newListName.trim()))}
              className="flex-1 py-3 bg-cyan-500/30 backdrop-blur-sm border border-cyan-400/30 rounded-xl text-white font-medium hover:bg-cyan-400/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  登録して送信
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
