import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

type DownloadPanelProps = {
  heading: string
  subtitle: string
  onClear?: () => void
  toast: string | null
  rightContent?: ReactNode
}

export function DownloadPanel({
  heading,
  subtitle,
  toast,
  onClear,
  rightContent,
}: DownloadPanelProps) {
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
        {toast && <div className="text-sm text-slate-600 mt-2">{toast}</div>}
      </section>
    </>
  )
}
