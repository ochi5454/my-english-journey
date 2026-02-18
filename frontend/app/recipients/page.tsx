'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { ArrowLeft, Plus, Trash2, X, ChevronRight, Mail, Edit2, Download, Check } from 'lucide-react'

interface RecipientList {
  id: number
  name: string
  description?: string
  member_count: number
  to_count: number
  cc_count: number
  bcc_count: number
  created_at: string
}

interface RecipientMember {
  id: number
  email: string
  name?: string
  department?: string
  position?: string
  employee_id?: string
  note?: string
  recipient_type: 'to' | 'cc' | 'bcc'
}

interface RecipientListDetail extends RecipientList {
  members: RecipientMember[]
}

export default function RecipientsPage() {
  useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [lists, setLists] = useState<RecipientList[]>([])
  const [selectedList, setSelectedList] = useState<RecipientListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const [showNewListModal, setShowNewListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)

  // 履歴からのリスト作成用
  const [fromHistoryEmails, setFromHistoryEmails] = useState<string[]>([])
  const [showFromHistoryModal, setShowFromHistoryModal] = useState(false)
  const [historyListName, setHistoryListName] = useState('')

  // 編集モード
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')


  // 手動メンバー追加
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [newMember, setNewMember] = useState({
    email: '',
    name: '',
    department: '',
    position: '',
    employee_id: '',
    recipient_type: 'to' as 'to' | 'cc' | 'bcc',
  })
  const [addingMember, setAddingMember] = useState(false)

  // メンバー編集
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null)
  const [editingMemberData, setEditingMemberData] = useState({
    email: '',
    name: '',
    department: '',
    position: '',
    employee_id: '',
    recipient_type: 'to' as 'to' | 'cc' | 'bcc',
  })
  const [savingMember, setSavingMember] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchLists() }, [])

  // 履歴からのリスト作成パラメータをチェック
  useEffect(() => {
    const fromHistory = searchParams.get('from_history')
    const emailsParam = searchParams.get('emails')
    if (fromHistory && emailsParam) {
      try {
        const emails = JSON.parse(emailsParam) as string[]
        setFromHistoryEmails(emails)
        setHistoryListName(`送信履歴 ${fromHistory} からのリスト`)
        setShowFromHistoryModal(true)
        // URLパラメータをクリア
        router.replace('/recipients')
      } catch (e) {
        console.error('Failed to parse emails from history:', e)
      }
    }
  }, [searchParams, router])

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
    setUploading(true); setError(null); setUploadedFileName(null)
    const fileName = files[0].name
    const formData = new FormData()
    formData.append('file', files[0])

    try {
      const res = await fetch(`${API_BASE}/recipients/upload`, { method: 'POST', credentials: 'include', body: formData })
      if (res.ok) {
        const data = await res.json()
        setLists(prev => [data, ...prev])
        setUploadedFileName(fileName)
        // 少し待ってから詳細画面に遷移
        setTimeout(() => {
          setShowNewListModal(false)
          setUploadedFileName(null)
          setSelectedList(data); setShowDetailModal(true)
        }, 1500)
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

  // 履歴からリストを作成
  const createListFromHistory = async () => {
    if (!historyListName.trim() || fromHistoryEmails.length === 0) return
    try {
      // まずリストを作成
      const res = await fetch(`${API_BASE}/recipients/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: historyListName, description: '送信履歴から作成' }),
      })
      if (res.ok) {
        const newList = await res.json()
        // メンバーを追加
        const membersRes = await fetch(`${API_BASE}/recipients/lists/${newList.id}/members/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            members: fromHistoryEmails.map(email => ({ email })),
          }),
        })
        if (membersRes.ok) {
          await fetchLists()
          setShowFromHistoryModal(false)
          setFromHistoryEmails([])
          setHistoryListName('')
          // 作成したリストの詳細を表示
          fetchListDetail(newList.id)
        } else {
          setError('メンバーの追加に失敗しました')
        }
      } else {
        setError('リストの作成に失敗しました')
      }
    } catch (e) {
      setError('リストの作成に失敗しました')
    }
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

  const startEditing = () => {
    if (!selectedList) return
    setEditName(selectedList.name)
    setEditDescription(selectedList.description || '')
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditName('')
    setEditDescription('')
  }

  const updateList = async () => {
    if (!selectedList || !editName.trim()) return
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${selectedList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName, description: editDescription || null }),
      })
      if (res.ok) {
        const updated = await res.json()
        setLists(prev => prev.map(l => l.id === updated.id ? updated : l))
        setSelectedList({ ...selectedList, name: updated.name, description: updated.description })
        setIsEditing(false)
      } else { setError('リストの更新に失敗しました') }
    } catch (e) { setError('リストの更新に失敗しました') }
  }

  // テンプレートダウンロード
  const downloadTemplate = async (type: 'simple' | 'with-types') => {
    try {
      const res = await fetch(`${API_BASE}/recipients/templates/${type}`, { credentials: 'include' })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = type === 'simple' ? 'recipient_template_simple.xlsx' : 'recipient_template_with_types.xlsx'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        setError('テンプレートのダウンロードに失敗しました')
      }
    } catch (e) {
      setError('テンプレートのダウンロードに失敗しました')
    }
  }

  // 手動メンバー追加
  const startAddingMember = () => {
    setIsAddingMember(true)
    setNewMember({ email: '', name: '', department: '', position: '', employee_id: '', recipient_type: 'to' })
  }

  const cancelAddingMember = () => {
    setIsAddingMember(false)
    setNewMember({ email: '', name: '', department: '', position: '', employee_id: '', recipient_type: 'to' })
  }

  const addMember = async () => {
    if (!selectedList || !newMember.email.trim()) return
    if (!newMember.email.includes('@')) {
      setError('有効なメールアドレスを入力してください')
      return
    }
    setAddingMember(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${selectedList.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          members: [{
            email: newMember.email.trim(),
            name: newMember.name.trim() || null,
            department: newMember.department.trim() || null,
            position: newMember.position.trim() || null,
            employee_id: newMember.employee_id.trim() || null,
            recipient_type: newMember.recipient_type,
          }],
        }),
      })
      if (res.ok) {
        await fetchListDetail(selectedList.id)
        await fetchLists()
        setIsAddingMember(false)
        setNewMember({ email: '', name: '', department: '', position: '', employee_id: '', recipient_type: 'to' })
      } else {
        const errorData = await res.json()
        setError(errorData.detail || 'メンバーの追加に失敗しました')
      }
    } catch (e) {
      setError('メンバーの追加に失敗しました')
    } finally {
      setAddingMember(false)
    }
  }

  // メンバー編集開始
  const startEditingMember = (member: RecipientMember) => {
    setEditingMemberId(member.id)
    setEditingMemberData({
      email: member.email,
      name: member.name || '',
      department: member.department || '',
      position: member.position || '',
      employee_id: member.employee_id || '',
      recipient_type: member.recipient_type || 'to',
    })
  }

  const cancelEditingMember = () => {
    setEditingMemberId(null)
    setEditingMemberData({ email: '', name: '', department: '', position: '', employee_id: '', recipient_type: 'to' })
  }

  const saveMember = async () => {
    if (!selectedList || !editingMemberId || !editingMemberData.email.trim()) return
    if (!editingMemberData.email.includes('@')) {
      setError('有効なメールアドレスを入力してください')
      return
    }
    setSavingMember(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${selectedList.id}/members/${editingMemberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: editingMemberData.email.trim(),
          name: editingMemberData.name.trim() || null,
          department: editingMemberData.department.trim() || null,
          position: editingMemberData.position.trim() || null,
          employee_id: editingMemberData.employee_id.trim() || null,
          recipient_type: editingMemberData.recipient_type,
        }),
      })
      if (res.ok) {
        await fetchListDetail(selectedList.id)
        await fetchLists()
        setEditingMemberId(null)
        setEditingMemberData({ email: '', name: '', department: '', position: '', employee_id: '', recipient_type: 'to' })
      } else {
        const errorData = await res.json()
        setError(errorData.detail || 'メンバーの更新に失敗しました')
      }
    } catch (e) {
      setError('メンバーの更新に失敗しました')
    } finally {
      setSavingMember(false)
    }
  }

  const deleteMember = async (memberId: number) => {
    if (!selectedList) return
    if (!confirm('このメンバーを削除しますか？')) return
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${selectedList.id}/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        await fetchListDetail(selectedList.id)
        await fetchLists()
      } else {
        const errorData = await res.json()
        setError(errorData.detail || 'メンバーの削除に失敗しました')
      }
    } catch (e) {
      setError('メンバーの削除に失敗しました')
    }
  }

  // recipient_type に応じたバッジスタイル
  const getRecipientTypeBadge = (type: 'to' | 'cc' | 'bcc') => {
    const styles = {
      to: 'bg-blue-500/30 text-blue-300 border-blue-400/30',
      cc: 'bg-violet-500/30 text-violet-300 border-violet-400/30',
      bcc: 'bg-slate-500/30 text-slate-300 border-slate-400/30',
    }
    return styles[type] || styles.to
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
          <h1 className="text-white font-semibold">👥 メーリングリスト</h1>
          <button onClick={() => setShowNewListModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500/30 hover:bg-purple-400/30 border border-purple-400/30 rounded-lg text-white text-sm font-medium transition-colors">
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-400/20 rounded-full">
              <span className="text-base">💡</span>
              <p className="text-sm text-blue-300">リストを作っておくと入力の手間が省けます</p>
            </div>
          </div>

          {/* Template Download Section */}
          <div className={`mb-6 p-4 ${glassCard} rounded-2xl`}>
            <div className="flex items-center gap-2 mb-3">
              <Download size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-white">テンプレートをダウンロード</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => downloadTemplate('simple')}
                className="p-3 bg-slate-900/50 hover:bg-slate-800/50 border border-white/10 hover:border-purple-400/30 rounded-xl transition-all group"
              >
                <div className="text-sm font-medium text-white group-hover:text-purple-300 mb-1">シンプル版</div>
                <div className="text-xs text-slate-400">全員To</div>
              </button>
              <button
                onClick={() => downloadTemplate('with-types')}
                className="p-3 bg-slate-900/50 hover:bg-slate-800/50 border border-white/10 hover:border-purple-400/30 rounded-xl transition-all group"
              >
                <div className="text-sm font-medium text-white group-hover:text-purple-300 mb-1">振り分け版</div>
                <div className="text-xs text-slate-400">To/Cc/Bcc対応</div>
              </button>
            </div>
          </div>

          {error && (
            <div className={`mb-4 p-3 ${glassCard} rounded-xl text-sm text-red-300 bg-red-500/10`}>
              ⚠️ {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-slate-400">読み込み中...</div>
          ) : lists.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <span className="text-4xl">👥</span>
              </div>
              <p className="text-slate-400">宛先リストがありません</p>
              <p className="text-sm text-slate-500 mt-2">右上の「新規作成」から作成できます</p>
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
                        <div className="text-xs text-slate-400 mt-0.5">
                          {(list.cc_count > 0 || list.bcc_count > 0) ? (
                            <span className="flex items-center gap-2">
                              <span className="text-blue-400">To: {list.to_count || list.member_count}</span>
                              {list.cc_count > 0 && <span className="text-violet-400">Cc: {list.cc_count}</span>}
                              {list.bcc_count > 0 && <span className="text-slate-400">Bcc: {list.bcc_count}</span>}
                            </span>
                          ) : (
                            <span>{list.member_count}件のメールアドレス</span>
                          )}
                        </div>
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
              <button onClick={() => { setShowNewListModal(false); setUploadedFileName(null) }} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* エラー表示 */}
              {error && (
                <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-xl text-sm text-red-300">
                  ⚠️ {error}
                  <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
                </div>
              )}
              {/* ファイルインポート */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Excel/CSVからインポート</label>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => handleFileUpload(e.target.files)} className="hidden" />
                {uploadedFileName ? (
                  <div className="w-full p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-xl flex items-center justify-center gap-2">
                    <span className="text-lg">✅</span>
                    <span className="text-emerald-300 text-sm">{uploadedFileName} をインポートしました</span>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={`w-full p-3 ${glassCard} rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-all disabled:opacity-50`}
                  >
                    <span className="text-lg">📤</span>
                    <span className="text-white text-sm">{uploading ? 'アップロード中...' : 'ファイルを選択'}</span>
                  </button>
                )}
              </div>

              {/* 手動作成 */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">リスト名 *</label>
                <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="例: 営業部" className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-purple-400/50 transition-colors" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">説明（任意）</label>
                <input type="text" value={newListDescription} onChange={e => setNewListDescription(e.target.value)} placeholder="例: 営業部全員" className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-purple-400/50 transition-colors" />
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3">
              <button onClick={createList} disabled={!newListName.trim()} className="flex-1 py-3 bg-purple-500/30 backdrop-blur-sm border border-purple-400/30 rounded-xl text-white font-medium hover:bg-purple-400/30 transition-colors disabled:opacity-30">作成</button>
              <button onClick={() => { setShowNewListModal(false); setUploadedFileName(null) }} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* From History Modal - Glass */}
      {showFromHistoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${glassCard} rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col`}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">📋 送信履歴からリスト作成</h2>
              <button onClick={() => { setShowFromHistoryModal(false); setFromHistoryEmails([]); setHistoryListName('') }} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* 注意書き */}
              <div className="p-3 bg-blue-500/10 border border-blue-400/20 rounded-xl">
                <p className="text-xs text-blue-300">
                  送信履歴の宛先を元に、新しい宛先リストを作成します。
                  <br />
                  ※ このリストはご自身で管理・更新してください
                </p>
              </div>

              {/* リスト名 */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">リスト名 *</label>
                <input
                  type="text"
                  value={historyListName}
                  onChange={e => setHistoryListName(e.target.value)}
                  placeholder="例: 営業部連絡先"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-purple-400/50 transition-colors"
                />
              </div>

              {/* メールアドレス一覧 */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">追加されるメールアドレス ({fromHistoryEmails.length}件)</label>
                <div className="max-h-40 overflow-auto bg-slate-900/30 rounded-xl border border-white/5 p-3 space-y-1">
                  {fromHistoryEmails.map((email, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-white">
                      <Mail size={12} className="text-blue-400" />
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3">
              <button
                onClick={createListFromHistory}
                disabled={!historyListName.trim() || fromHistoryEmails.length === 0}
                className="flex-1 py-3 bg-purple-500/30 backdrop-blur-sm border border-purple-400/30 rounded-xl text-white font-medium hover:bg-purple-400/30 transition-colors disabled:opacity-30"
              >
                リストを作成
              </button>
              <button
                onClick={() => { setShowFromHistoryModal(false); setFromHistoryEmails([]); setHistoryListName('') }}
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal - Glass */}
      {showDetailModal && selectedList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${glassCard} rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col`}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              {isEditing ? (
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="リスト名"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:border-purple-400/50"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="説明（任意）"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:border-purple-400/50 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-semibold text-white">{selectedList.name}</h2>
                  {selectedList.description && <p className="text-sm text-slate-400">{selectedList.description}</p>}
                </div>
              )}
              <div className="flex items-center gap-2 ml-4">
                {isEditing ? (
                  <>
                    <button onClick={updateList} disabled={!editName.trim()} className="px-3 py-1.5 bg-purple-500/30 border border-purple-400/30 rounded-lg text-white text-sm font-medium hover:bg-purple-400/30 transition-colors disabled:opacity-30">
                      保存
                    </button>
                    <button onClick={cancelEditing} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                      キャンセル
                    </button>
                  </>
                ) : (
                  <button onClick={startEditing} className="p-2 text-slate-400 hover:text-white transition-colors" title="編集">
                    <Edit2 size={18} />
                  </button>
                )}
                <button onClick={() => { setShowDetailModal(false); cancelEditing(); cancelAddingMember(); cancelEditingMember() }} className="p-2 text-slate-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {/* サマリーとインポートボタン */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">📧 {selectedList.members.length}件</span>
                  {(selectedList.cc_count > 0 || selectedList.bcc_count > 0) && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded">To: {selectedList.to_count}</span>
                      {selectedList.cc_count > 0 && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 border border-violet-400/30 rounded">Cc: {selectedList.cc_count}</span>}
                      {selectedList.bcc_count > 0 && <span className="px-2 py-0.5 bg-slate-500/20 text-slate-300 border border-slate-400/30 rounded">Bcc: {selectedList.bcc_count}</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={startAddingMember}
                  disabled={isAddingMember}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-400/20 border border-emerald-400/30 rounded-lg text-emerald-300 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                  行を追加
                </button>
              </div>

              <div className="bg-slate-900/30 rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr className="text-slate-400">
                      <th className="text-left p-3 font-medium w-16">種別</th>
                      <th className="text-left p-3 font-medium">メールアドレス</th>
                      <th className="text-left p-3 font-medium">名前</th>
                      <th className="text-left p-3 font-medium">部署</th>
                      <th className="text-left p-3 font-medium">職位</th>
                      <th className="text-left p-3 font-medium">社員番号</th>
                      <th className="text-left p-3 font-medium w-20">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 新規追加行 */}
                    {isAddingMember && (
                      <tr className="border-b border-emerald-400/30 bg-emerald-500/5">
                        <td className="p-2">
                          <select
                            value={newMember.recipient_type}
                            onChange={e => setNewMember(prev => ({ ...prev, recipient_type: e.target.value as 'to' | 'cc' | 'bcc' }))}
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-emerald-400/50"
                          >
                            <option value="to">TO</option>
                            <option value="cc">CC</option>
                            <option value="bcc">BCC</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="email"
                            value={newMember.email}
                            onChange={e => setNewMember(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="email@example.com *"
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-400/50"
                            autoFocus
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={newMember.name}
                            onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="名前"
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-400/50"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={newMember.department}
                            onChange={e => setNewMember(prev => ({ ...prev, department: e.target.value }))}
                            placeholder="部署"
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-400/50"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={newMember.position}
                            onChange={e => setNewMember(prev => ({ ...prev, position: e.target.value }))}
                            placeholder="職位"
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-400/50"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={newMember.employee_id}
                            onChange={e => setNewMember(prev => ({ ...prev, employee_id: e.target.value }))}
                            placeholder="社員番号"
                            className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-400/50"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={addMember}
                              disabled={addingMember || !newMember.email.trim()}
                              className="p-1.5 bg-emerald-500/30 hover:bg-emerald-400/30 border border-emerald-400/30 rounded text-emerald-300 transition-colors disabled:opacity-30"
                              title="追加"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelAddingMember}
                              className="p-1.5 bg-red-500/20 hover:bg-red-400/20 border border-red-400/30 rounded text-red-300 transition-colors"
                              title="キャンセル"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {selectedList.members.map((member, index) => (
                      <tr key={member.id} className={`${index !== selectedList.members.length - 1 ? 'border-b border-white/5' : ''} ${editingMemberId === member.id ? 'bg-blue-500/5' : ''}`}>
                        {editingMemberId === member.id ? (
                          <>
                            <td className="p-2">
                              <select
                                value={editingMemberData.recipient_type}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, recipient_type: e.target.value as 'to' | 'cc' | 'bcc' }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              >
                                <option value="to">TO</option>
                                <option value="cc">CC</option>
                                <option value="bcc">BCC</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="email"
                                value={editingMemberData.email}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={editingMemberData.name}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={editingMemberData.department}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, department: e.target.value }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={editingMemberData.position}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, position: e.target.value }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={editingMemberData.employee_id}
                                onChange={e => setEditingMemberData(prev => ({ ...prev, employee_id: e.target.value }))}
                                className="w-full px-2 py-1.5 bg-slate-900/50 border border-white/10 rounded text-white text-xs outline-none focus:border-blue-400/50"
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={saveMember}
                                  disabled={savingMember || !editingMemberData.email.trim()}
                                  className="p-1.5 bg-blue-500/30 hover:bg-blue-400/30 border border-blue-400/30 rounded text-blue-300 transition-colors disabled:opacity-30"
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={cancelEditingMember}
                                  className="p-1.5 bg-slate-500/20 hover:bg-slate-400/20 border border-slate-400/30 rounded text-slate-300 transition-colors"
                                  title="キャンセル"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getRecipientTypeBadge(member.recipient_type || 'to')}`}>
                                {(member.recipient_type || 'to').toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-white">
                              <div className="flex items-center gap-2">
                                <Mail size={14} className="text-blue-400" />
                                {member.email}
                              </div>
                            </td>
                            <td className="p-3 text-slate-300">{member.name || '-'}</td>
                            <td className="p-3 text-slate-300">{member.department || '-'}</td>
                            <td className="p-3 text-slate-400">{member.position || '-'}</td>
                            <td className="p-3 text-slate-400">{member.employee_id || '-'}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startEditingMember(member)}
                                  className="p-1.5 text-slate-400 hover:text-blue-300 transition-colors"
                                  title="編集"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => deleteMember(member.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-300 transition-colors"
                                  title="削除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
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
