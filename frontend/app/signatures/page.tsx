'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import {
  ArrowLeft, Plus, Edit2, Trash2, Star, Loader, X
} from 'lucide-react'

interface Signature {
  id: number
  name: string
  content: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export default function SignaturesPage() {
  useAuth()
  const router = useRouter()

  const [signatures, setSignatures] = useState<Signature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 編集モード
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)

  // 新規作成モード
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newIsDefault, setNewIsDefault] = useState(false)

  useEffect(() => {
    fetchSignatures()
  }, [])

  const fetchSignatures = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/signatures`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSignatures(data)
      } else {
        setError('署名の取得に失敗しました')
      }
    } catch (e) {
      setError('署名の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const createSignature = async () => {
    if (!newName.trim() || !newContent.trim()) return

    try {
      const res = await fetch(`${API_BASE}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newName,
          content: newContent,
          is_default: newIsDefault,
        }),
      })

      if (res.ok) {
        setIsCreating(false)
        setNewName('')
        setNewContent('')
        setNewIsDefault(false)
        fetchSignatures()
      } else {
        setError('署名の作成に失敗しました')
      }
    } catch (e) {
      setError('署名の作成に失敗しました')
    }
  }

  const updateSignature = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/signatures/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          content: editContent,
          is_default: editIsDefault,
        }),
      })

      if (res.ok) {
        setEditingId(null)
        fetchSignatures()
      } else {
        setError('署名の更新に失敗しました')
      }
    } catch (e) {
      setError('署名の更新に失敗しました')
    }
  }

  const deleteSignature = async (id: number) => {
    if (!confirm('この署名を削除しますか？')) return

    try {
      const res = await fetch(`${API_BASE}/signatures/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        fetchSignatures()
      } else {
        setError('署名の削除に失敗しました')
      }
    } catch (e) {
      setError('署名の削除に失敗しました')
    }
  }

  const startEditing = (sig: Signature) => {
    setEditingId(sig.id)
    setEditName(sig.name)
    setEditContent(sig.content)
    setEditIsDefault(sig.is_default)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
    setEditContent('')
    setEditIsDefault(false)
  }

  const glassCardStatic = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-blue-600/15 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 bg-emerald-600/15 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">ホーム</span>
          </button>
          <h1 className="text-base font-semibold text-white absolute left-1/2 -translate-x-1/2">
            署名管理
          </h1>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-teal-500/30 hover:bg-teal-400/30 border border-teal-400/30 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            新規作成
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Page Description */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-400/20 rounded-full">
              <span className="text-base">💡</span>
              <p className="text-sm text-teal-300">デフォルト設定で自動挿入されます</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-200 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                <X size={16} />
              </button>
            </div>
          )}

          {/* 新規作成フォーム */}
          {isCreating && (
            <div className={`${glassCardStatic} rounded-xl p-5 mb-6`}>
              <h3 className="text-lg font-semibold text-white mb-4">新規署名作成</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">署名名</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例：通常、社外向け"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-purple-400/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">署名内容</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={6}
                    placeholder="---&#10;山田太郎&#10;株式会社サンプル&#10;TEL: 03-xxxx-xxxx"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-purple-400/50 outline-none resize-none font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="newIsDefault"
                    checked={newIsDefault}
                    onChange={(e) => setNewIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-slate-900/50 text-purple-500 focus:ring-purple-500"
                  />
                  <label htmlFor="newIsDefault" className="text-sm text-slate-300">
                    デフォルト署名に設定
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setNewName('')
                      setNewContent('')
                      setNewIsDefault(false)
                    }}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 font-medium transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={createSignature}
                    disabled={!newName.trim() || !newContent.trim()}
                    className="px-4 py-2 bg-purple-500/80 hover:bg-purple-400/80 border border-purple-400/30 rounded-lg text-white font-medium disabled:opacity-30 transition-colors"
                  >
                    作成
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader size={32} className="animate-spin mx-auto mb-4" />
              読み込み中...
            </div>
          ) : signatures.length === 0 && !isCreating ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✍️</div>
              <p className="text-slate-400">署名がありません</p>
              <p className="text-sm text-slate-500 mt-2">右上の「新規作成」から作成できます</p>
            </div>
          ) : (
            <div className="space-y-4">
              {signatures.map((sig) => (
                <div key={sig.id} className={`${glassCardStatic} rounded-xl overflow-hidden`}>
                  {editingId === sig.id ? (
                    // 編集モード
                    <div className="p-5">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">署名名</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-purple-400/50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">署名内容</label>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={6}
                            className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-purple-400/50 outline-none resize-none font-mono text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`editIsDefault-${sig.id}`}
                            checked={editIsDefault}
                            onChange={(e) => setEditIsDefault(e.target.checked)}
                            className="w-4 h-4 rounded border-white/20 bg-slate-900/50 text-purple-500 focus:ring-purple-500"
                          />
                          <label htmlFor={`editIsDefault-${sig.id}`} className="text-sm text-slate-300">
                            デフォルト署名に設定
                          </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={cancelEditing}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 font-medium transition-colors"
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={() => updateSignature(sig.id)}
                            className="px-4 py-2 bg-purple-500/80 hover:bg-purple-400/80 border border-purple-400/30 rounded-lg text-white font-medium transition-colors"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 表示モード
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-white">{sig.name}</span>
                          {sig.is_default && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 border border-yellow-400/30 rounded-full text-xs text-yellow-300">
                              <Star size={12} fill="currentColor" />
                              デフォルト
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditing(sig)}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                            title="編集"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteSignature(sig.id)}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/30 rounded-lg p-3 border border-white/5">
                        {sig.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
