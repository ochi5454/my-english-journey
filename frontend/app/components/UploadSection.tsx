import { Download, Trash2 } from 'lucide-react'

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
}: UploadSectionProps) {
  return (
    <section className="sheet-card" style={{ marginTop: '8px', width: '100%', alignSelf: 'stretch' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          id={inputId}
          onChange={(e) => onFileSelected(e.target.files?.[0])}
        />
        <label
          htmlFor={inputId}
          className="btn-outline-blue"
          style={{ cursor: 'pointer' }}
        >
          <Download size={18} />
          <span>インポート</span>
        </label>
        <button
          type="button"
          className="btn-outline-red"
          onClick={onClear}
          style={{ cursor: 'pointer' }}
        >
          <Trash2 size={18} />
          <span>削除</span>
        </button>
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
