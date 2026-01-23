// Client component because pagination state lives here
'use client'

import type { ReactNode } from 'react'
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
  showOnlyFirstColumn?: boolean
  hideBodyWhenEmpty?: boolean
  rowStyles?: Array<{ bg?: string; color?: string }>
  topContent?: ReactNode
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
  showOnlyFirstColumn = false,
  hideBodyWhenEmpty = false,
  rowStyles = [],
  topContent = null,
}: SheetTableProps) {
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [rows, pageSize])

  const visibleHeaders = useMemo(() => (showOnlyFirstColumn ? headers.slice(0, 1) : headers), [headers, showOnlyFirstColumn])
  const visibleRows = useMemo(
    () =>
      rows.map((row) =>
        showOnlyFirstColumn ? row.slice(0, 1) : row
      ),
    [rows, showOnlyFirstColumn]
  )

  const { pagedRows, totalPages } = useMemo(() => {
    const totalPagesCalc = Math.max(1, Math.ceil(visibleRows.length / pageSize))
    const safePage = Math.min(page, totalPagesCalc)
    const startIdx = visibleRows.length === 0 ? 0 : (safePage - 1) * pageSize
    return {
      pagedRows: visibleRows.slice(startIdx, startIdx + pageSize),
      totalPages: totalPagesCalc,
    }
  }, [page, pageSize, visibleRows])

  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {topContent ? <div className="sheet-controls">{topContent}</div> : null}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="sheet-table-wrapper">
        <div className="sheet-table">
          {title ? (
            <div className="sheet-row sheet-header-band">
              <div className="sheet-cell sheet-title" style={{ width: Math.max(visibleHeaders.length * 110, 320) }}>
                {title}
              </div>
            </div>
          ) : null}
          <div className="sheet-row sheet-header">
            {visibleHeaders.map((titleText, idx) => (
              <div
                key={`${titleText}-${idx}`}
                className="sheet-cell"
                style={{
                  width: titleText.length > 10 ? 140 : 110,
                  background: '#fff7e6', // 1行目は端の色(#fff7e6)で統一
                  fontWeight: 700,
                  whiteSpace: 'pre-line',
                }}
              >
                {titleText}
              </div>
            ))}
          </div>
          {pagedRows.length === 0 && !loading && !hideBodyWhenEmpty && (
            <div className="sheet-row">
              <div
                className="sheet-cell sheet-empty-state"
                style={{
                  width: Math.max(visibleHeaders.length * 110, 320),
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {emptyMessage}
              </div>
            </div>
          )}
          {pagedRows.map((row, rIdx) => {
            const startIdx = (page - 1) * pageSize
            const actualRowIdx = startIdx + rIdx
            const rowStyle = rowStyles[actualRowIdx]
            return (
              <div className="sheet-row" key={`row-${rIdx}`}>
                {visibleHeaders.map((_, cIdx) => (
                  <div
                    key={`cell-${rIdx}-${cIdx}`}
                    className="sheet-cell sheet-body"
                    style={{
                      width: visibleHeaders[cIdx]?.length > 10 ? 140 : 110,
                      // 2行目以降は全て白で統一
                      background: '#ffffff',
                      color: rowStyle?.color || 'inherit',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    <div style={{ fontSize: '12px' }}>{row?.[cIdx] ?? ''}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <Pagination
        total={visibleRows.length}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageChange={(next) => setPage(Math.min(Math.max(1, next), totalPages))}
        onPageSizeChange={(size) => setPageSize(size)}
      />
    </section>
  )
}
