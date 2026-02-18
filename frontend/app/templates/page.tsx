'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { API_BASE } from '../constants/excel'
import { ArrowLeft, Plus, FileText, Trash2, Edit3, X, ChevronRight, Filter } from 'lucide-react'

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

  // Category filter
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  // Fetch templates and categories on mount
  useEffect(() => {
    fetchTemplates()
    fetchCategories()
  }, [])

  // Refetch when category filter changes
  useEffect(() => {
    fetchTemplates()
  }, [selectedCategory])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const url = selectedCategory
        ? `${API_BASE}/templates?category=${encodeURIComponent(selectedCategory)}`
        : `${API_BASE}/templates`
      const res = await fetch(url, { credentials: 'include' })
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

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/templates/categories/list`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e)
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

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-emerald-600/20 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-blue-600/15 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-[100px]" />
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
            📝 テンプレート管理
          </h1>
          <button
            onClick={startNewTemplate}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/30 hover:bg-emerald-400/30 border border-emerald-400/30 rounded-lg text-white text-sm font-medium transition-colors"
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-full">
              <span className="text-base">💡</span>
              <p className="text-sm text-emerald-300">よく使う文面を保存して時短できます</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-200 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Filter size={14} className="text-slate-500" />
                <span className="text-xs text-slate-500 uppercase tracking-wider">カテゴリで絞り込み</span>
              </div>
              <div className={`${glassCard} rounded-xl p-1 flex flex-wrap gap-1`}>
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === ''
                      ? 'bg-emerald-500/30 text-white border border-emerald-400/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  すべて
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === cat
                        ? 'bg-emerald-500/30 text-white border border-emerald-400/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-slate-400">読み込み中...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">テンプレートがありません</p>
              <p className="text-sm text-slate-500 mt-2">右上の「新規」から作成できます</p>
            </div>
          ) : (
            Object.entries(groupedTemplates).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                  {category}
                </h2>
                <div className={`${glassCard} rounded-xl overflow-hidden`}>
                  {items.map((template, index) => (
                    <div
                      key={template.id}
                      onClick={() => openTemplate(template)}
                      className={`flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors ${
                        index !== items.length - 1 ? 'border-b border-white/5' : ''
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
          <div className={`${glassCard} rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">
                {selectedTemplate && !editMode ? 'テンプレート詳細' : editMode && selectedTemplate ? 'テンプレート編集' : '新規テンプレート'}
              </h2>
              <div className="flex items-center gap-2">
                {selectedTemplate && !editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors"
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
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">カテゴリ</label>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      placeholder="例: 定期連絡"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">件名 *</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value)}
                      placeholder="メールの件名"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">本文 *</label>
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      placeholder="メールの本文"
                      rows={10}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white resize-none placeholder-slate-500 focus:outline-none focus:border-emerald-400/50"
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
                    <div className="p-3 bg-white/5 rounded-xl text-white">{selectedTemplate.subject}</div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">本文</label>
                    <div className="p-3 bg-white/5 rounded-xl whitespace-pre-wrap text-sm text-white">
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
              <div className="p-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={saveTemplate}
                  disabled={saving}
                  className="flex-1 py-3 bg-emerald-500/30 hover:bg-emerald-400/30 border border-emerald-400/30 rounded-xl text-white font-medium disabled:opacity-50 transition-colors"
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
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-medium transition-colors"
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
