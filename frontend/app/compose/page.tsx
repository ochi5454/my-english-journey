'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { RecipientInput, Recipient } from '../components/RecipientInput'
import { SendButton } from '../components/SendButton'
import { ScheduleModal } from '../components/ScheduleModal'
import { ArrowLeft, Bot, Paperclip, Send, Eye, ChevronRight } from 'lucide-react'

// Types (Recipient is imported from RecipientInput)
interface Attachment {
  id: string
  filename: string
  file_size?: number
  source?: string  // 'manual' | 'agent'
}

interface Template {
  id: number
  name: string
  category?: string
  subject: string
  body: string
}

interface RecipientList {
  id: number
  name: string
  member_count: number
}

interface RecipientListDetail {
  id: number
  name: string
  members: { email: string; name?: string; department?: string }[]
}

type ComposeMode = 'template' | 'manual' | 'ai'

export default function ComposePage() {
  const { user } = useAuth()
  const router = useRouter()

  // Session ID for attachments
  const [sessionId] = useState(() => crypto.randomUUID())

  // Email fields
  const [to, setTo] = useState<Recipient[]>([])
  const [cc, setCc] = useState<Recipient[]>([])
  const [bcc, setBcc] = useState<Recipient[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // UI state
  const [composeMode, setComposeMode] = useState<ComposeMode>('manual')
  const [showPreview, setShowPreview] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState(false)

  // Recipient list modal
  const [showRecipientListModal, setShowRecipientListModal] = useState(false)
  const [recipientLists, setRecipientLists] = useState<RecipientList[]>([])
  const [recipientListTarget, setRecipientListTarget] = useState<'to' | 'cc' | 'bcc'>('to')

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)

  // Recipient list modal target
  // (search is now handled inside RecipientInput component)

  // AI Chat
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [generatedEmail, setGeneratedEmail] = useState<{
    subject: string
    body: string
    recipient_name_used?: boolean
    sender_name_used?: boolean
  } | null>(null)
  const [aiTone, setAiTone] = useState<'formal' | 'casual' | 'polite'>('polite')
  const [aiRecipientType, setAiRecipientType] = useState<'boss' | 'colleague' | 'customer' | 'vendor'>('colleague')

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Fetch templates and recipient lists on mount
  useEffect(() => {
    fetchTemplates()
    fetchRecipientLists()
  }, [])

  // Poll for auto-attached files from external agents
  useEffect(() => {
    const fetchSessionAttachments = async () => {
      try {
        const res = await fetch(`${API_BASE}/attachments/session/${sessionId}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setAttachments(prev => {
            const existingIds = new Set(prev.map(a => a.id))
            const newAttachments = data.filter((a: Attachment) => !existingIds.has(a.id))
            if (newAttachments.length > 0) {
              return [...prev, ...newAttachments]
            }
            return prev
          })
        }
      } catch (e) {
        console.error('Failed to fetch session attachments:', e)
      }
    }

    fetchSessionAttachments()
    const interval = setInterval(fetchSessionAttachments, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/templates`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (e) {
      console.error('Failed to fetch templates:', e)
    }
  }

  const fetchRecipientLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/recipients/lists`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setRecipientLists(data)
      }
    } catch (e) {
      console.error('Failed to fetch recipient lists:', e)
    }
  }

  const importFromList = async (listId: number) => {
    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${listId}`, { credentials: 'include' })
      if (res.ok) {
        const data: RecipientListDetail = await res.json()
        const newRecipients = data.members.map(m => ({
          email: m.email,
          name: m.name,
          department: m.department,
        }))

        const setter = recipientListTarget === 'to' ? setTo : recipientListTarget === 'cc' ? setCc : setBcc
        const current = recipientListTarget === 'to' ? to : recipientListTarget === 'cc' ? cc : bcc

        const existingEmails = new Set(current.map(r => r.email))
        const toAdd = newRecipients.filter(r => !existingEmails.has(r.email))
        setter([...current, ...toAdd])
        setShowRecipientListModal(false)
      }
    } catch (e) {
      console.error('Failed to import from list:', e)
    }
  }

  // Search function for RecipientInput component (returns Promise)
  const searchRecipients = useCallback(async (query: string): Promise<Recipient[]> => {
    try {
      // ファジー検索APIを使用（タイプミス許容、スコアリング付き）
      const res = await fetch(`${API_BASE}/recipients/search/unified?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        return data.results?.map((r: any) => ({
          email: r.email,
          name: r.name,
          department: r.department,
          score: r.score,
          source: r.source,
        })) || []
      } else {
        // フォールバック: 従来のEntra ID検索
        const fallbackRes = await fetch(`${API_BASE}/recipients/search?q=${encodeURIComponent(query)}`, {
          credentials: 'include',
        })
        if (fallbackRes.ok) {
          const data = await fallbackRes.json()
          return Array.isArray(data) ? data.map((u: any) => ({
            email: u.mail || u.email,
            name: u.displayName || u.name,
            department: u.department,
          })) : []
        }
        return []
      }
    } catch (e) {
      console.error('Search failed:', e)
      return []
    }
  }, [])

  const applyTemplate = (template: Template) => {
    setSubject(template.subject)
    setBody(template.body)
    setSelectedTemplate(template.id)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('session_id', sessionId)

      try {
        const res = await fetch(`${API_BASE}/attachments/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        if (res.ok) {
          const data = await res.json()
          setAttachments(prev => [...prev, data])
        } else {
          const err = await res.text()
          setError(`アップロードに失敗しました (${file.name}): ${err}`)
        }
      } catch (e) {
        setError(`アップロードに失敗しました: ${file.name}`)
      }
    }
    setUploading(false)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files) }

  const removeAttachment = async (id: string) => {
    try {
      await fetch(`${API_BASE}/attachments/${id}`, { method: 'DELETE', credentials: 'include' })
      setAttachments(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      console.error('Failed to remove attachment:', e)
    }
  }

  const sendAiMessage = async () => {
    if (!aiInput.trim()) return
    const userMessage = { role: 'user', content: aiInput }
    setAiMessages(prev => [...prev, userMessage])
    setAiInput('')
    setAiLoading(true)
    setGeneratedEmail(null)

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...aiMessages, userMessage],
          tone: aiTone,
          recipient_type: aiRecipientType,
          recipients: to.length > 0 ? to.map(r => ({
            email: r.email,
            name: r.name || null,
            department: r.department || null,
          })) : null,
          // 送信者情報（Langchainで名前挿入に使用）
          sender: user ? {
            name: user.name,
            email: user.email,
            department: undefined,  // TODO: ユーザープロフィールから取得
          } : null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.message }])
        if (data.email) {
          setGeneratedEmail({
            subject: data.email.subject,
            body: data.email.body,
            recipient_name_used: data.email.recipient_name_used,
            sender_name_used: data.email.sender_name_used,
          })
        }
      }
    } catch (e) {
      console.error('AI chat failed:', e)
    } finally {
      setAiLoading(false)
    }
  }

  const applyGeneratedEmail = () => {
    if (generatedEmail) {
      setSubject(generatedEmail.subject)
      setBody(generatedEmail.body)
      setGeneratedEmail(null)
    }
  }

  const sendEmail = async () => {
    if (to.length === 0) { setError('宛先を指定してください'); return }
    if (!subject.trim()) { setError('件名を入力してください'); return }

    setSending(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/mail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: to.map(r => r.email),
          cc: cc.length > 0 ? cc.map(r => r.email) : undefined,
          bcc: bcc.length > 0 ? bcc.map(r => r.email) : undefined,
          subject,
          body,
          session_id: sessionId,
          attachments: attachments.map(a => ({ id: a.id, filename: a.filename })),
        }),
      })

      const data = await res.json()
      if (data.success) {
        setSuccess(true)
        setShowPreview(false)
        setTo([]); setCc([]); setBcc([])
        setSubject(''); setBody(''); setAttachments([])
      } else {
        setError(data.error || '送信に失敗しました')
      }
    } catch (e) {
      setError('送信中にエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  const scheduleEmail = async (scheduledAt: Date, timezone: string) => {
    if (to.length === 0) { setError('宛先を指定してください'); return }
    if (!subject.trim()) { setError('件名を入力してください'); return }

    setSending(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/mail/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: to.map(r => r.email),
          cc: cc.length > 0 ? cc.map(r => r.email) : undefined,
          bcc: bcc.length > 0 ? bcc.map(r => r.email) : undefined,
          subject,
          body,
          session_id: sessionId,
          attachments: attachments.map(a => ({ id: a.id, filename: a.filename })),
          scheduled_at: scheduledAt.toISOString(),
          timezone,
        }),
      })

      if (res.ok) {
        setScheduleSuccess(true)
        setShowPreview(false)
        setTo([]); setCc([]); setBcc([])
        setSubject(''); setBody(''); setAttachments([])
      } else {
        const data = await res.json()
        setError(data.detail || '予約に失敗しました')
      }
    } catch (e) {
      setError('予約中にエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  // Glass card style
  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10 hover:border-white/20"
  const glassCardStatic = "backdrop-blur-xl bg-white/5 border border-white/10"

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-purple-600/15 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 bg-emerald-600/15 rounded-full blur-[100px]" />
      </div>

      {/* Header - Glass */}
      <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">戻る</span>
          </button>
          <h1 className="text-base font-semibold text-white absolute left-1/2 -translate-x-1/2">
            ✉️ 新規メール
          </h1>
          <button
            onClick={sendEmail}
            disabled={sending || to.length === 0}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500/80 backdrop-blur-sm text-white disabled:opacity-30 hover:bg-blue-400/80 transition-all border border-blue-400/30"
          >
            <Send size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex">
        <div className="flex-1 overflow-auto pb-20">
          {/* Alerts */}
          {success && (
            <div className={`mx-4 mt-4 p-4 ${glassCardStatic} rounded-xl text-emerald-300 text-sm bg-emerald-500/10`}>
              ✅ メールを送信しました
            </div>
          )}
          {scheduleSuccess && (
            <div className={`mx-4 mt-4 p-4 ${glassCardStatic} rounded-xl text-purple-300 text-sm bg-purple-500/10`}>
              📅 メールを予約しました
            </div>
          )}
          {error && (
            <div className={`mx-4 mt-4 p-4 ${glassCardStatic} rounded-xl text-red-300 text-sm bg-red-500/10`}>
              ⚠️ {error}
            </div>
          )}

          {/* Recipients Card - Glass */}
          <div className={`mx-4 mt-4 ${glassCardStatic} rounded-2xl overflow-hidden`}>
            {/* To */}
            <RecipientInput
              label="To"
              value={to}
              onChange={setTo}
              onSearch={searchRecipients}
              onOpenList={() => { setRecipientListTarget('to'); setShowRecipientListModal(true) }}
              placeholder="宛先を追加..."
              className="border-b border-white/5"
            />

            {/* Cc */}
            <RecipientInput
              label="Cc"
              value={cc}
              onChange={setCc}
              onSearch={searchRecipients}
              onOpenList={() => { setRecipientListTarget('cc'); setShowRecipientListModal(true) }}
              className="border-b border-white/5"
            />

            {/* Bcc */}
            <RecipientInput
              label="Bcc"
              value={bcc}
              onChange={setBcc}
              onSearch={searchRecipients}
              onOpenList={() => { setRecipientListTarget('bcc'); setShowRecipientListModal(true) }}
            />
          </div>

          {/* Compose Mode Card - Glass */}
          <div className={`mx-4 mt-4 ${glassCardStatic} rounded-2xl overflow-hidden`}>
            <div className="flex p-1.5 bg-slate-900/30">
              <button onClick={() => setComposeMode('template')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all ${composeMode === 'template' ? 'bg-white/10 text-white backdrop-blur-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                <span className="text-base">📋</span>
                テンプレート
              </button>
              <button onClick={() => setComposeMode('manual')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all ${composeMode === 'manual' ? 'bg-white/10 text-white backdrop-blur-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                <span className="text-base">✍️</span>
                手動入力
              </button>
              <button onClick={() => { setComposeMode('ai'); setShowAiPanel(true) }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all ${composeMode === 'ai' ? 'bg-blue-500/30 text-white backdrop-blur-sm border border-blue-400/30' : 'text-slate-400 hover:text-slate-200'}`}>
                <span className="text-base">🤖</span>
                AI生成
              </button>
            </div>

            {composeMode === 'template' && (
              <div className="px-4 py-3 border-t border-white/5">
                <select value={selectedTemplate || ''} onChange={e => { const t = templates.find(t => t.id === Number(e.target.value)); if (t) applyTemplate(t) }} className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-sm text-white backdrop-blur-sm">
                  <option value="" className="bg-slate-900">テンプレートを選択...</option>
                  {templates.map(t => (<option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>))}
                </select>
              </div>
            )}
          </div>

          {/* Subject & Body Card - Glass */}
          <div className={`mx-4 mt-4 ${glassCardStatic} rounded-2xl overflow-hidden`}>
            <div className="px-4 py-3 border-b border-white/5">
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名" className="w-full bg-transparent outline-none text-base text-white placeholder-slate-500 font-medium" />
            </div>
            <div className="px-4 py-3">
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="メール本文を入力..." rows={10} className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500 resize-none leading-relaxed" />
            </div>
          </div>

          {/* Attachments Card - Glass */}
          <div className={`mx-4 mt-4 ${glassCardStatic} rounded-2xl overflow-hidden`}>
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`px-4 py-3 transition-colors ${isDragging ? 'bg-blue-500/10' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">📎</span>
                <span className="text-sm text-slate-400">添付ファイル</span>
                <input ref={fileInputRef} type="file" multiple onChange={e => handleFileUpload(e.target.files)} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="ml-auto px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 text-sm font-medium disabled:opacity-30 transition-all backdrop-blur-sm">
                  {uploading ? '追加中...' : '+ 追加'}
                </button>
              </div>
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-xl border border-white/5">
                      {a.source === 'agent' && <Bot size={16} className="text-blue-400" />}
                      <Paperclip size={14} className="text-slate-500" />
                      <span className="flex-1 text-sm text-slate-300 truncate">{a.filename}</span>
                      {a.file_size && <span className="text-xs text-slate-500">{Math.round(a.file_size / 1024)}KB</span>}
                      <button onClick={() => removeAttachment(a.id)} className="text-slate-500 hover:text-red-400 transition-colors">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Glass */}
          <div className="mx-4 mt-4 mb-6 flex gap-3">
            <button onClick={() => setShowPreview(true)} className={`flex-1 flex items-center justify-center gap-2 py-3 ${glassCard} rounded-2xl text-slate-300 font-medium transition-all`}>
              <Eye size={18} />
              プレビュー
            </button>
            <SendButton
              onSendNow={sendEmail}
              onSchedule={() => setShowScheduleModal(true)}
              sending={sending}
              disabled={to.length === 0}
            />
          </div>

          {/* Schedule Modal */}
          <ScheduleModal
            isOpen={showScheduleModal}
            onClose={() => setShowScheduleModal(false)}
            onSchedule={scheduleEmail}
          />
        </div>

        {/* AI Panel - Glass */}
        {showAiPanel && (
          <div className="w-80 border-l border-white/10 backdrop-blur-xl bg-slate-900/50 flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                  <span className="text-lg">🤖</span>
                </div>
                <span className="font-semibold text-white">AIアシスタント</span>
              </div>
              <button onClick={() => setShowAiPanel(false)} className="text-slate-500 hover:text-white transition-colors text-xl">×</button>
            </div>

            {/* Quick Settings */}
            <div className="p-3 border-b border-white/10 space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">トーン</label>
                <div className="flex gap-1">
                  {[{ value: 'formal', label: 'フォーマル' }, { value: 'polite', label: '丁寧' }, { value: 'casual', label: 'カジュアル' }].map(opt => (
                    <button key={opt.value} onClick={() => setAiTone(opt.value as typeof aiTone)} className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${aiTone === opt.value ? 'bg-blue-500/30 text-white border border-blue-400/30' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-transparent'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">相手</label>
                <div className="flex gap-1">
                  {[{ value: 'boss', label: '上司' }, { value: 'colleague', label: '同僚' }, { value: 'customer', label: '顧客' }, { value: 'vendor', label: '取引先' }].map(opt => (
                    <button key={opt.value} onClick={() => setAiRecipientType(opt.value as typeof aiRecipientType)} className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${aiRecipientType === opt.value ? 'bg-blue-500/30 text-white border border-blue-400/30' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-transparent'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 名前情報表示（Langchain用） */}
            <div className="p-3 border-b border-white/10 bg-slate-900/30">
              <div className="text-xs text-slate-500 mb-2">📝 自動挿入される情報</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 w-14">宛先名:</span>
                  <span className={`${to.length > 0 && to[0].name ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {to.length > 0 && to[0].name ? `${to[0].name}様` : '（宛先を選択してください）'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 w-14">署名:</span>
                  <span className={`${user?.name ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {user?.name || '（ログイン情報から取得）'}
                  </span>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 min-h-0 p-3 overflow-y-auto">
              {aiMessages.length === 0 && (
                <div className="text-slate-500 text-sm space-y-3 text-center py-8">
                  <div className="w-16 h-16 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-3xl">🤖</span>
                  </div>
                  <p>どのようなメールを作成しますか？</p>
                  <p className="text-xs text-slate-600">例: 「会議の日程調整をお願いしたい」</p>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`mb-3 ${m.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block px-4 py-2 rounded-2xl text-sm max-w-[85%] ${m.role === 'user' ? 'bg-blue-500/30 text-white border border-blue-400/20' : 'bg-white/5 text-slate-200 border border-white/10'}`}>
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex items-center gap-1.5 text-slate-500 text-sm pl-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              )}
            </div>

            {/* Generated Email Actions */}
            {generatedEmail && (
              <div className="p-3 border-t border-white/10 bg-blue-500/10">
                <div className="text-xs text-blue-300 mb-2 font-medium">✨ メールが生成されました</div>
                {/* 名前挿入状況の表示 */}
                <div className="flex gap-2 mb-2 text-xs">
                  <span className={`px-2 py-0.5 rounded ${generatedEmail.recipient_name_used ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {generatedEmail.recipient_name_used ? '✓ 宛先名あり' : '⚠ 宛先名なし'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${generatedEmail.sender_name_used ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {generatedEmail.sender_name_used ? '✓ 署名あり' : '⚠ 署名なし'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={applyGeneratedEmail} className="flex-1 px-3 py-2 bg-blue-500/30 text-white rounded-xl text-sm font-medium hover:bg-blue-400/30 transition-all border border-blue-400/30">
                    この内容を使用
                  </button>
                  <button onClick={() => setGeneratedEmail(null)} className="px-3 py-2 bg-white/5 text-slate-400 rounded-xl text-sm hover:bg-white/10 transition-colors border border-white/10">
                    破棄
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()} placeholder="メッセージを入力..." className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white outline-none placeholder-slate-500 focus:border-blue-400/50 transition-colors" />
                <button onClick={sendAiMessage} disabled={aiLoading} className="w-10 h-10 flex items-center justify-center bg-blue-500/30 text-white rounded-full hover:bg-blue-400/30 disabled:opacity-30 transition-all border border-blue-400/30">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Preview Modal - Glass */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${glassCardStatic} rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl`}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-white transition-colors">キャンセル</button>
              <h2 className="text-base font-semibold text-white">👁️ プレビュー</h2>
              <button onClick={() => setShowSendConfirm(true)} disabled={sending} className="text-blue-400 font-semibold hover:text-blue-300 disabled:text-slate-600 transition-colors">送信</button>
            </div>
            <div className="p-5 overflow-auto max-h-[70vh]">
              <div className="space-y-3">
                <div className="flex"><span className="text-slate-500 text-sm w-16">宛先:</span><span className="flex-1 text-sm text-white">{to.map(r => r.name || r.email).join(', ')}</span></div>
                {cc.length > 0 && <div className="flex"><span className="text-slate-500 text-sm w-16">Cc:</span><span className="flex-1 text-sm text-white">{cc.map(r => r.name || r.email).join(', ')}</span></div>}
                {bcc.length > 0 && <div className="flex"><span className="text-slate-500 text-sm w-16">Bcc:</span><span className="flex-1 text-sm text-white">{bcc.map(r => r.name || r.email).join(', ')}</span></div>}
                <div className="flex"><span className="text-slate-500 text-sm w-16">件名:</span><span className="flex-1 text-sm text-white font-medium">{subject}</span></div>
              </div>
              <div className="mt-5 p-4 bg-slate-900/30 rounded-xl border border-white/5">
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">{body}</pre>
              </div>
              {attachments.length > 0 && (
                <div className="mt-5">
                  <span className="text-slate-500 text-sm">📎 添付ファイル</span>
                  <div className="mt-2 space-y-2">
                    {attachments.map(a => (
                      <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-xl border border-white/5">
                        <Paperclip size={16} className="text-slate-500" />
                        <span className="text-sm text-slate-300">{a.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Confirmation Modal - Glass */}
      {showSendConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-8">
          <div className={`${glassCardStatic} rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl`}>
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                <span className="text-3xl">📨</span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">メールを送信</h2>
              <p className="text-sm text-slate-400">
                {to.length}名に送信します
                {cc.length > 0 && ` (Cc: ${cc.length}名)`}
                {bcc.length > 0 && ` (Bcc: ${bcc.length}名)`}
              </p>
            </div>
            <div className="border-t border-white/10 flex">
              <button onClick={() => setShowSendConfirm(false)} className="flex-1 py-4 text-slate-400 hover:text-white border-r border-white/10 transition-colors">キャンセル</button>
              <button onClick={() => { setShowSendConfirm(false); sendEmail() }} disabled={sending} className="flex-1 py-4 text-blue-400 font-semibold hover:text-blue-300 disabled:text-slate-600 transition-colors">
                {sending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipient List Import Modal - Glass */}
      {showRecipientListModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${glassCardStatic} rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl`}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <span className="text-base font-semibold text-white">📋 {recipientListTarget.toUpperCase()}に追加</span>
              <button onClick={() => setShowRecipientListModal(false)} className="text-blue-400 hover:text-blue-300 transition-colors">完了</button>
            </div>
            <div className="max-h-80 overflow-auto">
              {recipientLists.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm mb-4">宛先リストがありません</p>
                  <button onClick={() => { setShowRecipientListModal(false); router.push('/recipients') }} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-blue-400 text-sm font-medium transition-colors">
                    宛先管理で作成
                  </button>
                </div>
              ) : (
                <div>
                  {recipientLists.map(list => (
                    <button key={list.id} onClick={() => importFromList(list.id)} className="w-full text-left px-5 py-4 border-b border-white/5 hover:bg-white/5 flex items-center justify-between transition-colors">
                      <div>
                        <div className="text-sm text-white">{list.name}</div>
                        <div className="text-xs text-slate-500">{list.member_count}件</div>
                      </div>
                      <ChevronRight size={20} className="text-slate-600" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
