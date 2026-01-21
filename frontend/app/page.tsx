'use client'

import { Search, X, Download as DownloadIcon } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DownloadPanel } from './components/DownloadPanel'
import { SheetTable } from './components/SheetTable'
import { Sidebar } from './components/Sidebar'
import { UploadSection } from './components/UploadSection'
import { API_BASE, FALLBACK_DEFS, FILE_ORDER, REPORT_HEADING, TABLE_TITLE } from './constants/excel'
import { FileDef, SheetPayload } from './types/excel'
import * as XLSX from 'xlsx'

const STORAGE_KEY = 'overtime_import_cache_v1'
const SEARCH_TARGET_HEADERS = ['案件名', '現場名', '仕入先名']
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error' | 'canceled'
const normalizeHeader = (h: string) =>
  (h || '')
    .replace(/[\s　]/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/^時間/, '')
    .replace(/\//g, '')
    .toLowerCase()
const COLUMN_MAP_ALIASES: Record<string, string[]> = {
  emp_no: ['従業員番号', '社員番号', '社員No', '(基本)従業員番号'],
  name: ['氏名', '名前', 'カナ氏名', '(基本)氏名', '(基本)カナ氏名'],
  status: ['勤務予定', '勤務予定日', '勤務予定区分', '勤務状況', '進捗状況'],
  overtime: ['実所定外時間', '残業時間', '残業'],
  overtime_detail: ['残業時間', '実所定外時間'],
  call_time: ['呼出出勤時間', '呼出出勤'],
  grade: ['グレード', '従業員区分', '(従業員区分(基準日))従業員区分'],
  role: ['職制', '役職', '(職制(基準日))職制'],
  org2: ['所属名称2', '所属名称２', '所属2', '(人事所属本務(基準日))所属名称２'],
  org3: ['所属名称3', '所属名称３', '所属3', '(人事所属本務(基準日))所属名称３'],
  org4: ['所属名称4', '所属名称４', '所属4', '(人事所属本務(基準日))所属名称４'],
  org5: ['所属名称5', '所属名称５', '所属5', '(人事所属本務(基準日))所属名称５'],
  org6: ['所属名称6', '所属名称６', '所属6', '(人事所属本務(基準日))所属名称６'],
  org7: ['所属名称7', '所属名称７', '所属7', '(人事所属本務(基準日))所属名称７'],
  org8: ['所属名称8', '所属名称８', '所属8', '(人事所属本務(基準日))所属名称８'],
}
const asString = (value: unknown) => (value == null ? '' : String(value))
const EXPORT_HEADERS = [
  '従業員番号',
  '氏名',
  '勤務予定',
  '実所定外時間',
  '残業時間',
  '呼出出勤時間',
  'グレード',
  '職制',
  '所属名称2',
  '所属名称3',
  '所属名称4',
  '所属名称5',
  '所属名称6',
  '所属名称7',
  '所属名称8',
] as const
const BRANCH_GROUPS = [
  { key: 'hokkaido', label: '北海道支社', matcher: (org2: string) => org2.includes('北海道') },
  { key: 'tohoku', label: '東北支社', matcher: (org2: string) => org2.includes('東北') },
  { key: 'kanto', label: '関東支社', matcher: (org2: string) => org2.includes('関東') },
  { key: 'hokuriku', label: '北陸信越支社', matcher: (org2: string) => org2.includes('北陸') || org2.includes('信越') },
  { key: 'tokai', label: '東海支社', matcher: (org2: string) => org2.includes('東海') },
  { key: 'kansai', label: '関西支社', matcher: (org2: string) => org2.includes('関西') },
  { key: 'chushikoku', label: '中四国支社', matcher: (org2: string) => org2.includes('中四国') || org2.includes('中国') || org2.includes('四国') },
  { key: 'kyushu', label: '九州支社', matcher: (org2: string) => org2.includes('九州') },
] as const
const LEGEND_ROWS = [
  { label: '80h超', desc: '長時間労働', color: '6b4f00', textColor: 'f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', color: 'd0a754', textColor: '1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', color: 'e6a600', textColor: '1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', color: 'c7b202', textColor: '0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', color: '1f8a55', textColor: 'fdfdfd' },
  { label: '15h〜20h', desc: '', color: '5f86c6', textColor: 'fdfdfd' },
] as const

const readInitialSavedPreviews = () => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // ignore parse errors
  }
  return {}
}

