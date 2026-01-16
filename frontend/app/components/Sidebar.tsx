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
  return (
    <aside className="dash-sidebar">
      <div className="sidebar-brand">時間外労働管理システム</div>
      <nav className="sidebar-nav">
        <div className="sidebar-label">ファイルアップロード</div>
        {fileOrder.map((key, idx) => {
          const active = idx === activeSheet
          return (
            <button
              key={key}
              onClick={() => {
                onChangeSheet(idx)
                onCloseDownloadPanel()
              }}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              <span>{defs[key]?.display_name || key}</span>
            </button>
          )
        })}
        <div className="sidebar-label" style={{ marginTop: '8px' }}>
          加工済みデータをダウンロード
        </div>
        <button className={`sidebar-download-btn ${showDownloadPanel ? 'active' : ''}`} onClick={onShowDownload}>
          加工済みデータのダウンロード
        </button>
      </nav>
    </aside>
  )
}
