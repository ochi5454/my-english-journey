'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { API_BASE } from '../../../constants/excel'
import {
  ArrowLeft, Clock, Save, Loader, Calendar, Mail, Users, FileText
} from 'lucide-react'

interface ScheduledMailDetail {
  id: number
  to_addresses: string[]
  cc_addresses?: string[]
  bcc_addresses?: string[]
  subject: string
  body: string
  body_type: string
  attachments?: { filename: string }[]
  scheduled_at: string
  timezone: string
  status: string
  error_message?: string
  created_at: string
  updated_at: string
  sent_at?: string
}

export default function ScheduledEditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [mail, setMail] = useState<ScheduledMailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit form state
  const [toAddresses, setToAddresses] = useState<string>('')
  const [ccAddresses, setCcAddresses] = useState<string>('')
  const [bccAddresses, setBccAddresses] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [timezone, setTimezone] = useState('Asia/Tokyo')

  useEffect(() => {
    if (id) {
      fetchScheduledMail()
    }
  }, [id])

  const fetchScheduledMail = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/mail/schedule/${id}`, {
        credentials: 'include'
      })
      if (res.ok) {
        const data: ScheduledMailDetail = await res.json()
        setMail(data)

        // Initialize form fields
        setToAddresses(data.to_addresses.join(', '))
        setCcAddresses(data.cc_addresses?.join(', ') || '')
        setBccAddresses(data.bcc_addresses?.join(', ') || '')
        setSubject(data.subject)
        setBody(data.body)
        setTimezone(data.timezone)

        // Parse scheduled_at for date/time inputs
        const scheduledDateTime = new Date(data.scheduled_at)
        const localDate = scheduledDateTime.toISOString().split('T')[0]
        const localTime = scheduledDateTime.toTimeString().slice(0, 5)
        setScheduledDate(localDate)
        setScheduledTime(localTime)
      } else if (res.status === 404) {
        setError('予約送信が見つかりません')
      } else {
        setError('データの取得に失敗しました')
      }
    } catch (e) {
      setError('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!toAddresses.trim() || !subject.trim() || !body.trim()) {
      setError('宛先、件名、本文は必須です')
      return
    }

    if (!scheduledDate || !scheduledTime) {
      setError('予約日時を指定してください')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    // Parse addresses
    const toList = toAddresses.split(',').map(s => s.trim()).filter(s => s)
    const ccList = ccAddresses ? ccAddresses.split(',').map(s => s.trim()).filter(s => s) : null
    const bccList = bccAddresses ? bccAddresses.split(',').map(s => s.trim()).filter(s => s) : null

    // Create ISO datetime string
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()

    const payload = {
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject,
      body,
      scheduled_at: scheduledAt,
      timezone,
    }

    try {
      const res = await fetch(`${API_BASE}/mail/schedule/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setSuccess('予約送信を更新しました')
        setTimeout(() => {
          router.push('/scheduled')
        }, 1500)
      } else {
        const errorData = await res.json()
        setError(errorData.detail || '更新に失敗しました')
      }
    } catch (e) {
      setError('更新中にエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <Loader size={32} className="animate-spin mx-auto mb-4" />
          読み込み中...
        </div>
      </div>
    )
  }

  if (!mail) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-20 -left-40 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -right-40 w-80 h-80 bg-blue-600/15 rounded-full blur-[100px]" />
        </div>

        <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center justify-between px-4 h-14">
            <button
              onClick={() => router.push('/scheduled')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">戻る</span>
            </button>
            <h1 className="text-base font-semibold text-white absolute left-1/2 -translate-x-1/2">
              予約編集
            </h1>
            <div className="w-16" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center">
          <div className="text-center py-12">
            <Clock size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">{error || '予約送信が見つかりません'}</p>
            <button
              onClick={() => router.push('/scheduled')}
              className="mt-4 px-4 py-2 bg-purple-500/30 hover:bg-purple-400/30 border border-purple-400/30 rounded-xl text-white text-sm font-medium transition-colors"
            >
              一覧に戻る
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Only allow editing if status is pending
  const canEdit = mail.status === 'pending'

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
            onClick={() => router.push('/scheduled')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">戻る</span>
          </button>
          <h1 className="text-base font-semibold text-white absolute left-1/2 -translate-x-1/2">
            ✏️ 予約編集
          </h1>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
              <span className="text-sm font-medium">保存</span>
            </button>
          )}
          {!canEdit && <div className="w-16" />}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Status Banner */}
          {!canEdit && (
            <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-xl text-sm text-yellow-200 flex items-center gap-2">
              <Clock size={16} />
              ステータスが「{mail.status}」のため編集できません
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-200 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-xl text-sm text-green-200">
              {success}
            </div>
          )}

          <div className="space-y-6">
            {/* Schedule DateTime */}
            <div className={`${glassCard} rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-purple-400" />
                <h2 className="text-white font-medium">予約日時</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">日付</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white disabled:opacity-50 focus:outline-none focus:border-purple-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">時刻</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white disabled:opacity-50 focus:outline-none focus:border-purple-400/50"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-slate-400 mb-2">タイムゾーン</label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white disabled:opacity-50 focus:outline-none focus:border-purple-400/50"
                >
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
            </div>

            {/* Recipients */}
            <div className={`${glassCard} rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-blue-400" />
                <h2 className="text-white font-medium">宛先</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    <Mail size={14} className="inline mr-1" />
                    To (必須)
                  </label>
                  <input
                    type="text"
                    value={toAddresses}
                    onChange={e => setToAddresses(e.target.value)}
                    placeholder="カンマ区切りで複数指定可"
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">CC</label>
                  <input
                    type="text"
                    value={ccAddresses}
                    onChange={e => setCcAddresses(e.target.value)}
                    placeholder="カンマ区切りで複数指定可"
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">BCC</label>
                  <input
                    type="text"
                    value={bccAddresses}
                    onChange={e => setBccAddresses(e.target.value)}
                    placeholder="カンマ区切りで複数指定可"
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
              </div>
            </div>

            {/* Email Content */}
            <div className={`${glassCard} rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <FileText size={18} className="text-emerald-400" />
                <h2 className="text-white font-medium">メール内容</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">件名 (必須)</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="メールの件名"
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">本文 (必須)</label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="メールの本文"
                    rows={12}
                    disabled={!canEdit}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white resize-none placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
              </div>
            </div>

            {/* Attachments (Read-only) */}
            {mail.attachments && mail.attachments.length > 0 && (
              <div className={`${glassCard} rounded-xl p-4`}>
                <h2 className="text-white font-medium mb-4">添付ファイル</h2>
                <div className="flex flex-wrap gap-2">
                  {mail.attachments.map((att, i) => (
                    <span key={i} className="px-3 py-1.5 bg-slate-700 rounded-lg text-sm text-slate-300">
                      {att.filename}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  ※ 添付ファイルの変更はできません
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="text-xs text-slate-500 px-1">
              作成: {new Date(mail.created_at).toLocaleString('ja-JP')}
              {mail.updated_at !== mail.created_at && (
                <> | 更新: {new Date(mail.updated_at).toLocaleString('ja-JP')}</>
              )}
            </div>

            {/* Save Button (Mobile) */}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 bg-purple-500/30 hover:bg-purple-400/30 border border-purple-400/30 rounded-xl text-white font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    変更を保存
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
