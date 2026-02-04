import { LegendItem } from '../types/excel'
import { LegendList } from './LegendList'

type SheetSummaryProps = {
  heading: string
  subtitle: string
  legend: LegendItem[]
  className?: string
}

export function SheetSummary({ heading, subtitle, legend, className = '' }: SheetSummaryProps) {
  return (
    <section className={`sheet-card ${className}`} style={{ padding: '16px', width: '100%', alignSelf: 'stretch' }}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-2xl font-bold text-[var(--jfa-navy)]">{heading}</div>
          <div className="text-sm text-slate-600">{subtitle}</div>
        </div>
        <LegendList legend={legend} />
      </div>
    </section>
  )
}
