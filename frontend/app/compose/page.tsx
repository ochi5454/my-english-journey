'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { RecipientInput, Recipient } from '../components/RecipientInput'
import { SendButton } from '../components/SendButton'
import { ScheduleModal } from '../components/ScheduleModal'
import { ArrowLeft, Bot, Paperclip, Send, Eye, ChevronRight, PenTool, ChevronDown, Sparkles, Users, Check, Search, X } from 'lucide-react'
import { AIRecipientFilter, FilteredMember } from '../components/AIRecipientFilter'
import { RecipientValidationDialog, ValidationWarning } from '../components/RecipientValidationDialog'
import { MailingListSuggestionDialog } from '../components/MailingListSuggestionDialog'

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

interface Signature {
  id: number
  name: string
  content: string
  is_default: boolean
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

  // 宛先をTo/Cc/Bcc間で移動する
  const moveRecipient = (recipient: Recipient, fromField: string, toField: 'To' | 'Cc' | 'Bcc') => {
    // 移動元から削除
    if (fromField === 'To') setTo(prev => prev.filter(r => r.email !== recipient.email))
    if (fromField === 'Cc') setCc(prev => prev.filter(r => r.email !== recipient.email))
    if (fromField === 'Bcc') setBcc(prev => prev.filter(r => r.email !== recipient.email))
    // 移動先に追加（重複チェック）
    const addIfNotExists = (prev: Recipient[]) =>
      prev.some(r => r.email === recipient.email) ? prev : [...prev, recipient]
    if (toField === 'To') setTo(addIfNotExists)
    if (toField === 'Cc') setCc(addIfNotExists)
    if (toField === 'Bcc') setBcc(addIfNotExists)
  }

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

  // AI filtering
  const [showAIFilter, setShowAIFilter] = useState(false)
  const [aiFilterListId, setAiFilterListId] = useState<number | null>(null)

  // Entra validation
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([])
  const [pendingImportListId, setPendingImportListId] = useState<number | null>(null)

