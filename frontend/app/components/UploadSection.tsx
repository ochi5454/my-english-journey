import { useCallback, useState } from 'react'
import { UploadCloud, CloudUpload } from 'lucide-react'

type UploadSectionProps = {
  inputId?: string
  uploadedName?: string | null
  uploading: boolean
  uploadElapsedSec?: number
  uploadEstimateSec?: number | null
  activeKey?: string
  uploadMessage?: string | null
  uploadError?: string | null
  onFileSelected: (file?: File) => void
  onClear?: () => void
  rightContent?: React.ReactNode
}

export function UploadSection({
  inputId = 'excel-upload',
  uploadedName,
  uploading,
  uploadElapsedSec = 0,
  uploadEstimateSec = null,
  activeKey,
  uploadMessage,
  uploadError,
  onFileSelected,
  onClear,
  rightContent,
}: UploadSectionProps) {
  const [dragActive, setDragActive] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null | undefined) => {
      if (files && files.length > 0) {
        onFileSelected(files[0])
      }
    },
    [onFileSelected],
  )

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleBrowseClick = () => {
    const el = document.getElementById(inputId) as HTMLInputElement | null
    el?.click()
  }

  return (
    <section className="sheet-card" style={{ marginTop: '8px', width: '100%', alignSelf: 'stretch' }}>
      <div
        className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          id={inputId}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <label htmlFor={inputId} className="drop-zone-inner">
          <UploadCloud size={48} color="#7a7a7a" />
          <div className="drop-title">ファイルをドラッグ＆ドロップ</div>
          <div className="drop-sub">または</div>
          <button type="button" className="drop-button-big" onClick={handleBrowseClick}>
            <CloudUpload size={18} />
            <span>ファイルを選択</span>
          </button>
        </label>
      </div>

      {uploadMessage && <div className="text-sm text-green-700 mt-1">{uploadMessage}</div>}
      {uploadError && <div className="text-sm text-red-600 mt-1">エラー: {uploadError}</div>}
      {uploading && (
        <div className="text-sm text-slate-600 mt-1">
          {uploadEstimateSec !== null
            ? `推定残り: 約 ${Math.max((uploadEstimateSec ?? 0) - (uploadElapsedSec ?? 0), 0).toFixed(0)} 秒`
            : ''}
        </div>
      )}
    </section>
  )
}
