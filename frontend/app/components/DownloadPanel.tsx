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
    <section className="sheet-card" style={{ padding: '16px', width: '100%', alignSelf: 'stretch' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-700">Excel生成してダウンロード</label>
        <button
          className="jfa-button"
          style={{ opacity: generating ? 0.7 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
          disabled={generating}
          onClick={onGenerate}
        >
          {generating ? '生成中…' : '生成してダウンロード'}
        </button>
      </div>
      {toast && <div className="text-sm text-slate-600 mt-2">{toast}</div>}

      <SheetSummary heading={heading} subtitle={subtitle} legend={legend} className="mt-3" />
    </section>
  )
}
