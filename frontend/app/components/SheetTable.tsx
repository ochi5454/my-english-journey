// Client component because pagination state lives here
'use client'

import { useEffect, useMemo, useState } from 'react'

import { Pagination } from './Pagination'

type SheetTableProps = {
  headers: string[]
  rows: string[][]
  title?: string
  loading?: boolean
  error?: string | null
  defaultPageSize?: number
  pageSizeOptions?: number[]
  emptyMessage?: string
}

export function SheetTable({
  headers,
  rows,
  title = '',
  loading = false,
  error = null,
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = 'データがありません',
}: SheetTableProps) {
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [rows, pageSize])

  const { pagedRows, totalPages } = useMemo(() => {
    const totalPagesCalc = Math.max(1, Math.ceil(rows.length / pageSize))
    const safePage = Math.min(page, totalPagesCalc)
    const startIdx = rows.length === 0 ? 0 : (safePage - 1) * pageSize
    return {
      pagedRows: rows.slice(startIdx, startIdx + pageSize),
      totalPages: totalPagesCalc,
    }
  }, [page, pageSize, rows])

  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="sheet-table-wrapper">
        <div className="sheet-table">
          {title ? (
            <div className="sheet-row sheet-header-band">
              <div className="sheet-cell sheet-title" style={{ width: Math.max(headers.length * 110, 320) }}>
                {title}
              </div>
            </div>
          ) : null}
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
          {pagedRows.length === 0 && !loading && (
            <div className="sheet-row">
              <div
                className="sheet-cell sheet-empty-state"
                style={{
                  width: Math.max(headers.length * 110, 320),
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {emptyMessage}
              </div>
            </div>
          )}
          {pagedRows.map((row, rIdx) => (
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
      <Pagination
        total={rows.length}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageChange={(next) => setPage(Math.min(Math.max(1, next), totalPages))}
        onPageSizeChange={(size) => setPageSize(size)}
      />
    </section>
  )
}
