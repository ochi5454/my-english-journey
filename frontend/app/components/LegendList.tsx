import { LegendItem } from '../types/excel'

type LegendListProps = {
  legend: LegendItem[]
}

export function LegendList({ legend }: LegendListProps) {
  return (
    <div className="sheet-legend">
      {legend.map((item) => (
        <div key={item.label} className="sheet-legend-row">
          <span className="sheet-legend-chip" style={{ background: item.bg, color: item.color }}>
            {item.label}
          </span>
          <span className="sheet-legend-text">{item.desc}</span>
        </div>
      ))}
    </div>
  )
}
