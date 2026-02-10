'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { ArrowLeft, Plus, FileText, Trash2, Edit3, X, ChevronRight } from 'lucide-react'

interface Template {
  id: number
  name: string
  category?: string
  subject: string
  body: string
  variables?: string[]
  created_at: string
  updated_at: string
}

export default function TemplatesPage() {
  const { } = useAuth()
  const router = useRouter()

  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Edit form
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/templates`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      } else {
        setError('テンプレートの取得に失敗しました')
      }
    } catch (e) {
      setError('テンプレートの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const openTemplate = (template: Template) => {
    setSelectedTemplate(template)
    setEditName(template.name)
    setEditCategory(template.category || '')
    setEditSubject(template.subject)
    setEditBody(template.body)
    setEditMode(false)
    setShowModal(true)
  }

  const startNewTemplate = () => {
    setSelectedTemplate(null)
    setEditName('')
    setEditCategory('')
    setEditSubject('')
    setEditBody('')
    setEditMode(true)
    setShowModal(true)
  }

  const saveTemplate = async () => {
    if (!editName.trim() || !editSubject.trim() || !editBody.trim()) {
      setError('名前、件名、本文は必須です')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      name: editName,
      category: editCategory || undefined,
      subject: editSubject,
      body: editBody,
    }

    try {
      let res
      if (selectedTemplate) {
        // Update
        res = await fetch(`${API_BASE}/templates/${selectedTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
      } else {
        // Create
        res = await fetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        const data = await res.json()
        if (selectedTemplate) {
          setTemplates(prev => prev.map(t => (t.id === data.id ? data : t)))
        } else {
          setTemplates(prev => [data, ...prev])
        }
        setSelectedTemplate(data)
        setEditMode(false)
      } else {
        setError('保存に失敗しました')
      }
    } catch (e) {
      setError('保存中にエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('このテンプレートを削除しますか？')) return

    try {
      const res = await fetch(`${API_BASE}/templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        if (selectedTemplate?.id === id) {
          setSelectedTemplate(null)
          setShowModal(false)
        }
      } else {
        setError('削除に失敗しました')
      }
    } catch (e) {
      setError('削除中にエラーが発生しました')
    }
  }

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, t) => {
    const cat = t.category || '未分類'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {} as Record<string, Template[]>)

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex flex-col">
      {/* Header */}
      <header className="bg-[#0A1628] border-b border-[#1E3A5F] sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">ホーム</span>
          </button>
          <h1 className="text-white font-semibold">テンプレート管理</h1>
          <button
            onClick={startNewTemplate}
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus size={20} />
            <span className="text-sm font-medium">新規</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-200">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-slate-400">読み込み中...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400 mb-4">テンプレートがありません</p>
              <button
                onClick={startNewTemplate}
                className="px-6 py-3 bg-blue-600 rounded-xl text-white font-medium hover:bg-blue-500 transition-colors"
              >
                最初のテンプレートを作成
              </button>
            </div>
          ) : (
            Object.entries(groupedTemplates).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                  {category}
                </h2>
                <div className="bg-[#1A2942] rounded-xl border border-[#2A3F5F] overflow-hidden">
                  {items.map((template, index) => (
                    <div
                      key={template.id}
                      onClick={() => openTemplate(template)}
                      className={`flex items-center justify-between p-4 cursor-pointer hover:bg-[#243550] transition-colors ${
                        index !== items.length - 1 ? 'border-b border-[#2A3F5F]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                          <FileText size={20} className="text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{template.name}</div>
                          <div className="text-sm text-slate-400 truncate">{template.subject}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => deleteTemplate(template.id, e)}
                          className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight size={20} className="text-slate-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A2942] rounded-2xl border border-[#2A3F5F] w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#2A3F5F]">
              <h2 className="text-lg font-semibold text-white">
                {selectedTemplate && !editMode ? 'テンプレート詳細' : editMode && selectedTemplate ? 'テンプレート編集' : '新規テンプレート'}
              </h2>
              <div className="flex items-center gap-2">
                {selectedTemplate && !editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Edit3 size={20} />
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4">
              {editMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">テンプレート名 *</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="例: 会議日程調整"
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">カテゴリ</label>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      placeholder="例: 定期連絡"
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">件名 *</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value)}
                      placeholder="メールの件名"
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">本文 *</label>
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      placeholder="メールの本文"
                      rows={10}
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 resize-none placeholder-slate-400"
                    />
                  </div>
                </div>
              ) : selectedTemplate ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">テンプレート名</label>
                    <div className="text-lg text-white font-medium">{selectedTemplate.name}</div>
                  </div>
                  {selectedTemplate.category && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">カテゴリ</label>
                      <div className="text-white">{selectedTemplate.category}</div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">件名</label>
                    <div className="p-3 bg-[#0F1C2E] rounded-xl text-white">{selectedTemplate.subject}</div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">本文</label>
                    <div className="p-3 bg-[#0F1C2E] rounded-xl whitespace-pre-wrap text-sm text-white">
                      {selectedTemplate.body}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    作成: {new Date(selectedTemplate.created_at).toLocaleString('ja-JP')}
                    {' | '}
                    更新: {new Date(selectedTemplate.updated_at).toLocaleString('ja-JP')}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            {editMode && (
              <div className="p-4 border-t border-[#2A3F5F] flex gap-3">
                <button
                  onClick={saveTemplate}
                  disabled={saving}
                  className="flex-1 py-3 bg-blue-600 rounded-xl text-white font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    if (selectedTemplate) {
                      setEditMode(false)
                    } else {
                      setShowModal(false)
                    }
                  }}
                  className="flex-1 py-3 bg-[#2A3F5F] rounded-xl text-white font-medium hover:bg-[#3A4F6F] transition-colors"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
