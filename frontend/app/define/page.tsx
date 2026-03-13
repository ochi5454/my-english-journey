'use client'

import { useEffect, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { api } from '../lib/api'

type Definition = { id: number; key: string; content: string }

const LABELS: Record<string, { title: string; icon: string }> = {
  qualitative: { title: '定性的な定義', icon: '📌' },
  quantitative: { title: '定量的な定義', icon: '📌' },
}

export default function DefinePage() {
  const [definitions, setDefinitions] = useState<Definition[]>([])
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => api<Definition[]>('/api/definitions').then(setDefinitions).catch(console.error)
  useEffect(() => { load() }, [])

  const startEdit = (def: Definition) => {
    setEditKey(def.key)
    setEditValue(def.content)
    setMessage('')
  }

  const save = async (key: string) => {
    if (!editValue.trim()) return
    setSaving(true)
    try {
      await api(`/api/definitions/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editValue }),
      })
      setEditKey(null)
      setMessage('保存しました')
      await load()
      setTimeout(() => setMessage(''), 2000)
    } catch (e: unknown) {
      setMessage(e instanceof Error ? `エラー: ${e.message}` : 'エラーが発生しました')
    }
    setSaving(false)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-[#c9a84c] mb-2">「英語ができる」の定義</h1>
      <p className="text-xs text-gray-500 mb-4">自分にとっての「英語ができる」とは何かを定義しよう</p>

      {message && (
        <div className="bg-green-900/30 text-green-300 rounded-lg p-3 mb-4 text-sm">{message}</div>
      )}

      <div className="space-y-4">
        {definitions.map((def) => {
          const label = LABELS[def.key] || { title: def.key, icon: '' }
          return (
            <div key={def.key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-300">
                  {label.icon} {label.title}
                </p>
                {editKey !== def.key && (
                  <button onClick={() => startEdit(def)} className="text-gray-500 p-1">
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              {editKey === def.key ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-800 border border-[#c9a84c] rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end mt-2">
                    <button onClick={() => setEditKey(null)} className="text-gray-400 p-1.5">
                      <X size={16} />
                    </button>
                    <button onClick={() => save(def.key)} disabled={saving} className="text-[#c9a84c] p-1.5">
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                  {def.content}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