export default function Home() {
  const [activeSheet, setActiveSheet] = useState(0)
  const [defs, setDefs] = useState<Record<string, FileDef>>(FALLBACK_DEFS)
  const [sheetData, setSheetData] = useState<Record<string, SheetPayload | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [showDownloadPanel, setShowDownloadPanel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const statusResetTimer = useRef<number | null>(null)
  const [uploadStart, setUploadStart] = useState<Record<string, number | null>>({})
  const [uploadElapsedSec, setUploadElapsedSec] = useState<Record<string, number>>({})
  const [uploadEstimateSec, setUploadEstimateSec] = useState<Record<string, number | null>>({})
  const [searchInput, setSearchInput] = useState('')
  const [filteredRows, setFilteredRows] = useState<string[][] | null>(null)
  const [lastSearch, setLastSearch] = useState('')
  const [savedPreviews, setSavedPreviews] = useState<
    Record<string, { headers: string[]; rows: string[][]; fileName?: string | null; importedAt?: string }>
  >(() => readInitialSavedPreviews())
  const emptyGrouping = useCallback(
    () => BRANCH_GROUPS.reduce<Record<string, string[][]>>((acc, g) => ({ ...acc, [g.key]: [] }), {}),
    [],
  )
  const [groupedRowsByBranch, setGroupedRowsByBranch] = useState<Record<string, string[][]>>(emptyGrouping)
  const [branchExportStatus, setBranchExportStatus] = useState<Record<string, ExportStatus>>(
    () => BRANCH_GROUPS.reduce<Record<string, ExportStatus>>((acc, g) => ({ ...acc, [g.key]: 'idle' }), {}),
  )
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const setBranchExportStatusWithReset = useCallback((key: string, state: ExportStatus) => {
    setBranchExportStatus((prev) => ({ ...prev, [key]: state }))
    if (state !== 'exporting' && state !== 'idle') {
      window.setTimeout(() => {
        setBranchExportStatus((prev) => ({ ...prev, [key]: 'idle' }))
      }, 2000)
    }
  }, [])
  const buildLegendSheet = useCallback((rows: string[][]) => {
    const legendAoA = LEGEND_ROWS.map((item) => [item.label, item.desc ? `： ${item.desc}` : ''])
    const spacer = ['']
    const headerRow = [...EXPORT_HEADERS]
    const aoa = [...legendAoA, spacer, headerRow, ...rows]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)

    // style legend cells
    LEGEND_ROWS.forEach((item, idx) => {
      const rowIndex = idx + 1
      const labelCell = XLSX.utils.encode_cell({ r: rowIndex - 1, c: 0 })
      const descCell = XLSX.utils.encode_cell({ r: rowIndex - 1, c: 1 })
      const labelStyle = {
        font: { bold: true, color: { rgb: `FF${item.textColor.toUpperCase()}` } },
        fill: { patternType: 'solid', fgColor: { rgb: `FF${item.color.toUpperCase()}` } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        },
      }
      const descStyle = {
        alignment: { horizontal: 'left', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        },
      }
      if (!sheet[labelCell]) sheet[labelCell] = { t: 's', v: item.label }
      sheet[labelCell].s = labelStyle
      if (!sheet[descCell]) sheet[descCell] = { t: 's', v: item.desc ? `： ${item.desc}` : '' }
      sheet[descCell].s = descStyle
    })

    // widen desc column a bit
    sheet['!cols'] = [
      { wch: 10 },
      { wch: 40 },
      ...EXPORT_HEADERS.slice(2).map(() => ({ wch: 14 })),
    ]

    return sheet
  }, [])

  const processedFileKey = 'tim_daily'
  const activeKey = FILE_ORDER[activeSheet]
  const activeDef = defs[activeKey] ?? { display_name: activeKey, expected_headers: [] }
  const subtitle = activeDef.display_name
  const downloadSubtitle = defs[processedFileKey]?.display_name ?? '加工済みデータ'

  const persistPreview = useCallback((next: typeof savedPreviews) => {
    setSavedPreviews(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    const loadDefs = async () => {
      try {
        const res = await fetch(`${API_BASE}/excel/config`)
        if (!res.ok) throw new Error('config load failed')
        const json = await res.json()
        setDefs((prev) => ({ ...prev, ...json }))
      } catch {
        // フォールバック定義を使う
      }
    }
    loadDefs()
  }, [])

  const loadSheet = useCallback(async (key: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/excel/${key}`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        throw new Error('fetch failed')
      }
      const json = (await res.json()) as SheetPayload
      setSheetData((prev) => ({ ...prev, [key]: json }))
      const sheetPayload = json?.sheets?.[0]
      if (sheetPayload) {
        persistPreview({
          ...savedPreviews,
          [key]: {
            headers: sheetPayload.headers ?? [],
            rows: sheetPayload.rows ?? [],
            fileName: json.file_name,
            importedAt: new Date().toISOString(),
          },
        })
      }
      return json
    } catch {
      setError('データ取得に失敗しました。バックエンドが起動しているか確認してください。')
      return null
    } finally {
      setLoading(false)
    }
  }, [persistPreview, savedPreviews])

  const parseLocalPreview = useCallback(async (file: File) => {
    try {
      const t0 = performance.now()
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', dense: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })
      const headers = (rows[0] as string[] | undefined) || []
      const body = (rows.slice(1) as string[][] | undefined) || []
      const parseMs = performance.now() - t0
      return { headers, rows: body, parseMs }
    } catch (err) {
      console.error('preview parse failed', err)
      return null
    }
  }, [])

  useEffect(() => {
    loadSheet(activeKey)
  }, [activeKey, loadSheet])

  useEffect(() => {
    return () => {
      if (statusResetTimer.current) {
        window.clearTimeout(statusResetTimer.current)
      }
    }
  }, [])

  const handleFile = async (file?: File) => {
    if (!file) return
    setUploadedName(file.name)
    setUploadMessage(null)
    setUploadError(null)
    setUploading(true)
    setUploadStart((prev) => ({ ...prev, [activeKey]: Date.now() }))
    setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
    setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
    try {
      const preview = await parseLocalPreview(file)
      if (preview) {
        const est = Math.min(
          900,
          Math.max(
            10,
            Math.max((preview.parseMs ?? 0) / 1000 * 3, (preview.rows?.length || 0) * 0.02)
          )
        )
        setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: est }))
        const next = {
          ...savedPreviews,
          [activeKey]: {
            headers: preview.headers,
            rows: preview.rows,
            fileName: file.name,
            importedAt: new Date().toISOString(),
          },
        }
        persistPreview(next)
      }

      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_BASE}/excel/${activeKey}/upload`, { method: 'POST', body: fd })
      if (!res.ok) {
        let detail = ''
        try {
          const body = await res.json()
          detail = body?.detail?.message || JSON.stringify(body?.detail || body)
        } catch {
          detail = await res.text()
        }
        throw new Error(detail || 'アップロードに失敗しました')
      }
      const loaded = await loadSheet(activeKey)
      const sheetPayload = loaded?.sheets?.[0]
      if (sheetPayload) {
        persistPreview({
          ...savedPreviews,
          [activeKey]: {
            headers: sheetPayload.headers ?? [],
            rows: sheetPayload.rows ?? [],
            fileName: file.name,
            importedAt: new Date().toISOString(),
          },
        })
        setUploadMessage('アップロード完了。最新データを表示します。')
      }
    } catch (e: any) {
      const raw = e?.message ?? ''
      const friendly =
        raw.toLowerCase().includes('header mismatch') || raw.toLowerCase().includes('header_mismatch')
          ? 'アップロードに失敗しました。項目名がテンプレートと一致するか確認してください。'
          : raw || 'アップロードに失敗しました'
      setUploadError(friendly)
    } finally {
      setUploading(false)
      setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
      setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
      setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
    }
  }

  const handleClearPageData = () => {
    const ok = window.confirm('表示中のデータを削除しますか？')
    if (!ok) return
    setSheetData((prev) => ({ ...prev, [activeKey]: null }))
    const next = { ...savedPreviews }
    delete next[activeKey]
    persistPreview(next)
    setUploadedName(null)
    setUploadMessage(null)
    setUploadError(null)
    setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
    setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
    setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
  }

  const handleGenerateDownload = async () => {
    setToast(null)
    setUnmatchedCount(0)
    setStatusWithReset('exporting')
    try {
      const meaningfulRows = processedRows.filter((row) =>
        row.some((cell) => (cell ?? '').toString().trim() !== ''),
      )
      if (!meaningfulRows.length) {
        setGroupedRowsByBranch(emptyGrouping())
        setToast('出力対象がありません')
        setStatusWithReset('error')
        return
      }

      const mergedRows = mergeByEmployee(meaningfulRows)
      const nextGrouped = emptyGrouping()
      let unmatched = 0

      mergedRows.forEach((row) => {
        const org2 = asString(row[8]).trim()
        const matchedGroup = BRANCH_GROUPS.find((g) => g.matcher(org2))
        if (matchedGroup) {
          nextGrouped[matchedGroup.key] = [...nextGrouped[matchedGroup.key], row]
        } else {
          unmatched += 1
        }
      })

      setGroupedRowsByBranch(nextGrouped)
      setUnmatchedCount(unmatched)

      if (unmatched > 0) {
        setToast(`分類できないデータが${unmatched}件あります`)
      } else {
        setToast('振り分けが完了しました')
      }
      setStatusWithReset('success')
    } catch (err: any) {
      setToast(err?.message || '振り分けに失敗しました')
      setStatusWithReset('error')
    }
  }
  const handleExportBranch = useCallback(
    (key: string, label: string) => {
      const rows = groupedRowsByBranch[key] || []
      if (!rows.length) {
        setToast('出力対象がありません')
        return
      }
      setBranchExportStatusWithReset(key, 'exporting')
      try {
        const pad = (n: number) => `${n}`.padStart(2, '0')
        const timestamp = () => {
          const now = new Date()
          return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
            now.getMinutes(),
          )}`
        }
        const sanitize = (value: string) => {
          const base = (value || 'export').trim() || 'export'
          const cleaned = base.replace(/[\\/:*?"<>|]/g, '_')
          return cleaned.slice(0, 50)
        }

        const sheet = buildLegendSheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, sheet, 'export')
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `export_${sanitize(label)}_${timestamp()}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setBranchExportStatusWithReset(key, 'success')
      } catch (err: any) {
        console.error(err)
        setToast(err?.message || '出力に失敗しました')
        setBranchExportStatusWithReset(key, 'error')
      }
    },
    [buildLegendSheet, groupedRowsByBranch, setBranchExportStatusWithReset],
  )
  const handleCancelExport = () => {
    if (exportStatus === 'exporting') {
      setStatusWithReset('canceled')
      setToast('振り分けを中断しました')
    }
  }

  const handleClearExportTable = () => {
    const ok = window.confirm('エクスポート用の表示データを削除しますか？')
    if (!ok) return
    setSheetData((prev) => ({ ...prev, [processedFileKey]: null }))
    const next = { ...savedPreviews }
    delete next[processedFileKey]
    persistPreview(next)
    setGroupedRowsByBranch(emptyGrouping())
    setBranchExportStatus(
      BRANCH_GROUPS.reduce<Record<string, ExportStatus>>((acc, g) => ({ ...acc, [g.key]: 'idle' }), {}),
    )
    setUnmatchedCount(0)
  }

  const sheet = sheetData[activeKey]?.sheets?.[0]
  const grid = useMemo(() => {
    const cached = savedPreviews[activeKey]
    if (cached) return [cached.headers || [], ...(cached.rows || [])]
    if (sheet?.grid?.length) return sheet.grid
    if (sheet?.headers?.length) return [sheet.headers, ...(sheet.rows || [])]
    const headers = activeDef.expected_headers ?? []
    return [headers, headers.length ? [Array(headers.length).fill('')] : []]
  }, [sheet, activeDef, savedPreviews, activeKey])

  const headers = grid[0] || []
  const bodyRows = grid.slice(1)
  const rowsForDisplay = filteredRows ?? bodyRows

  const processedSheet = sheetData[processedFileKey]?.sheets?.[0]

  const buildColumnMap = useCallback((headers: string[]) => {
    const normalized: Record<string, number> = {}
    headers.forEach((h, idx) => {
      normalized[normalizeHeader(h)] = idx
    })
    const resolved: Record<string, number> = {}
    Object.entries(COLUMN_MAP_ALIASES).forEach(([key, aliases]) => {
      for (const name of aliases) {
        const idx = normalized[normalizeHeader(name)]
        if (idx !== undefined) {
          resolved[key] = idx
          break
        }
      }
    })
    return resolved
  }, [])

  const mapRowsToExport = useCallback((headers: string[], rows: string[][]) => {
    const colMap = buildColumnMap(headers)
    const pick = (row: string[], key: string, fallback = '') => {
      const idx = colMap[key]
      if (idx === undefined) return fallback
      return asString(row[idx])
    }
    return rows.map((r) => [
      pick(r, 'emp_no', ''),
      pick(r, 'name', ''),
      pick(r, 'status', ''),
      pick(r, 'overtime', ''),
      pick(r, 'overtime_detail', pick(r, 'overtime', '')),
      pick(r, 'call_time', '0:00'),
      pick(r, 'grade', ''),
      pick(r, 'role', ''),
      pick(r, 'org2', ''),
      pick(r, 'org3', ''),
      pick(r, 'org4', ''),
      pick(r, 'org5', ''),
      pick(r, 'org6', ''),
      pick(r, 'org7', ''),
      pick(r, 'org8', ''),
    ])
  }, [buildColumnMap])

  const NUMERIC_TIME_INDEXES = [3, 4, 5]
  const parseMinutes = (value: string | number | undefined | null) => {
    if (value == null) return 0
    const str = String(value).trim()
    if (!str) return 0
    if (str.includes(':')) {
      const [h, m] = str.split(':').map((v) => Number(v) || 0)
      return h * 60 + m
    }
    const num = Number(str)
    if (!Number.isFinite(num)) return 0
    return Math.round(num)
  }
  const formatMinutes = (total: number | undefined) => {
    if (total == null) return ''
    const minutes = Math.max(0, Math.round(total))
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}:${m.toString().padStart(2, '0')}`
  }

  const mergeByEmployee = (rows: string[][]) => {
    const grouped = new Map<string, { base: string[]; sums: Record<number, number> }>()
    const orphanRows: string[][] = []
    rows.forEach((row, idx) => {
      const empNo = (row?.[0] ?? '').trim()
      if (!empNo) {
        orphanRows.push(row)
        return
      }
      const existing = grouped.get(empNo)
      if (!existing) {
        const sums: Record<number, number> = {}
        NUMERIC_TIME_INDEXES.forEach((i) => {
          sums[i] = parseMinutes(row[i])
        })
        grouped.set(empNo, { base: [...row], sums })
        return
      }
      const nextBase = [...existing.base]
      NUMERIC_TIME_INDEXES.forEach((i) => {
        existing.sums[i] = (existing.sums[i] ?? 0) + parseMinutes(row[i])
      })
      nextBase.forEach((cell, i) => {
        if (NUMERIC_TIME_INDEXES.includes(i)) return
        const candidate = row[i]
        if ((!cell || cell.toString().trim() === '') && candidate && candidate.toString().trim() !== '') {
          nextBase[i] = candidate
        }
      })
      grouped.set(empNo, { base: nextBase, sums: existing.sums })
    })

    const mergedRows: string[][] = []
    grouped.forEach(({ base, sums }) => {
      const out = [...base]
      NUMERIC_TIME_INDEXES.forEach((i) => {
        out[i] = formatMinutes(sums[i])
      })
      mergedRows.push(out)
    })
    return [...mergedRows, ...orphanRows]
  }

  const setStatusWithReset = useCallback((state: ExportStatus) => {
    if (statusResetTimer.current) {
      window.clearTimeout(statusResetTimer.current)
    }
    setExportStatus(state)
    if (state !== 'exporting' && state !== 'idle') {
      statusResetTimer.current = window.setTimeout(() => setExportStatus('idle'), 2500)
    }
  }, [])

  const processedGrid = useMemo(() => {
    const cached = savedPreviews[processedFileKey]
    if (cached) return [cached.headers || [], ...(cached.rows || [])]
    if (processedSheet?.grid?.length) return processedSheet.grid
    if (processedSheet?.headers?.length) return [processedSheet.headers, ...(processedSheet.rows || [])]
    const headers = defs[processedFileKey]?.expected_headers ?? []
    return [headers, headers.length ? [Array(headers.length).fill('')] : []]
  }, [processedSheet, savedPreviews, processedFileKey, defs])
  const processedRows = useMemo(() => {
    const headers = processedGrid[0] || []
    const rows = processedGrid.slice(1)
    if (!rows.length) return []
    return mapRowsToExport(headers, rows)
  }, [processedGrid, mapRowsToExport])

  const normalizeSearchText = useCallback((value: string) => {
    const base = (value ?? '').trim().toLowerCase()
    return base.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  }, [])

  const targetSearchColumns = useMemo(() => {
    const normalizedTargets = SEARCH_TARGET_HEADERS.map((h) => normalizeSearchText(h))
    const matched = headers
      .map((h, idx) => ({ idx, header: normalizeSearchText(h) }))
      .filter(({ header }) => normalizedTargets.some((target) => header.includes(target)))
      .map(({ idx }) => idx)
    return matched.length ? matched : headers.map((_, idx) => idx)
  }, [headers, normalizeSearchText])

  const applySearch = useCallback(
    (query: string, options: { persistLast?: boolean } = {}) => {
      const { persistLast = true } = options
      const normalizedQuery = normalizeSearchText(query)
      if (!normalizedQuery) {
        setFilteredRows(null)
        if (persistLast) {
          setLastSearch('')
        }
        return
      }
      if (persistLast) {
        setLastSearch(query.trim())
      }
      const matches = bodyRows.filter((row) =>
        targetSearchColumns.some((idx) => normalizeSearchText(row?.[idx] ?? '').includes(normalizedQuery)),
      )
      setFilteredRows(matches)
    },
    [bodyRows, normalizeSearchText, targetSearchColumns],
  )

  const handleSearchSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      applySearch(searchInput)
    },
    [applySearch, searchInput],
  )

  useEffect(() => {
    if (lastSearch.trim()) {
      applySearch(lastSearch, { persistLast: false })
    }
  }, [applySearch, bodyRows, lastSearch])

  const handleClearSearch = useCallback(() => {
    setSearchInput('')
    setFilteredRows(null)
    setLastSearch('')
  }, [])

  useEffect(() => {
    if (showDownloadPanel && !savedPreviews[processedFileKey] && !processedSheet) {
      loadSheet(processedFileKey)
    }
  }, [showDownloadPanel, processedFileKey, loadSheet, savedPreviews, processedSheet])

  useEffect(() => {
    if (!uploading || uploadStart[activeKey] == null) return
    const timer = window.setInterval(() => {
      setUploadElapsedSec((prev) => ({
        ...prev,
        [activeKey]: Math.floor((Date.now() - (uploadStart[activeKey] as number)) / 1000),
      }))
    }, 500)
    return () => window.clearInterval(timer)
  }, [uploading, uploadStart, activeKey])

  return (
    <div className="dash-shell">
      <header className="dash-header-bar">
        <div className="header-title">時間外労働管理システム</div>
      </header>
      <div className="dash-layout">
        <Sidebar
          defs={defs}
          fileOrder={FILE_ORDER}
          activeSheet={activeSheet}
          onChangeSheet={setActiveSheet}
          onCloseDownloadPanel={() => setShowDownloadPanel(false)}
          showDownloadPanel={showDownloadPanel}
          onShowDownload={() => setShowDownloadPanel(true)}
        />

        <div className="dash-main">
          <div className="dash-content">
            {showDownloadPanel ? (
              <DownloadPanel
                heading={REPORT_HEADING}
                subtitle={downloadSubtitle}
                exportStatus={exportStatus}
                toast={toast}
                onGenerate={handleGenerateDownload}
                onCancel={handleCancelExport}
                onClear={handleClearExportTable}
              />
            ) : (
              <>
                <UploadSection
                  uploadedName={uploadedName}
                  uploadMessage={uploadMessage}
                  uploadError={uploadError}
                  uploading={uploading}
                  uploadElapsedSec={uploadElapsedSec[activeKey]}
                  uploadEstimateSec={uploadEstimateSec[activeKey]}
                  activeKey={activeKey}
                  onClear={handleClearPageData}
                  onFileSelected={handleFile}
                  rightContent={
                    <form className="search-bar" onSubmit={handleSearchSubmit}>
                      <Search size={16} className="search-icon" />
                      <input
                        type="search"
                        className="search-input"
                        placeholder=""
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                      />
                      <button className="search-button" type="submit" disabled={loading && bodyRows.length === 0}>
                        検索
                      </button>
                      {lastSearch && (
                        <button type="button" className="search-chip" onClick={handleClearSearch}>
                          <span>検索中: {lastSearch}</span>
                          <X size={14} />
                        </button>
                      )}
                    </form>
                  }
                />
                <SheetTable
                  headers={headers}
                  rows={rowsForDisplay}
                  title={TABLE_TITLE}
                  loading={loading}
                  error={error}
                  emptyMessage={filteredRows ? '該当するデータがありません' : 'データがありません'}
                />
              </>
            )}
            {showDownloadPanel && (
              <div style={{ marginTop: '12px' }}>
                {BRANCH_GROUPS.map((group) => {
                  const branchRows = groupedRowsByBranch[group.key] || []
                  const btnStatus = branchExportStatus[group.key] || 'idle'
                  const btnLabel =
                    btnStatus === 'exporting' ? '出力中...' : btnStatus === 'success' ? '完了' : 'Excel出力'
                  const disabled = btnStatus === 'exporting' || branchRows.length === 0
                  return (
                    <div key={group.key} style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
                          {group.label}{' '}
                          <span style={{ fontSize: '13px', color: '#666' }}>（{branchRows.length}件）</span>
                        </h3>
                        <button
                          className="btn-outline-blue"
                          style={{
                            minWidth: '130px',
                            opacity: disabled ? 0.6 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                          disabled={disabled}
                          onClick={() => handleExportBranch(group.key, group.label)}
                          title={branchRows.length === 0 ? '出力対象がありません' : ''}
                        >
                          <DownloadIcon size={16} />
                          <span>{btnLabel}</span>
                        </button>
                      </div>
                      <SheetTable
                        headers={EXPORT_HEADERS}
                        rows={branchRows}
                        title={TABLE_TITLE}
                        loading={loading}
                        error={error}
                        emptyMessage="0件"
                      />
                    </div>
                  )
                })}
                {unmatchedCount > 0 && (
                  <div style={{ marginTop: '4px', color: '#a15c00', fontSize: '13px' }}>
                    所属名称2が分類できないデータが {unmatchedCount} 件あります
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
