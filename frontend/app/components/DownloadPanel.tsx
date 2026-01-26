import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

type DownloadPanelProps = {
  heading: string
  subtitle: string
  onClear?: () => void
  toast: string | null
  rightContent?: ReactNode
  etaSeconds?: number | null
}

export function DownloadPanel({
  heading,
  subtitle,
  toast,
  onClear,
  rightContent,
  etaSeconds = null,
}: DownloadPanelProps) {
  const etaLabel =
    etaSeconds == null
      ? ''
      : etaSeconds === 0
        ? 'まもなく完了'
        : `計算中… 残り約${etaSeconds}秒`

  return (
    <>
      <section className="sheet-card" style={{ padding: '16px', width: '100%', alignSelf: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3 flex-wrap">
            {onClear && (
              <button
                type="button"
                className="btn-outline-red"
                style={{ cursor: 'pointer' }}
                onClick={onClear}
              >
                <Trash2 size={18} />
                <span>削除</span>
              </button>
            )}
          </div>
          {rightContent && <div style={{ marginLeft: 'auto' }}>{rightContent}</div>}
        </div>
        {etaLabel && (
          <div className="text-sm text-slate-700 mt-2" aria-live="polite">
            {etaLabel}
          </div>
        )}
        {toast && <div className="text-sm text-slate-600 mt-2">{toast}</div>}
      </section>
    </>
  )
}
