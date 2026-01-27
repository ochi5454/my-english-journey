import type { LucideIcon } from 'lucide-react'
import { CalendarPlus, Clock, Hash, Table2, TrendingUp, Download, Building2 } from 'lucide-react'
import { FileDef } from '../types/excel'

type SidebarProps = {
  defs: Record<string, FileDef>
  fileOrder: readonly string[]
  activeSheet: number
  onChangeSheet: (index: number) => void
  onCloseDownloadPanel: () => void
  showDownloadPanel: boolean
  onShowDownload: () => void
  showOvertimePanel: boolean
  onShowOvertime: () => void
}

export function Sidebar({
  defs,
  fileOrder,
  activeSheet,
  onChangeSheet,
  onCloseDownloadPanel,
  showDownloadPanel,
  onShowDownload,
  showOvertimePanel,
  onShowOvertime,
}: SidebarProps) {
  const iconMap: Record<string, LucideIcon> = {
    schedule_input: CalendarPlus,
    punches: Clock,
    days_items: Hash,
    tim_daily: Table2,
    person_progress: TrendingUp,
    org_info: Building2,
  }

  return (
    <aside className="dash-sidebar">
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
          実所定外時間 推計データ
        </div>
        <button className={`sidebar-download-btn ${showDownloadPanel ? 'active' : ''}`} onClick={onShowDownload}>
          <Download className="sidebar-icon" size={18} />
          <span>実所定外時間 推計データ</span>
        </button>
        <button className={`sidebar-download-btn ${showOvertimePanel ? 'active' : ''}`} onClick={onShowOvertime}>
          <Clock className="sidebar-icon" size={18} />
          <span>残業時間詳細</span>
        </button>
      </nav>
    </aside>
  )
}
