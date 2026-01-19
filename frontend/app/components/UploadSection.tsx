import { Download, Trash2 } from 'lucide-react'

type UploadSectionProps = {
  inputId?: string
  uploadedName?: string | null
  uploading: boolean
  uploadMessage?: string | null
  uploadError?: string | null
  onFileSelected: (file?: File) => void
  onClear?: () => void
}

export function UploadSection({
  inputId = 'excel-upload',
  uploadedName,
  uploading,
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
        {uploadedName && <span className="text-sm text-slate-600">選択中: {uploadedName}</span>}
      </div>
      {uploadMessage && <div className="text-sm text-green-700 mt-1">{uploadMessage}</div>}
      {uploadError && <div className="text-sm text-red-600 mt-1">エラー: {uploadError}</div>}
    </section>
  )
}
