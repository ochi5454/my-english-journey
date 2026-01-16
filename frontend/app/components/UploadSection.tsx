type UploadSectionProps = {
  inputId?: string
  uploadedName?: string | null
  uploading: boolean
  uploadMessage?: string | null
  uploadError?: string | null
  onFileSelected: (file?: File) => void
}

export function UploadSection({
  inputId = 'excel-upload',
  uploadedName,
  uploading,
  uploadMessage,
  uploadError,
  onFileSelected,
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
          className="jfa-button"
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          エクセルをアップロード
        </label>
        {uploadedName && <span className="text-sm text-slate-600">選択中: {uploadedName}</span>}
      </div>
      <div className="text-xs text-slate-500 mt-2">※アップロードされたファイルは今後の取り込み処理に利用できます。</div>
      {uploadMessage && <div className="text-sm text-green-700 mt-1">{uploadMessage}</div>}
      {uploadError && <div className="text-sm text-red-600 mt-1">エラー: {uploadError}</div>}
      {uploading && <div className="text-sm text-slate-600 mt-1">アップロード中…</div>}
    </section>
  )
}
