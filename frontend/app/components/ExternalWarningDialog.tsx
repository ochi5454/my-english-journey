'use client'

import { AlertTriangle, ExternalLink, X, Send, Shield } from 'lucide-react'

interface ExternalRecipient {
  email: string
  domain: string
}

interface ExternalWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  externalRecipients: ExternalRecipient[]
  internalCount: number
}

export function ExternalWarningDialog({
  isOpen,
  onClose,
  onConfirm,
  externalRecipients,
  internalCount,
}: ExternalWarningDialogProps) {
  if (!isOpen) return null

  const glassCard = "backdrop-blur-xl bg-white/5 border border-white/10"

  // ドメインごとにグループ化
  const groupedByDomain = externalRecipients.reduce((acc, recipient) => {
    if (!acc[recipient.domain]) {
      acc[recipient.domain] = []
    }
    acc[recipient.domain].push(recipient.email)
    return acc
  }, {} as Record<string, string[]>)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`${glassCard} rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">社外への送信確認</h2>
              <p className="text-sm text-slate-400">外部宛先が含まれています</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Warning Banner */}
          <div className="p-4 bg-orange-500/10 border border-orange-400/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-orange-200 font-medium">
                  以下の宛先は社外（外部）のメールアドレスです
                </p>
                <p className="text-xs text-orange-300/70 mt-1">
                  社外への送信は情報漏洩のリスクがあります。宛先をご確認ください。
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="flex gap-3">
            <div className="flex-1 p-3 bg-blue-500/10 border border-blue-400/20 rounded-xl text-center">
              <div className="text-2xl font-bold text-blue-300">{internalCount}</div>
              <div className="text-xs text-blue-400">社内宛先</div>
            </div>
            <div className="flex-1 p-3 bg-orange-500/10 border border-orange-400/20 rounded-xl text-center">
              <div className="text-2xl font-bold text-orange-300">{externalRecipients.length}</div>
              <div className="text-xs text-orange-400">社外宛先</div>
            </div>
          </div>

          {/* External Recipients List */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-300">社外宛先一覧</div>
            {Object.entries(groupedByDomain).map(([domain, emails]) => (
              <div
                key={domain}
                className="p-3 bg-orange-500/5 border border-orange-400/20 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-orange-400" />
                  <span className="text-xs font-medium text-orange-300">{domain}</span>
                  <span className="text-xs text-slate-500">({emails.length}件)</span>
                </div>
                <div className="space-y-1">
                  {emails.map((email, i) => (
                    <div
                      key={i}
                      className="text-sm text-white pl-5 truncate"
                    >
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <p className="text-xs text-center text-slate-400">
            このまま送信してもよろしいですか？
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 bg-orange-500/30 backdrop-blur-sm border border-orange-400/30 rounded-xl text-white font-medium hover:bg-orange-400/30 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={18} />
              確認して送信
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
