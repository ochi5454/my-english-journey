'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { ArrowLeft, Plus, Trash2, X, ChevronRight, Mail } from 'lucide-react'

interface RecipientList {
  id: number
  name: string
  description?: string
  member_count: number
  created_at: string
}

interface RecipientMember {
  id: number
  email: string
  name?: string
  department?: string
  note?: string
}

interface RecipientListDetail extends RecipientList {
  members: RecipientMember[]
}

export default function RecipientsPage() {
  const { } = useAuth()
  const router = useRouter()

  const [lists, setLists] = useState<RecipientList[]>([])
  const [selectedList, setSelectedList] = useState<RecipientListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [showNewListModal, setShowNewListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchLists() }, [])

  const fetchLists = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/recipients/lists`, { credentials: 'include' })
      if (res.ok) { setLists(await res.json()) }
      else { setError('宛先リストの取得に失敗しました') }
    } catch (e) { setError('宛先リストの取得に失敗しました') }
    finally { setLoading(false) }
  }

  const fetchListDetail = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${id}`, { credentials: 'include' })
      if (res.ok) { setSelectedList(await res.json()); setShowDetailModal(true) }
    } catch (e) { console.error('Failed to fetch list detail:', e) }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setError(null)
    const formData = new FormData()
    formData.append('file', files[0])

    try {
      const res = await fetch(`${API_BASE}/recipients/upload`, { method: 'POST', credentials: 'include', body: formData })
      if (res.ok) {
        const data = await res.json()
        setLists(prev => [data, ...prev])
        setSelectedList(data); setShowDetailModal(true)
      } else { setError(`アップロードに失敗しました: ${await res.text()}`) }
    } catch (e) { setError('アップロード中にエラーが発生しました') }
    finally { setUploading(false) }
  }

  const createList = async () => {
    if (!newListName.trim()) { setError('リスト名を入力してください'); return }
    try {
      const res = await fetch(`${API_BASE}/recipients/lists`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newListName, description: newListDescription || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        setLists(prev => [data, ...prev])
        setShowNewListModal(false); setNewListName(''); setNewListDescription('')
      } else { setError('リストの作成に失敗しました') }
    } catch (e) { setError('リストの作成に失敗しました') }
  }

  const deleteList = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('このリストを削除しますか？')) return
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        setLists(prev => prev.filter(l => l.id !== id))
        if (selectedList?.id === id) { setSelectedList(null); setShowDetailModal(false) }
      } else { setError('リストの削除に失敗しました') }
    } catch (e) { setError('リストの削除に失敗しました') }
  }

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 -right-40 w-80 h-80 bg-purple-600/25 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 right-1/3 w-80 h-80 bg-emerald-600/15 rounded-full blur-[100px]" />
      </div>

      {/* Header - Glass */}
      <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">ホーム</span>
          </button>
          <h1 className="text-white font-semibold">👥 宛先管理</h1>
          <button onClick={() => setShowNewListModal(true)} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
            <Plus size={20} />
            <span className="text-sm font-medium">新規</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {error && (
            <div className={`mb-4 p-3 ${glassCard} rounded-xl text-sm text-red-300 bg-red-500/10`}>
              ⚠️ {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {/* Import Button - Glass */}
          <div className="mb-6">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => handleFileUpload(e.target.files)} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`w-full p-4 ${glassCard} rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50`}
            >
              <span className="text-2xl">📤</span>
              <span className="text-white font-medium">{uploading ? 'アップロード中...' : 'Excel/CSVファイルをインポート'}</span>
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">読み込み中...</div>
          ) : lists.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <span className="text-4xl">👥</span>
              </div>
              <p className="text-slate-400 mb-4">宛先リストがありません</p>
              <button onClick={() => setShowNewListModal(true)} className="px-6 py-3 bg-blue-500/30 backdrop-blur-sm border border-blue-400/30 rounded-xl text-white font-medium hover:bg-blue-400/30 transition-colors">
                最初のリストを作成
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">宛先リスト</h2>
              <div className={`${glassCard} rounded-2xl overflow-hidden`}>
                {lists.map((list, index) => (
                  <div
                    key={list.id}
                    onClick={() => fetchListDetail(list.id)}
                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors ${index !== lists.length - 1 ? 'border-b border-white/5' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">👥</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{list.name}</div>
                        <div className="text-sm text-slate-400">{list.member_count}件のメールアドレス</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => deleteList(list.id, e)} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 size={18} />
                      </button>
                      <ChevronRight size={20} className="text-slate-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* New List Modal - Glass */}
      {showNewListModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${glassCard} rounded-2xl w-full max-w-md`}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">📝 新規リスト作成</h2>
              <button onClick={() => setShowNewListModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">リスト名 *</label>
                <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="例: 営業部" className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-400/50 transition-colors" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">説明（任意）</label>
                <input type="text" value={newListDescription} onChange={e => setNewListDescription(e.target.value)} placeholder="例: 営業部全員" className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-400/50 transition-colors" />
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3">
              <button onClick={createList} className="flex-1 py-3 bg-blue-500/30 backdrop-blur-sm border border-blue-400/30 rounded-xl text-white font-medium hover:bg-blue-400/30 transition-colors">作成</button>
              <button onClick={() => setShowNewListModal(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal - Glass */}
      {showDetailModal && selectedList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${glassCard} rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col`}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-semibold text-white">{selectedList.name}</h2>
                {selectedList.description && <p className="text-sm text-slate-400">{selectedList.description}</p>}
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4 text-sm text-slate-400">📧 {selectedList.members.length}件のメールアドレス</div>
              <div className="bg-slate-900/30 rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr className="text-slate-400">
                      <th className="text-left p-3 font-medium">メールアドレス</th>
                      <th className="text-left p-3 font-medium">名前</th>
                      <th className="text-left p-3 font-medium">部署</th>
                      <th className="text-left p-3 font-medium">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedList.members.map((member, index) => (
                      <tr key={member.id} className={index !== selectedList.members.length - 1 ? 'border-b border-white/5' : ''}>
                        <td className="p-3 text-white">
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-blue-400" />
                            {member.email}
                          </div>
                        </td>
                        <td className="p-3 text-slate-300">{member.name || '-'}</td>
                        <td className="p-3 text-slate-300">{member.department || '-'}</td>
                        <td className="p-3 text-slate-400">{member.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
