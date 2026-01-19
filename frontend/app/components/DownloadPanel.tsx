import { Download as DownloadIcon, XCircle, Trash2 } from 'lucide-react'
import { LegendItem } from '../types/excel'
import { SheetSummary } from './SheetSummary'

type DownloadPanelProps = {
  heading: string
  subtitle: string
  legend: LegendItem[]
  generating: boolean
  onCancel?: () => void
  onClear?: () => void
  toast: string | null
  onGenerate: () => Promise<void>
}

export function DownloadPanel({
  heading,
  subtitle,
  legend,
  generating,
  toast,
  onGenerate,
  onCancel,
  onClear,
}: DownloadPanelProps) {
  return (
    <>
      <SheetSummary heading={heading} subtitle={subtitle} legend={legend} />

      <section className="sheet-card" style={{ padding: '16px', width: '100%', alignSelf: 'stretch', marginTop: '12px' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="btn-outline-blue"
            style={{ opacity: generating ? 0.7 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
            disabled={generating}
            onClick={onGenerate}
          >
            <DownloadIcon size={18} />
            <span>{generating ? 'エクスポート中…' : 'エクスポート'}</span>
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-outline-orange"
              style={{ opacity: generating ? 1 : 0.6, cursor: generating ? 'pointer' : 'not-allowed' }}
              disabled={!generating}
              onClick={onCancel}
            >
              <XCircle size={18} />
              <span>中断</span>
            </button>
          )}
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
        {toast && <div className="text-sm text-slate-600 mt-2">{toast}</div>}
      </section>
    </>
  )
}