  // Mailing list suggestion (送信時にメーリングリストへ追加を提案)
  const [showMailingListSuggestion, setShowMailingListSuggestion] = useState(false)

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)

  // Signatures
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)

  // Recipient list modal target
  // (search is now handled inside RecipientInput component)

  // AI Chat
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [isComposing, setIsComposing] = useState(false)  // IME変換中フラグ
  const chatMessagesRef = useRef<HTMLDivElement>(null)  // チャット履歴スクロール用
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

  // Fetch templates, recipient lists, and signatures on mount
  useEffect(() => {
    fetchTemplates()
    fetchRecipientLists()
    fetchSignatures()
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

  const fetchSignatures = async () => {
    try {
      const res = await fetch(`${API_BASE}/signatures`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSignatures(data)
      }
    } catch (e) {
      console.error('Failed to fetch signatures:', e)
    }
  }

  // AIチャット履歴の自動スクロール
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [aiMessages, aiLoading])

  // 成功メッセージを10秒後に自動で消す
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (scheduleSuccess) {
      const timer = setTimeout(() => setScheduleSuccess(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [scheduleSuccess])

  const insertSignature = (signature: Signature) => {
    const separator = body.trim() ? '\n\n' : ''
    setBody(prev => prev + separator + signature.content)
    setShowSignatureDropdown(false)
  }

  // AI Filter handlers
  const openAIFilter = (listId: number) => {
    setAiFilterListId(listId)
    setShowAIFilter(true)
  }

  const handleAIFilterComplete = (selectedMembers: FilteredMember[]) => {
    const newRecipients = selectedMembers.map(m => ({
      email: m.email,
      name: m.name,
      department: m.department,
    }))

    const setter = recipientListTarget === 'to' ? setTo : recipientListTarget === 'cc' ? setCc : setBcc
    const current = recipientListTarget === 'to' ? to : recipientListTarget === 'cc' ? cc : bcc

    const existingEmails = new Set(current.map(r => r.email))
    const toAdd = newRecipients.filter(r => !existingEmails.has(r.email))
    setter([...current, ...toAdd])

    setShowAIFilter(false)
    setAiFilterListId(null)
    setShowRecipientListModal(false)
  }

  const cancelAIFilter = () => {
    setShowAIFilter(false)
    setAiFilterListId(null)
  }

  // Entra validation handlers
  const validateAndImportFromList = async (listId: number) => {
    try {
      // First, validate against Entra
      const validateRes = await fetch(`${API_BASE}/recipients/lists/${listId}/validate`, {
        method: 'POST',
        credentials: 'include',
      })

      if (validateRes.ok) {
        const validationResult = await validateRes.json()

        if (validationResult.requires_confirmation && validationResult.warnings.length > 0) {
          // Show validation dialog
          setValidationWarnings(validationResult.warnings)
          setPendingImportListId(listId)
          setShowValidationDialog(true)
          return
        }
      }

      // No warnings or validation failed - import directly
      await importFromList(listId)
    } catch (e) {
      console.error('Validation failed, importing directly:', e)
      await importFromList(listId)
    }
  }

  const handleValidationConfirm = async (selectedEmails: string[]) => {
    // 送信時の検証からの確認の場合
    if (!pendingImportListId) {
      setShowValidationDialog(false)
      setValidationWarnings([])
      // 選択されたメールアドレスのみ残して送信
      const selectedSet = new Set(selectedEmails)
      setTo(prev => prev.filter(r => selectedSet.has(r.email)))
      setCc(prev => prev.filter(r => selectedSet.has(r.email)))
      setBcc(prev => prev.filter(r => selectedSet.has(r.email)))
      // 検証をスキップして送信
      setTimeout(() => sendEmail(true), 100)
      return
    }

    try {
      const res = await fetch(`${API_BASE}/recipients/lists/${pendingImportListId}`, { credentials: 'include' })
      if (res.ok) {
        const data: RecipientListDetail = await res.json()
        // Only import selected emails
        const newRecipients = data.members
          .filter(m => selectedEmails.includes(m.email))
          .map(m => ({
            email: m.email,
            name: m.name,
            department: m.department,
          }))

        const setter = recipientListTarget === 'to' ? setTo : recipientListTarget === 'cc' ? setCc : setBcc
        const current = recipientListTarget === 'to' ? to : recipientListTarget === 'cc' ? cc : bcc

        const existingEmails = new Set(current.map(r => r.email))
        const toAdd = newRecipients.filter(r => !existingEmails.has(r.email))
        setter([...current, ...toAdd])
      }
    } catch (e) {
      console.error('Failed to import from list:', e)
    } finally {
      setShowValidationDialog(false)
      setValidationWarnings([])
      setPendingImportListId(null)
      setShowRecipientListModal(false)
    }
  }

  const handleValidationClose = () => {
    setShowValidationDialog(false)
    setValidationWarnings([])
    setPendingImportListId(null)
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

  // ログインユーザーのドメインを取得（@以降）
  const userDomain = user?.email?.split('@')[1]?.toLowerCase() || ''

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

  // 宛先追加時の検証（Entra + 社外チェック）
  const validateRecipient = useCallback(async (email: string): Promise<{ isExternal: boolean; isVerified: boolean; error?: string }> => {
    const domain = email.split('@')[1]?.toLowerCase() || ''
    const isExternal = userDomain ? domain !== userDomain : false

    try {
      // 単一アドレスの検証API呼び出し
      const res = await fetch(`${API_BASE}/mail/validate-recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: [email],
          cc: [],
          bcc: [],
        }),
      })

      if (res.ok) {
        const result = await res.json()
        const warning = result.warnings?.find((w: any) => w.email === email)
        return {
          isExternal,
          isVerified: !warning || warning.warning_type !== 'not_found',
          error: warning?.message,
        }
      }
      return { isExternal, isVerified: true }
    } catch (e) {
      console.error('Validation failed:', e)
      return { isExternal, isVerified: true, error: '検証に失敗しました' }
    }
  }, [userDomain])

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

  const sendAiMessage = async (quickMessage?: string) => {
    const messageContent = quickMessage || aiInput
    if (!messageContent.trim()) return
    const userMessage = { role: 'user', content: messageContent }
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

  // 送信前の宛先検証（Entra + 社外チェック）
  const validateRecipientsBeforeSend = async (): Promise<boolean> => {
    if (to.length === 0) return true

    try {
      const res = await fetch(`${API_BASE}/mail/validate-recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: to.map(r => r.email),
          cc: cc.length > 0 ? cc.map(r => r.email) : [],
          bcc: bcc.length > 0 ? bcc.map(r => r.email) : [],
        }),
      })

      if (res.ok) {
        const result = await res.json()
        if (result.requires_confirmation && result.warnings?.length > 0) {
          setValidationWarnings(result.warnings)
          setShowValidationDialog(true)
          return false // ダイアログで確認待ち
        }
      }
      return true
    } catch (e) {
      console.error('Validation failed:', e)
      return true // 検証失敗時は送信を許可
    }
  }

  const sendEmail = async (skipValidation = false, skipMailingListSuggestion = false) => {
    if (to.length === 0) { setError('宛先を指定してください'); return }
    if (!subject.trim()) { setError('件名を入力してください'); return }

    // 検証をスキップしない場合は事前チェック
    if (!skipValidation) {
      const canProceed = await validateRecipientsBeforeSend()
      if (!canProceed) return
    }

    // メーリングリスト追加提案（スキップしない場合）
    if (!skipMailingListSuggestion && (to.length > 0 || cc.length > 0 || bcc.length > 0)) {
      setShowMailingListSuggestion(true)
      return
    }

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

  // メーリングリスト追加後の送信処理
  const handleMailingListConfirm = (addedToList: boolean) => {
    setShowMailingListSuggestion(false)
    // 検証とメーリングリスト提案をスキップして実際に送信
    sendEmail(true, true)
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
    <div className="h-screen bg-slate-950 flex flex-col relative overflow-hidden">
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
            onClick={() => sendEmail()}
            disabled={sending || to.length === 0}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500/80 backdrop-blur-sm text-white disabled:opacity-30 hover:bg-blue-400/80 transition-all border border-blue-400/30"
          >
            <Send size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto pb-20">
          {/* Error Alert (エラーは上部に表示) */}
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
              onValidateRecipient={validateRecipient}
              userDomain={userDomain}
              onOpenList={() => { setRecipientListTarget('to'); setShowRecipientListModal(true) }}
              onDrop={(recipient, fromField) => moveRecipient(recipient, fromField, 'To')}
              placeholder="宛先を追加..."
              className="border-b border-white/5"
            />

            {/* Cc */}
            <RecipientInput
              label="Cc"
              value={cc}
              onChange={setCc}
              onSearch={searchRecipients}
              onValidateRecipient={validateRecipient}
              userDomain={userDomain}
              onOpenList={() => { setRecipientListTarget('cc'); setShowRecipientListModal(true) }}
              onDrop={(recipient, fromField) => moveRecipient(recipient, fromField, 'Cc')}
              className="border-b border-white/5"
            />

            {/* Bcc */}
            <RecipientInput
              label="Bcc"
              value={bcc}
              onChange={setBcc}
              onSearch={searchRecipients}
              onValidateRecipient={validateRecipient}
              userDomain={userDomain}
              onOpenList={() => { setRecipientListTarget('bcc'); setShowRecipientListModal(true) }}
              onDrop={(recipient, fromField) => moveRecipient(recipient, fromField, 'Bcc')}
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
            {/* Signature Insert */}
            <div className="px-4 py-2 border-t border-white/5 flex justify-end relative">
              <div className="relative">
                <button
                  onClick={() => setShowSignatureDropdown(!showSignatureDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white text-sm transition-colors"
                >
                  <PenTool size={14} />
                  署名を挿入
                  <ChevronDown size={14} className={`transition-transform ${showSignatureDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showSignatureDropdown && (
                  <div className="absolute bottom-full right-0 mb-1 w-56 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl overflow-hidden z-10">
                    {signatures.length === 0 ? (
                      <div className="p-3 text-center">
                        <p className="text-xs text-slate-500 mb-2">署名がありません</p>
                        <button
                          onClick={() => { setShowSignatureDropdown(false); window.open('/signatures', '_blank') }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          署名を作成 →
                        </button>
                      </div>
                    ) : (
                      <>
                        {signatures.map(sig => (
                          <button
                            key={sig.id}
                            onClick={() => insertSignature(sig)}
                            className="w-full text-left px-3 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-b-0 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white">{sig.name}</span>
                              {sig.is_default && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">デフォルト</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{sig.content.split('\n')[0]}</div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
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
          <div className="mx-4 mt-4 mb-2 flex gap-3">
            <button onClick={() => setShowPreview(true)} className={`flex-1 flex items-center justify-center gap-2 py-3 ${glassCard} rounded-2xl text-slate-300 font-medium transition-all`}>
              <Eye size={18} />
              プレビュー
            </button>
            <SendButton
              onSendNow={() => sendEmail()}
              onSchedule={() => setShowScheduleModal(true)}
              sending={sending}
              disabled={to.length === 0}
            />
          </div>

          {/* Success Messages - 送信ボタン付近に表示、10秒で自動消去 */}
          {success && (
            <div className={`mx-4 mb-4 p-4 ${glassCardStatic} rounded-xl text-emerald-300 text-sm bg-emerald-500/10 animate-pulse`}>
              ✅ メールを送信しました
            </div>
          )}
          {scheduleSuccess && (
            <div className={`mx-4 mb-4 p-4 ${glassCardStatic} rounded-xl text-purple-300 text-sm bg-purple-500/10 animate-pulse`}>
              📅 メールを予約しました
            </div>
          )}

          {/* Schedule Modal */}
          <ScheduleModal
            isOpen={showScheduleModal}
            onClose={() => setShowScheduleModal(false)}
            onSchedule={scheduleEmail}
          />
        </div>

        {/* AI Panel - Glass */}
        {showAiPanel && (
          <div className="w-80 h-full border-l border-white/10 backdrop-blur-xl bg-slate-900/50 flex flex-col overflow-hidden">
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
            <div ref={chatMessagesRef} className="flex-1 min-h-0 p-3 overflow-y-auto">
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

            {/* Input - Teams風操作感 */}
            <div className="p-3 border-t border-white/10 flex-shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onKeyDown={e => {
                    // IME変換中は送信しない
                    if (isComposing) return
                    // Shift+Enter → 改行（デフォルト動作）
                    if (e.key === 'Enter' && e.shiftKey) return
                    // Enter → 送信
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      // 空文字・空白のみは送信しない
                      if (!aiInput.trim()) return
                      sendAiMessage()
                    }
                  }}
                  placeholder="メッセージを入力...（Shift+Enterで改行）"
                  rows={1}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-sm text-white outline-none placeholder-slate-500 focus:border-blue-400/50 transition-colors resize-none max-h-32 overflow-y-auto"
                  style={{ minHeight: '40px' }}
                />
                <button
                  onClick={() => {
                    if (!aiInput.trim()) return
                    sendAiMessage()
                  }}
                  disabled={aiLoading || !aiInput.trim()}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-blue-500/30 text-white rounded-full hover:bg-blue-400/30 disabled:opacity-30 transition-all border border-blue-400/30"
                >
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
          <div className={`${glassCardStatic} rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]`}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <span className="text-base font-semibold text-white">📋 宛先({recipientListTarget.toUpperCase()})に追加</span>
              <button onClick={() => setShowRecipientListModal(false)} className="text-blue-400 hover:text-blue-300 transition-colors">完了</button>
            </div>
            <div className="flex-1 overflow-auto">
              {recipientLists.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm mb-4">宛先リストがありません</p>
                  <button onClick={() => { setShowRecipientListModal(false); router.push('/recipients') }} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-blue-400 text-sm font-medium transition-colors">
                    メーリングリストで作成
                  </button>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {recipientLists.map(list => (
                    <div
                      key={list.id}
                      className="p-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-all"
                    >
                      {/* リスト情報 */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                          <Users size={16} className="text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{list.name}</div>
                          <div className="text-xs text-slate-500">{list.member_count}名のメンバー</div>
                        </div>
                      </div>

                      {/* アクションボタン */}
                      <div className="flex gap-2">
                        {/* AIフィルタボタン */}
                        <button
                          onClick={() => openAIFilter(list.id)}
                          className="flex-1 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 rounded-lg text-purple-300 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                        >
                          <Sparkles size={12} />
                          AIで絞り込み
                        </button>
                        {/* 全員追加ボタン (Entra検証付き) */}
                        <button
                          onClick={() => validateAndImportFromList(list.id)}
                          className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg text-emerald-300 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                        >
                          <Check size={12} />
                          全員を追加
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Filter Modal */}
      {showAIFilter && aiFilterListId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className={`${glassCardStatic} rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]`}>
            <AIRecipientFilter
              listId={aiFilterListId}
              onFilterComplete={handleAIFilterComplete}
              onCancel={cancelAIFilter}
            />
          </div>
        </div>
      )}

      {/* Entra Validation Dialog */}
      <RecipientValidationDialog
        isOpen={showValidationDialog}
        onClose={handleValidationClose}
        onConfirm={handleValidationConfirm}
        warnings={validationWarnings}
      />

      {/* Mailing List Suggestion Dialog */}
      <MailingListSuggestionDialog
        isOpen={showMailingListSuggestion}
        onClose={() => setShowMailingListSuggestion(false)}
        onConfirm={handleMailingListConfirm}
        recipients={{ to, cc, bcc }}
      />
    </div>
  )
}
