// Client component because pagination state lives here
'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, X, Check } from 'lucide-react'

import { Pagination } from './Pagination'

export type SortDirection = 'asc' | 'desc' | null
export type SortConfig = { column: number; direction: SortDirection }
export type SelectionSet = Set<number>

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
  // ソート機能
  sortable?: boolean
  onSort?: (config: SortConfig) => void
  externalSort?: SortConfig
  // 行選択機能
  selectable?: boolean
  selectedRows?: SelectionSet
  onSelectionChange?: (selected: SelectionSet) => void
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
  sortable = false,
  onSort,
  externalSort,
  selectable = false,
  selectedRows,
  onSelectionChange,
}: SheetTableProps) {
  const CELL_WIDTH = 130
  const ROW_HEIGHT = 44
  const CHECKBOX_WIDTH = 40

  const [pageSizeState, setPageSizeState] = useState(defaultPageSize)
  const [pageState, setPageState] = useState(1)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: -1, direction: null })
  const [internalSelection, setInternalSelection] = useState<SelectionSet>(new Set())

  const currentSort = externalSort ?? sortConfig
  const currentSelection = selectedRows ?? internalSelection

  useEffect(() => {
    if (page === undefined) setPageState(1)
  }, [rows, page, pageSize])

  const currentPageSize = pageSize ?? pageSizeState
  const currentPage = page ?? pageState

  const visibleHeaders = useMemo(() => (showOnlyFirstColumn ? headers.slice(0, 1) : headers), [headers, showOnlyFirstColumn])

  // 行データ処理
  const processedRows = useMemo(() => {
    return rows.map((row) => showOnlyFirstColumn ? row.slice(0, 1) : row)
  }, [rows, showOnlyFirstColumn])

  // ソート適用
  const sortedRows = useMemo(() => {
    // 外部ソート制御の場合はそのまま返す
    if (externalSort) return processedRows

    if (currentSort.column < 0 || !currentSort.direction) return processedRows

    return [...processedRows].sort((a, b) => {
      const aVal = a[currentSort.column] ?? ''
      const bVal = b[currentSort.column] ?? ''

      // 数値として比較可能か確認
      const aNum = parseFloat(aVal.replace(/[,\s]/g, ''))
      const bNum = parseFloat(bVal.replace(/[,\s]/g, ''))

      let comparison = 0
      if (!isNaN(aNum) && !isNaN(bNum)) {
        comparison = aNum - bNum
      } else {
        comparison = aVal.localeCompare(bVal, 'ja')
      }

      return currentSort.direction === 'desc' ? -comparison : comparison
    })
  }, [processedRows, currentSort, externalSort])

  const { pagedRows, totalPages, totalFiltered } = useMemo(() => {
    const total = totalOverride ?? sortedRows.length
    const totalPagesCalc = Math.max(1, Math.ceil(total / currentPageSize))
    const safePage = Math.min(currentPage, totalPagesCalc)
    const startIdx = sortedRows.length === 0 ? 0 : (safePage - 1) * currentPageSize
    const body = page === undefined ? sortedRows.slice(startIdx, startIdx + currentPageSize) : sortedRows
    return {
      pagedRows: body,
      totalPages: totalPagesCalc,
      totalFiltered: total,
    }
  }, [currentPage, currentPageSize, page, totalOverride, sortedRows])

  // ソートハンドラー
  const handleSort = useCallback((columnIndex: number) => {
    if (!sortable) return

    const newDirection: SortDirection =
      currentSort.column !== columnIndex ? 'asc' :
      currentSort.direction === 'asc' ? 'desc' :
      currentSort.direction === 'desc' ? null : 'asc'

    const newConfig: SortConfig = {
      column: newDirection ? columnIndex : -1,
      direction: newDirection
    }

    if (onSort) {
      onSort(newConfig)
    } else {
      setSortConfig(newConfig)
    }
    // ソート変更時は1ページ目に戻す
    if (!onPageChange) setPageState(1)
  }, [sortable, currentSort, onSort, onPageChange])

  // 行選択ハンドラー
  const handleRowSelect = useCallback((rowIndex: number) => {
    if (!selectable) return
    const newSelection = new Set(currentSelection)
    if (newSelection.has(rowIndex)) {
      newSelection.delete(rowIndex)
    } else {
      newSelection.add(rowIndex)
    }
    if (onSelectionChange) {
      onSelectionChange(newSelection)
    } else {
      setInternalSelection(newSelection)
    }
  }, [selectable, currentSelection, onSelectionChange])

  // 全選択/全解除
  const handleSelectAll = useCallback(() => {
    if (!selectable) return
    const allRowIndices = sortedRows.map((_, idx) => idx)
    const allSelected = allRowIndices.every(idx => currentSelection.has(idx))

    const newSelection = new Set<number>()
    if (!allSelected) {
      allRowIndices.forEach(idx => newSelection.add(idx))
    }

    if (onSelectionChange) {
      onSelectionChange(newSelection)
    } else {
      setInternalSelection(newSelection)
    }
  }, [selectable, sortedRows, currentSelection, onSelectionChange])

  // 選択クリア
  const clearSelection = useCallback(() => {
    if (onSelectionChange) {
      onSelectionChange(new Set())
    } else {
      setInternalSelection(new Set())
    }
  }, [onSelectionChange])

  // ソートアイコンを取得
  const getSortIcon = (columnIndex: number) => {
    if (!sortable) return null
    if (currentSort.column !== columnIndex) {
      return <ArrowUpDown size={14} className="text-gray-400 ml-1 flex-shrink-0" />
    }
    if (currentSort.direction === 'asc') {
      return <ArrowUp size={14} className="text-blue-600 ml-1 flex-shrink-0" />
    }
    if (currentSort.direction === 'desc') {
      return <ArrowDown size={14} className="text-blue-600 ml-1 flex-shrink-0" />
    }
    return <ArrowUpDown size={14} className="text-gray-400 ml-1 flex-shrink-0" />
  }

  return (
    <section className="sheet-card" style={{ width: '100%', alignSelf: 'stretch' }}>
      {/* 選択コントロール */}
      {selectable && (
        <div className="sheet-filter-controls" style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="text-sm text-gray-600">
            <Check size={14} className="inline mr-1" />
            {currentSelection.size}件選択中
          </span>
          {currentSelection.size > 0 && (
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              <X size={14} />
              選択解除
            </button>
          )}
        </div>
      )}
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
          {/* ヘッダー行（ソート対応） */}
          <div className="sheet-row sheet-header">
            {selectable && (
              <div
                className="sheet-cell cursor-pointer hover:bg-orange-100"
                style={{
                  width: CHECKBOX_WIDTH,
                  minWidth: CHECKBOX_WIDTH,
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff7e6',
                }}
                onClick={handleSelectAll}
                title="全選択/全解除"
              >
                <input
                  type="checkbox"
                  checked={sortedRows.length > 0 && sortedRows.every((_, idx) => currentSelection.has(idx))}
                  onChange={handleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                />
              </div>
            )}
            {visibleHeaders.map((titleText, idx) => (
              <div
                key={`${titleText}-${idx}`}
                className={`sheet-cell ${sortable ? 'cursor-pointer hover:bg-orange-100' : ''}`}
                style={{
                  width: CELL_WIDTH,
                  minWidth: CELL_WIDTH,
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fff7e6',
                  fontWeight: 700,
                  whiteSpace: 'pre-line',
                  userSelect: 'none',
                }}
                onClick={() => handleSort(idx)}
                title={sortable ? 'クリックでソート' : undefined}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleText}</span>
                {getSortIcon(idx)}
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
            const startIdx = page && pageSize ? (page - 1) * pageSize : 0
            const actualRowIdx = startIdx + rIdx
            const rowStyle = rowStyles[actualRowIdx]
            const isSelected = currentSelection.has(rIdx)
            return (
              <div
                className={`sheet-row ${selectable && isSelected ? 'bg-blue-50' : ''}`}
                key={`row-${rIdx}`}
                style={selectable && isSelected ? { background: '#eff6ff' } : undefined}
              >
                {selectable && (
                  <div
                    className="sheet-cell sheet-body cursor-pointer"
                    style={{
                      width: CHECKBOX_WIDTH,
                      minWidth: CHECKBOX_WIDTH,
                      height: ROW_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected ? '#dbeafe' : '#ffffff',
                    }}
                    onClick={() => handleRowSelect(rIdx)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleRowSelect(rIdx)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </div>
                )}
                {visibleHeaders.map((_, cIdx) => (
                  <div
                    key={`cell-${rIdx}-${cIdx}`}
                    className="sheet-cell sheet-body"
                    style={{
                      width: CELL_WIDTH,
                      minWidth: CELL_WIDTH,
                      height: ROW_HEIGHT,
                      background: isSelected ? '#dbeafe' : '#ffffff',
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
        total={totalOverride ?? sortedRows.length}
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
