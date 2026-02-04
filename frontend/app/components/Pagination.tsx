'use client'

type PaginationProps = {
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function buildPageList(current: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)

  for (let i = current - 1; i <= current + 1; i += 1) {
    if (i > 1 && i < totalPages) pages.add(i)
  }

  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (current >= totalPages - 2) {
    pages.add(totalPages - 1)
    pages.add(totalPages - 2)
    pages.add(totalPages - 3)
  }

  const sorted = Array.from(pages).sort((a, b) => a - b)
  const withEllipsis: Array<number | 'ellipsis'> = []

  for (let i = 0; i < sorted.length; i += 1) {
    const curr = sorted[i]
    const prev = sorted[i - 1]
    if (prev !== undefined && curr - prev > 1) {
      withEllipsis.push('ellipsis')
    }
    withEllipsis.push(curr)
  }

  return withEllipsis
}

export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  const pages = buildPageList(page, totalPages)

  return (
    <div className="pager">
      <div className="pager-size">
        <span>表示件数:</span>
        <select className="pager-select" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="pager-pages">
        <button className="pager-btn" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
          ‹
        </button>
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`el-${idx}`} className="pager-ellipsis">
              …
            </span>
          ) : (
            <button key={p} className={`pager-btn ${p === page ? 'active' : ''}`} onClick={() => onPageChange(p)}>
              {p}
            </button>
          ),
        )}
        <button className="pager-btn" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
          ›
        </button>
      </div>

      <div className="pager-info">{`${start}-${end} / ${total}件`}</div>
    </div>
  )
}
