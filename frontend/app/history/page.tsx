'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'
import { ArrowLeft, Clock, CheckCircle, XCircle, Loader, X, Mail, ChevronRight, Trash2 } from 'lucide-react'

interface MailLog {
  id: number
  to_addresses: string[]
  cc_addresses?: string[]
  bcc_addresses?: string[]
  subject: string
  body: string
  status: 'success' | 'failed' | 'pending'
  error_message?: string
  sent_at: string
}

export default function HistoryPage() {
  const { } = useAuth()
  const router = useRouter()

  const [logs, setLogs] = useState<MailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<MailLog | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => {
    fetchLogs()
  }, [statusFilter])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const url = statusFilter
        ? `${API_BASE}/mail/logs?status=${statusFilter}`
        : `${API_BASE}/mail/logs`
      const res = await fetch(url, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLogs(data)
      } else {
        setError('送信履歴の取得に失敗しました')
      }
    } catch (e) {
      setError('送信履歴の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={20} className="text-green-400" />
      case 'failed':
        return <XCircle size={20} className="text-red-400" />
      case 'pending':
        return <Loader size={20} className="text-yellow-400 animate-spin" />
      default:
        return <Clock size={20} className="text-slate-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded-lg text-xs font-medium">送信完了</span>
      case 'failed':
        return <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded-lg text-xs font-medium">送信失敗</span>
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 rounded-lg text-xs font-medium">送信中</span>
      default:
        return <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs font-medium">{status}</span>
    }
  }

  const openDetail = (log: MailLog) => {
    setSelectedLog(log)
    setShowDetailModal(true)
  }

  const deleteLog = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この送信履歴を削除しますか？')) return

    try {
      const res = await fetch(`${API_BASE}/mail/logs/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        setLogs(prev => prev.filter(l => l.id !== id))
        if (selectedLog?.id === id) {
          setSelectedLog(null)
          setShowDetailModal(false)
        }
      } else {
        setError('削除に失敗しました')
      }
    } catch (e) {
      setError('削除中にエラーが発生しました')
    }
  }

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
          <h1 className="text-white font-semibold">送信履歴</h1>
          <div className="w-16" /> {/* Spacer for centering */}
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

          {/* Filter */}
          <div className="mb-6">
            <div className="bg-[#1A2942] rounded-xl border border-[#2A3F5F] p-1 flex">
              {[
                { value: '', label: 'すべて' },
                { value: 'success', label: '完了' },
                { value: 'failed', label: '失敗' },
                { value: 'pending', label: '送信中' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === option.value
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">送信履歴がありません</p>
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                送信履歴 ({logs.length}件)
              </h2>
              <div className="bg-[#1A2942] rounded-xl border border-[#2A3F5F] overflow-hidden">
                {logs.map((log, index) => (
                  <div
                    key={log.id}
                    onClick={() => openDetail(log)}
                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-[#243550] transition-colors ${
                      index !== logs.length - 1 ? 'border-b border-[#2A3F5F]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                        {getStatusIcon(log.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">
                          {log.subject || '(件名なし)'}
                        </div>
                        <div className="text-sm text-slate-400 truncate">
                          {log.to_addresses.join(', ')}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDate(log.sent_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getStatusBadge(log.status)}
                      <ChevronRight size={20} className="text-slate-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A2942] rounded-2xl border border-[#2A3F5F] w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#2A3F5F]">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">送信詳細</h2>
                {getStatusBadge(selectedLog.status)}
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {selectedLog.status === 'failed' && selectedLog.error_message && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-xl">
                  <div className="text-sm text-red-300 font-medium mb-1">エラー内容</div>
                  <div className="text-sm text-red-200">{selectedLog.error_message}</div>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-2">宛先 (To)</label>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.to_addresses.map((addr, i) => (
                    <span key={i} className="px-3 py-1.5 bg-blue-900/50 border border-blue-700 rounded-lg text-sm text-blue-200 flex items-center gap-1">
                      <Mail size={12} />
                      {addr}
                    </span>
                  ))}
                </div>
              </div>

              {selectedLog.cc_addresses && selectedLog.cc_addresses.length > 0 && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">CC</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedLog.cc_addresses.map((addr, i) => (
                      <span key={i} className="px-3 py-1.5 bg-green-900/50 border border-green-700 rounded-lg text-sm text-green-200">
                        {addr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.bcc_addresses && selectedLog.bcc_addresses.length > 0 && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">BCC</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedLog.bcc_addresses.map((addr, i) => (
                      <span key={i} className="px-3 py-1.5 bg-purple-900/50 border border-purple-700 rounded-lg text-sm text-purple-200">
                        {addr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-2">送信日時</label>
                <div className="text-white">{formatDate(selectedLog.sent_at)}</div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">件名</label>
                <div className="p-3 bg-[#0F1C2E] rounded-xl text-white">
                  {selectedLog.subject || '(件名なし)'}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">本文</label>
                <div className="p-3 bg-[#0F1C2E] rounded-xl whitespace-pre-wrap text-sm text-white">
                  {selectedLog.body}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
