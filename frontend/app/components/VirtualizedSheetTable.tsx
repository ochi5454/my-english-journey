// 仮想スクロール対応の高速テーブルコンポーネント
'use client'

import type { ReactNode, CSSProperties } from 'react'
import { useMemo, useState, useEffect } from 'react'
// @ts-ignore - react-window has type export issues
import { FixedSizeList } from 'react-window'
import { Pagination } from './Pagination'

type VirtualizedSheetTableProps = {
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

export function VirtualizedSheetTable({
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
}: VirtualizedSheetTableProps) {
  const CELL_WIDTH = 130
  const ROW_HEIGHT = 44
  const CONTAINER_HEIGHT = 600 // 約13行分の高さ

  const [pageSizeState, setPageSizeState] = useState(defaultPageSize)
  const [pageState, setPageState] = useState(1)

  useEffect(() => {
    if (page === undefined) setPageState(1)
  }, [rows, page, pageSize])

  const currentPageSize = pageSize ?? pageSizeState
  const currentPage = page ?? pageState

  const visibleHeaders = useMemo(
    () => (showOnlyFirstColumn ? headers.slice(0, 1) : headers),
    [headers, showOnlyFirstColumn]
  )

  const visibleRows = useMemo(
    () => rows.map((row) => (showOnlyFirstColumn ? row.slice(0, 1) : row)),
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

  // 行レンダリング関数
  const Row = ({ index, style }: { index: number; style: CSSProperties }) => {
    const row = pagedRows[index]
    const startIdx = page ? (page - 1) * currentPageSize : (currentPage - 1) * currentPageSize
    const actualRowIdx = startIdx + index
    const rowStyle = rowStyles[actualRowIdx]

    return (
      <div className="sheet-row" style={style}>
        {visibleHeaders.map((_, cIdx) => (
          <div
            key={`cell-${index}-${cIdx}`}
            className="sheet-cell sheet-body"
            style={{
              width: CELL_WIDTH,
              minWidth: CELL_WIDTH,
              height: ROW_HEIGHT,
              display: 'inline-flex',
              alignItems: 'center',
              background: rowStyle?.bg || '#ffffff',
              color: rowStyle?.color || 'inherit',
              whiteSpace: 'pre-line' as const,
              overflow: 'hidden',
              padding: '0 8px',
            }}
          >
            <div style={{ fontSize: '12px', lineHeight: '16px' }}>{row?.[cIdx] ?? ''}</div>
          </div>
        ))}
      </div>
    )
  }

  const tableWidth = visibleHeaders.length * CELL_WIDTH

  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {topContent ? <div className="sheet-controls">{topContent}</div> : null}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

      <div className="sheet-table-wrapper">
        <div className="sheet-table">
          {/* タイトル行 */}
          {title ? (
            <div className="sheet-row sheet-header-band">
              <div
                className="sheet-cell sheet-title"
                style={{ width: Math.max(tableWidth, 320) }}
              >
                {title}
              </div>
            </div>
          ) : null}

          {/* ヘッダー行（固定） */}
          <div className="sheet-row sheet-header">
            {visibleHeaders.map((titleText, idx) => (
              <div
                key={`${titleText}-${idx}`}
                className="sheet-cell"
                style={{
                  width: CELL_WIDTH,
                  minWidth: CELL_WIDTH,
                  height: ROW_HEIGHT,
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: '#fff7e6',
                  fontWeight: 700,
                  whiteSpace: 'pre-line' as const,
                  padding: '0 8px',
                }}
              >
                {titleText}
              </div>
            ))}
          </div>

          {/* 空状態 */}
          {pagedRows.length === 0 && !loading && !hideBodyWhenEmpty && (
            <div className="sheet-row">
              <div
                className="sheet-cell sheet-empty-state"
                style={{
                  width: Math.max(tableWidth, 320),
                  justifyContent: 'center',
                  textAlign: 'center',
                  minHeight: ROW_HEIGHT,
                }}
              >
                {emptyMessage}
              </div>
            </div>
          )}

          {/* 仮想スクロールリスト */}
          {pagedRows.length > 0 && (
            <FixedSizeList
              height={Math.min(CONTAINER_HEIGHT, pagedRows.length * ROW_HEIGHT)}
              itemCount={pagedRows.length}
              itemSize={ROW_HEIGHT}
              width={tableWidth}
              overscanCount={5}
              style={{
                overflow: 'auto',
              }}
            >
              {Row}
            </FixedSizeList>
          )}
        </div>
      </div>

      {/* ページネーション */}
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
