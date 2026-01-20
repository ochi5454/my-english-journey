import { AlertTriangle, CheckCircle2, Download as DownloadIcon, Loader2, XCircle, Trash2 } from 'lucide-react'
import { LegendItem } from '../types/excel'
import { SheetSummary } from './SheetSummary'

type DownloadPanelProps = {
  heading: string
  subtitle: string
  legend: LegendItem[]
  exportStatus: 'idle' | 'exporting' | 'success' | 'error' | 'canceled'
  onCancel?: () => void
  onClear?: () => void
  toast: string | null
  onGenerate: () => Promise<void>
}

export function DownloadPanel({
  heading,
  subtitle,
  legend,
  exportStatus,
  toast,
  onGenerate,
  onCancel,
  onClear,
}: DownloadPanelProps) {
  const isExporting = exportStatus === 'exporting'
  const isError = exportStatus === 'error'
  const isSuccess = exportStatus === 'success'
  const isCanceled = exportStatus === 'canceled'

  const renderIcon = () => {
    if (isExporting) return <Loader2 className="spin" size={18} />
    if (isSuccess) return <CheckCircle2 size={18} />
    if (isError) return <AlertTriangle size={18} />
    return <DownloadIcon size={18} />
  }

  const label = (() => {
    if (isExporting) return 'エクスポート中…'
    if (isSuccess) return 'エクスポート完了'
    if (isError) return 'エクスポート失敗'
    if (isCanceled) return '中断しました'
    return 'エクスポート'
  })()

  const btnClass = isError ? 'btn-outline-red' : 'btn-outline-blue'

  return (
    <>
      <SheetSummary heading={heading} subtitle={subtitle} legend={legend} />

      <section className="sheet-card" style={{ padding: '16px', width: '100%', alignSelf: 'stretch', marginTop: '12px' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className={btnClass}
            style={{
              opacity: isExporting ? 0.7 : 1,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              minWidth: '150px',
            }}
            disabled={isExporting}
            onClick={onGenerate}
          >
            {renderIcon()}
            <span>{label}</span>
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-outline-orange"
              style={{ opacity: isExporting ? 1 : 0.6, cursor: isExporting ? 'pointer' : 'not-allowed' }}
              disabled={!isExporting}
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
