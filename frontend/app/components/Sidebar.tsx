import type { LucideIcon } from 'lucide-react'
import { CalendarPlus, Clock, Hash, Table2, TrendingUp, Download } from 'lucide-react'
import { FileDef } from '../types/excel'

type SidebarProps = {
  defs: Record<string, FileDef>
  fileOrder: readonly string[]
  activeSheet: number
  onChangeSheet: (index: number) => void
  onCloseDownloadPanel: () => void
  showDownloadPanel: boolean
  onShowDownload: () => void
}

export function Sidebar({
  defs,
  fileOrder,
  activeSheet,
  onChangeSheet,
  onCloseDownloadPanel,
  showDownloadPanel,
  onShowDownload,
}: SidebarProps) {
  const iconMap: Record<string, LucideIcon> = {
    schedule_input: CalendarPlus,
    punches: Clock,
    days_items: Hash,
    tim_daily: Table2,
    person_progress: TrendingUp,
  }

  return (
    <aside className="dash-sidebar">
      <div className="sidebar-brand">時間外労働管理システム</div>
      <div className="sidebar-divider" />
      <nav className="sidebar-nav">
        <div className="sidebar-label">ファイルをインポート</div>
        {fileOrder.map((key, idx) => {
          const active = idx === activeSheet
          const Icon = iconMap[key]
          return (
            <button
              key={key}
              onClick={() => {
                onChangeSheet(idx)
                onCloseDownloadPanel()
              }}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              {Icon ? <Icon className="sidebar-icon" size={18} /> : null}
              <span>{defs[key]?.display_name || key}</span>
            </button>
          )
        })}
        <div className="sidebar-label" style={{ marginTop: '8px' }}>
          データをエクスポート
        </div>
        <button className={`sidebar-download-btn ${showDownloadPanel ? 'active' : ''}`} onClick={onShowDownload}>
          <Download className="sidebar-icon" size={18} />
          <span>データをエクスポート</span>
        </button>
      </nav>
    </aside>
  )
}
