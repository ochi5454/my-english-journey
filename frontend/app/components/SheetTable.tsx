type SheetTableProps = {
  headers: string[]
  rows: string[][]
  title: string
  loading?: boolean
  error?: string | null
}

export function SheetTable({ headers, rows, title, loading = false, error = null }: SheetTableProps) {
  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {loading && <div className="text-sm text-slate-600 mb-2">読み込み中…</div>}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="sheet-table-wrapper">
        <div className="sheet-table">
          <div className="sheet-row sheet-header-band">
            <div className="sheet-cell sheet-title" style={{ width: Math.max(headers.length * 110, 320) }}>
              {title}
            </div>
          </div>
          <div className="sheet-row sheet-header">
            {headers.map((titleText, idx) => (
              <div
                key={`${titleText}-${idx}`}
                className="sheet-cell"
                style={{
                  width: titleText.length > 10 ? 140 : 110,
                  background: '#fdfbf6',
                  fontWeight: 700,
                }}
              >
                {titleText}
              </div>
            ))}
          </div>
          {rows.map((row, rIdx) => (
            <div className="sheet-row" key={`row-${rIdx}`}>
              {headers.map((_, cIdx) => (
                <div
                  key={`cell-${rIdx}-${cIdx}`}
                  className="sheet-cell sheet-body"
                  style={{
                    width: headers[cIdx]?.length > 10 ? 140 : 110,
                    background: rIdx === 0 ? '#fffef6' : '#fff',
                  }}
                >
                  <div style={{ fontSize: '12px' }}>{row?.[cIdx] ?? ''}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
