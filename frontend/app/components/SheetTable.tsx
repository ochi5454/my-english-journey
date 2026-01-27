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
  page?: number
  pageSize?: number
  totalOverride?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
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
  page,
  pageSize,
  totalOverride,
  onPageChange,
  onPageSizeChange,
}: SheetTableProps) {
  const CELL_WIDTH = 130
  const ROW_HEIGHT = 44

  const [pageSizeState, setPageSizeState] = useState(defaultPageSize)
  const [pageState, setPageState] = useState(1)

  useEffect(() => {
    if (page === undefined) setPageState(1)
  }, [rows, page, pageSize])

  const currentPageSize = pageSize ?? pageSizeState
  const currentPage = page ?? pageState

  const visibleHeaders = useMemo(() => (showOnlyFirstColumn ? headers.slice(0, 1) : headers), [headers, showOnlyFirstColumn])
  const visibleRows = useMemo(
    () =>
      rows.map((row) =>
        showOnlyFirstColumn ? row.slice(0, 1) : row
      ),
    [rows, showOnlyFirstColumn]
  )

  const { pagedRows, totalPages } = useMemo(() => {
    const total = totalOverride ?? visibleRows.length
    const totalPagesCalc = Math.max(1, Math.ceil(total / currentPageSize))
    const safePage = Math.min(currentPage, totalPagesCalc)
    const startIdx = visibleRows.length === 0 ? 0 : (safePage - 1) * currentPageSize
    const body = page === undefined ? visibleRows.slice(startIdx, startIdx + currentPageSize) : visibleRows
    return {
      pagedRows: body,
      totalPages: totalPagesCalc,
    }
  }, [currentPage, currentPageSize, page, totalOverride, visibleRows])

  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {topContent ? <div className="sheet-controls">{topContent}</div> : null}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="sheet-table-wrapper">
        <div className="sheet-table">
          {title ? (
            <div className="sheet-row sheet-header-band">
              <div className="sheet-cell sheet-title" style={{ width: Math.max(visibleHeaders.length * CELL_WIDTH, 320) }}>
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
                  width: CELL_WIDTH,
                  minWidth: CELL_WIDTH,
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
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
                    width: Math.max(visibleHeaders.length * CELL_WIDTH, 320),
                    justifyContent: 'center',
                    textAlign: 'center',
                    minHeight: ROW_HEIGHT,
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
                      width: CELL_WIDTH,
                      minWidth: CELL_WIDTH,
                      height: ROW_HEIGHT,
                      // 2行目以降は全て白で統一
                      background: '#ffffff',
                      color: rowStyle?.color || 'inherit',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    <div style={{ fontSize: '12px', lineHeight: '16px' }}>{row?.[cIdx] ?? ''}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <Pagination
        total={totalOverride ?? visibleRows.length}
        page={currentPage}
        pageSize={currentPageSize}
        pageSizeOptions={pageSizeOptions}
        onPageChange={(next) =>
          onPageChange
            ? onPageChange(Math.min(Math.max(1, next), totalPages))
            : setPageState(Math.min(Math.max(1, next), totalPages))
        }
        onPageSizeChange={(size) => {
          onPageSizeChange?.(size)
          if (!onPageSizeChange) setPageSizeState(size)
        }}
      />
    </section>
  )
}
