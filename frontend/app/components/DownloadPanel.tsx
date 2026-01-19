import { Download as DownloadIcon } from 'lucide-react'
import { LegendItem } from '../types/excel'
import { SheetSummary } from './SheetSummary'

type DownloadPanelProps = {
  heading: string
  subtitle: string
  legend: LegendItem[]
  generating: boolean
  toast: string | null
  onGenerate: () => Promise<void>
}

export function DownloadPanel({ heading, subtitle, legend, generating, toast, onGenerate }: DownloadPanelProps) {
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
        </div>
        {toast && <div className="text-sm text-slate-600 mt-2">{toast}</div>}
      </section>
    </>
  )
}
