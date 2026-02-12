'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import {
  ArrowLeft, Clock, CheckCircle, XCircle, Ban,
  Edit2, Trash2, Loader, RefreshCw
} from 'lucide-react'

interface ScheduledMail {
  id: number
  to_addresses: string[]
  subject: string
  scheduled_at: string
  timezone: string
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
  created_at: string
}

export default function ScheduledPage() {
  const { } = useAuth()
  const router = useRouter()

  const [mails, setMails] = useState<ScheduledMail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    fetchScheduledMails()
  }, [statusFilter])

  const fetchScheduledMails = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = statusFilter
        ? `${API_BASE}/mail/schedule?status=${statusFilter}`
        : `${API_BASE}/mail/schedule`
      const res = await fetch(url, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setMails(data)
      } else {
        setError('予約送信の取得に失敗しました')
      }
    } catch (e) {
      setError('予約送信の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const cancelMail = async (id: number) => {
    if (!confirm('この予約送信をキャンセルしますか？')) return

    try {
      const res = await fetch(`${API_BASE}/mail/schedule/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        fetchScheduledMails()
      } else {
        setError('キャンセルに失敗しました')
      }
    } catch (e) {
      setError('キャンセル中にエラーが発生しました')
    }
  }

  const formatDate = (dateStr: string, tz: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ja-JP', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={20} className="text-blue-400" />
      case 'processing':
        return <Loader size={20} className="text-yellow-400 animate-spin" />
      case 'sent':
        return <CheckCircle size={20} className="text-green-400" />
      case 'failed':
        return <XCircle size={20} className="text-red-400" />
      case 'cancelled':
        return <Ban size={20} className="text-slate-400" />
      default:
        return <Clock size={20} className="text-slate-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-blue-900/50', text: 'text-blue-300', label: '送信待ち' },
      processing: { bg: 'bg-yellow-900/50', text: 'text-yellow-300', label: '処理中' },
      sent: { bg: 'bg-green-900/50', text: 'text-green-300', label: '送信完了' },
      failed: { bg: 'bg-red-900/50', text: 'text-red-300', label: '送信失敗' },
      cancelled: { bg: 'bg-slate-700', text: 'text-slate-300', label: 'キャンセル済み' },
    }
    const badge = badges[status] || badges.pending
    return (
      <span className={`px-2 py-1 ${badge.bg} ${badge.text} rounded-lg text-xs font-medium`}>
        {badge.label}
      </span>
    )
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
            📅 予約送信
          </h1>
          <button
            onClick={fetchScheduledMails}
            className="text-slate-400 hover:text-white transition-colors p-2"
            title="更新"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-200 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {/* Filter */}
          <div className="mb-6">
            <div className={`${glassCardStatic} rounded-xl p-1 flex`}>
              {[
                { value: '', label: 'すべて' },
                { value: 'pending', label: '送信待ち' },
                { value: 'sent', label: '完了' },
                { value: 'failed', label: '失敗' },
                { value: 'cancelled', label: 'キャンセル' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === option.value
                      ? 'bg-purple-500/30 text-white border border-purple-400/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader size={32} className="animate-spin mx-auto mb-4" />
              読み込み中...
            </div>
          ) : mails.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">予約送信がありません</p>
              <button
                onClick={() => router.push('/compose')}
                className="mt-4 px-4 py-2 bg-purple-500/30 hover:bg-purple-400/30 border border-purple-400/30 rounded-xl text-white text-sm font-medium transition-colors"
              >
                メールを作成
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                予約送信 ({mails.length}件)
              </h2>
              <div className={`${glassCardStatic} rounded-xl overflow-hidden`}>
                {mails.map((mail, index) => (
                  <div
                    key={mail.id}
                    className={`flex items-center justify-between p-4 hover:bg-white/5 transition-colors ${
                      index !== mails.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                        {getStatusIcon(mail.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">
                          {mail.subject || '(件名なし)'}
                        </div>
                        <div className="text-sm text-slate-400 truncate">
                          {mail.to_addresses.join(', ')}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(mail.scheduled_at, mail.timezone)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getStatusBadge(mail.status)}
                      {mail.status === 'pending' && (
                        <>
                          <button
                            onClick={() => router.push(`/scheduled/${mail.id}/edit`)}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                            title="編集"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => cancelMail(mail.id)}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                            title="キャンセル"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
