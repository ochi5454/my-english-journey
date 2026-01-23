'use client'

import { Search, X, Trash2 } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DownloadPanel } from './components/DownloadPanel'
import { SheetTable } from './components/SheetTable'
import { Sidebar } from './components/Sidebar'
import { UploadSection } from './components/UploadSection'
import { API_BASE, FALLBACK_DEFS, FILE_ORDER, REPORT_HEADING, TABLE_TITLE } from './constants/excel'
import { FileDef, SheetPayload } from './types/excel'
import * as XLSX from 'xlsx'
import { useImportDataStore, setImportData, clearImportData } from './store/useImportDataStore'
import type { ExportWorkerRequest, ExportWorkerResponse, GridPayload } from './workers/exportWorker'

const SEARCH_TARGET_HEADERS = ['案件名', '現場名', '仕入先名']
const stripParens = (value: unknown) => {
  if (value == null) return ''
  const str = String(value)
  // Remove any parenthetical segments and stray parentheses to keep UI labels clean
  return str.replace(/\([^)]*\)|（[^）]*）/g, '').replace(/[()（）]/g, '').trim()
}
const stripNoise = (value: unknown) =>
  stripParens(value)
    .replace(/[,、，.。・･…‥]/g, '')
    .replace(/\s|　/g, '')
const isMeaningfulRow = (row: string[]) =>
  row.some((cell) => stripNoise(cell).length > 0)
const stripArray = (arr: unknown): string[] => (Array.isArray(arr) ? arr.map((v) => String(v ?? '')) : [])
const sanitizeDefs = (defs: Record<string, FileDef>) =>
  Object.fromEntries(
    Object.entries(defs).map(([key, def]) => [
      key,
      {
        ...def,
        expected_headers: (def.expected_headers || []).map(stripParens),
      },
    ]),
  )
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
  overtime: ['実所定外時間', '残業時間', '残業', '(時間)実所定外時間'],
  overtime_detail: ['残業時間', '実所定外時間', '(時間)残業時間'],
  call_time: ['呼出出勤時間', '呼出出勤', '(時間)呼出出勤'],
  org_code: ['所属コード', '(人事所属本務(基準日))所属コード'],
  org1: ['所属名称1', '所属名称１', '所属1', '(人事所属本務(基準日))所属名称１'],
  org2: ['所属名称2', '所属名称２', '所属2', '(人事所属本務(基準日))所属名称２'],
  org3: ['所属名称3', '所属名称３', '所属3', '(人事所属本務(基準日))所属名称３'],
  org4: ['所属名称4', '所属名称４', '所属4', '(人事所属本務(基準日))所属名称４'],
  org5: ['所属名称5', '所属名称５', '所属5', '(人事所属本務(基準日))所属名称５'],
  org6: ['所属名称6', '所属名称６', '所属6', '(人事所属本務(基準日))所属名称６'],
  org7: ['所属名称7', '所属名称７', '所属7', '(人事所属本務(基準日))所属名称７'],
  org8: ['所属名称8', '所属名称８', '所属8', '(人事所属本務(基準日))所属名称８'],
  grade_code: ['従業員区分(ｺｰﾄﾞ)', '(従業員区分(基準日))従業員区分(ｺｰﾄﾞ)'],
  grade: ['従業員区分', 'グレード', '(従業員区分(基準日))従業員区分'],
  role_code: ['職制(ｺｰﾄﾞ)', '(職制(基準日))職制(ｺｰﾄﾞ)'],
  role: ['職制', '役職', '(職制(基準日))職制'],
  profit_code: ['損益管理コード(ｺｰﾄﾞ)', '(人事所属本務(基準日))損益管理コード(ｺｰﾄﾞ)'],
  profit: ['損益管理コード', '(人事所属本務(基準日))損益管理コード'],
  email: ['アドレス1', 'メールアドレス', '(メールアドレス情報)アドレス1'],
  hire_date: ['入社年月日', '(基本)入社年月日'],
}
const asString = (value: unknown) => (value == null ? '' : String(value))
const EXPORT_HEADERS = [
  '従業員\n番号',
  '氏名',
  '勤務予定',
  '実所定外\n時間',
  '残業時間',
  '呼出出勤\n時間',
  'グレード',
  '職制',
  '所属名称２',
  '所属名称３',
  '所属名称４',
  '所属名称５',
  '所属名称６',
  '所属名称７',
  '所属名称８',
] as const
const LEGEND_ROWS = [
  { label: '80h超', desc: '長時間労働', color: '6b4f00', textColor: 'f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', color: 'd0a754', textColor: '1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', color: 'e6a600', textColor: '1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', color: 'c7b202', textColor: '0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', color: '1f8a55', textColor: 'fdfdfd' },
  { label: '15h〜20h', desc: '', color: '5f86c6', textColor: 'fdfdfd' },
] as const

export default function Home() {
  const [activeSheet, setActiveSheet] = useState(0)
  const [defs, setDefs] = useState<Record<string, FileDef>>(() => sanitizeDefs(FALLBACK_DEFS))
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
  const [exportSearchInput, setExportSearchInput] = useState('')
  const [exportFilteredRows, setExportFilteredRows] = useState<string[][] | null>(null)
  const [exportLastSearch, setExportLastSearch] = useState('')
  const [workerExportRows, setWorkerExportRows] = useState<string[][]>([])
  const workerRef = useRef<Worker | null>(null)
  const [loadingExport, setLoadingExport] = useState(false)
  const { data: savedPreviews } = useImportDataStore()
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

  const processedFileKey = 'org_info'
  const activeKey = FILE_ORDER[activeSheet]
  const activeDef = defs[activeKey] ?? { display_name: activeKey, expected_headers: [] }
  const subtitle = activeDef.display_name
  const downloadSubtitle = defs[processedFileKey]?.display_name ?? '加工済みデータ'

  useEffect(() => {
    document.title = '時間外労働管理システム'
  }, [])

  useEffect(() => {
    const loadDefs = async () => {
      try {
        const res = await fetch(`${API_BASE}/excel/config`)
        if (!res.ok) throw new Error('config load failed')
        const json = await res.json()
        setDefs((prev) => ({ ...prev, ...sanitizeDefs(json) }))
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
        setImportData(key, {
          headers: sheetPayload.headers ?? [],
          rows: sheetPayload.rows ?? [],
          fileName: json.file_name,
          importedAt: new Date().toISOString(),
        })
      }
      return json
    } catch {
      setError('データ取得に失敗しました。バックエンドが起動しているか確認してください。')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

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
        setImportData(activeKey, {
          headers: preview.headers,
          rows: preview.rows,
          fileName: file.name,
          importedAt: new Date().toISOString(),
        })
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
        setImportData(activeKey, {
          headers: sheetPayload.headers ?? [],
          rows: sheetPayload.rows ?? [],
          fileName: file.name,
          importedAt: new Date().toISOString(),
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
    clearImportData(activeKey)
    setUploadedName(null)
    setUploadMessage(null)
    setUploadError(null)
    setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
    setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
    setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
  }

  const handleGenerateDownload = async () => {
    // エクスポートボタン削除に伴い未使用。将来のためのダミー。
  }

  const handleClearExportTable = () => {
    const ok = window.confirm('エクスポート用の表示データを削除しますか？')
    if (!ok) return
    setSheetData((prev) => ({ ...prev, [processedFileKey]: null }))
    clearImportData(processedFileKey)
  }

  const sheet = sheetData[activeKey]?.sheets?.[0]
  const grid = useMemo(() => {
    const fallbackHeaders = activeDef.expected_headers ?? []
    const cached = savedPreviews[activeKey]
    const cachedRows = cached?.rows || []
    if (cached && cachedRows.length > 0) {
      return [cached.headers?.length ? cached.headers : fallbackHeaders, ...cachedRows]
    }
    if (sheet?.grid?.length && (sheet.grid.length > 1 || isMeaningfulRow(stripArray(sheet.grid[1] ?? [])))) {
      return sheet.grid
    }
    if (sheet?.headers?.length && (sheet.rows?.length ?? 0) > 0) {
      return [sheet.headers, ...(sheet.rows ?? [])]
    }
    return [fallbackHeaders]
  }, [sheet, activeDef, savedPreviews, activeKey])

  const headers = grid[0] || []
  const bodyRows = grid.slice(1)
  const displayHeaders = useMemo(() => headers.map(stripParens), [headers])
  const rowsForDisplay = useMemo(
    () => (filteredRows ?? bodyRows).map((row) => row.map(stripParens)),
    [filteredRows, bodyRows],
  )
  const rowsMeaningful = useMemo(() => rowsForDisplay.filter(isMeaningfulRow), [rowsForDisplay])
  const hasImportData = rowsMeaningful.length > 0
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

    const EXCLUDED_ORG_VALUES = ['AI-DATA_GROUP', 'イオンディライト']

    return rows.map((r) => {
      // 所属名称1〜8を集め、除外ワードを外して上位7件を所属名称２〜８に充当
      const orgValues = [
        pick(r, 'org1', ''),
        pick(r, 'org2', ''),
        pick(r, 'org3', ''),
        pick(r, 'org4', ''),
        pick(r, 'org5', ''),
        pick(r, 'org6', ''),
        pick(r, 'org7', ''),
        pick(r, 'org8', ''),
      ]

      const filteredOrgs = orgValues
        .map((v) => v.trim())
        .filter((v) => v && !EXCLUDED_ORG_VALUES.includes(v))

      const org2to8 = Array(7).fill('')
      filteredOrgs.forEach((val, idx) => {
        if (idx < 7) {
          org2to8[idx] = val
        }
      })

      // 指示変更: 所属名称3は3へ、所属名称6は6へそのまま出力する（移動しない）

      return [
        pick(r, 'emp_no', ''),
        pick(r, 'name', ''),
        pick(r, 'status', ''),
        pick(r, 'overtime', ''),
        pick(r, 'overtime_detail', pick(r, 'overtime', '')),
        pick(r, 'call_time', ''),
        pick(r, 'grade', ''),
        pick(r, 'role', ''),
        ...org2to8, // 所属名称２〜８
      ]
    })
  }, [buildColumnMap])

  const NUMERIC_TIME_INDEXES: number[] = [3, 4, 5]
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

  const buildGridForKey = useCallback(
    (key: string) => {
      const fallbackHeaders = defs[key]?.expected_headers ?? []
      const cached = savedPreviews[key]
      const cachedRows = cached?.rows || []
      if (cached && cachedRows.length > 0) {
        return [cached.headers?.length ? cached.headers : fallbackHeaders, ...cachedRows]
      }
      const sheet = sheetData[key]?.sheets?.[0]
      if (sheet?.grid?.length && (sheet.grid.length > 1 || isMeaningfulRow(stripArray(sheet.grid[1] ?? [])))) {
        return sheet.grid
      }
      if (sheet?.headers?.length && (sheet.rows?.length ?? 0) > 0) {
        return [sheet.headers, ...(sheet.rows ?? [])]
      }
      return [fallbackHeaders]
    },
    [defs, savedPreviews, sheetData],
  )

  const exportSourceGrids = useMemo(() => {
    const grids: GridPayload[] = []
    FILE_ORDER.slice(0, 6).forEach((key) => {
      const grid = buildGridForKey(key)
      const headers = grid[0] || []
      const body = grid.slice(1)
      if (!body.length) return
      grids.push({ headers, rows: body })
    })
    return grids
  }, [buildGridForKey])

  const combinedMappedRows = useMemo(() => {
    const rows: string[][] = []
    FILE_ORDER.slice(0, 6).forEach((key) => {
      const grid = buildGridForKey(key)
      const headers = grid[0] || []
      const body = grid.slice(1)
      if (!body.length) return
      const mapped = mapRowsToExport(headers, body)
      mapped.forEach((r) => rows.push(r))
    })
    return rows
  }, [buildGridForKey, mapRowsToExport])

  const exportRows = useMemo(() => {
    if (workerExportRows.length) return workerExportRows

    const t0 = performance.now()
    const meaningfulRows = combinedMappedRows.filter((row) => row.some((cell) => (cell ?? '').toString().trim() !== ''))
    const result = mergeByEmployee(meaningfulRows)

    const elapsed = performance.now() - t0
    if (result.length > 0) {
      console.log(`[Performance] Export calculation (fallback): ${elapsed.toFixed(2)}ms (${result.length} rows)`)
    }

    return result
  }, [combinedMappedRows, mergeByEmployee, workerExportRows])

  const exportRowsDisplay = useMemo(
    () => exportRows.map((row) => row.map(stripParens)).filter(isMeaningfulRow),
    [exportRows]
  )

  const normalizeSearchText = useCallback((value: string) => {
    const base = (value ?? '').trim().toLowerCase()
    return base.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  }, [])

  const applyExportSearch = useCallback(
    (query: string, options: { persistLast?: boolean } = {}) => {
      const { persistLast = true } = options
      const normalizedQuery = normalizeSearchText(query)
      if (!normalizedQuery) {
        setExportFilteredRows(null)
        if (persistLast) {
          setExportLastSearch('')
        }
        return
      }
      if (persistLast) {
        setExportLastSearch(query.trim())
      }
      const matches = exportRowsDisplay.filter((row) =>
        row.some((cell) => normalizeSearchText(asString(cell)).includes(normalizedQuery))
      )
      setExportFilteredRows(matches)
    },
    [exportRowsDisplay, normalizeSearchText]
  )

  const handleExportSearchSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      applyExportSearch(exportSearchInput)
    },
    [applyExportSearch, exportSearchInput]
  )

  const handleClearExportSearch = useCallback(() => {
    setExportSearchInput('')
    setExportFilteredRows(null)
      setExportLastSearch('')
    }, [])

  useEffect(() => {
    if (exportLastSearch.trim()) {
      applyExportSearch(exportLastSearch, { persistLast: false })
    }
  }, [applyExportSearch, exportRows, exportLastSearch])

  // エクスポートページを開いたときのローディング管理
  useEffect(() => {
    if (showDownloadPanel) {
      setLoadingExport(true)
      // 計算完了を待つ（次のティックで完了している想定）
      const timer = setTimeout(() => {
        setLoadingExport(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [showDownloadPanel, exportRows])

  const exportRowsForDisplay = exportFilteredRows ?? exportRowsDisplay
  const hasExportData = exportRowsForDisplay.length > 0
  const exportHeadersDisplay = useMemo(() => EXPORT_HEADERS.map(stripParens), [])

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
    if (!uploading || uploadStart[activeKey] == null) return
    const timer = window.setInterval(() => {
      setUploadElapsedSec((prev) => ({
        ...prev,
        [activeKey]: Math.floor((Date.now() - (uploadStart[activeKey] as number)) / 1000),
      }))
    }, 500)
    return () => window.clearInterval(timer)
  }, [uploading, uploadStart, activeKey])

  // Offload heavy export mapping to Web Worker
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setWorkerExportRows([])
      return
    }
    const worker = new Worker(new URL('./workers/exportWorker.ts', import.meta.url))
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
      setWorkerExportRows(e.data.exportRows || [])
    }
    const payload: ExportWorkerRequest = { grids: exportSourceGrids }
    worker.postMessage(payload)
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [exportSourceGrids])

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
                toast={toast}
                onClear={handleClearExportTable}
                rightContent={
                  <form className="search-bar" onSubmit={handleExportSearchSubmit} style={{ margin: 0, minWidth: '260px' }}>
                    <Search size={16} className="search-icon" />
                    <input
                      type="search"
                      className="search-input"
                      placeholder="検索"
                      value={exportSearchInput}
                      onChange={(e) => setExportSearchInput(e.target.value)}
                    />
                    <button className="search-button" type="submit">
                      検索
                    </button>
                    {exportLastSearch && (
                      <button type="button" className="search-chip" onClick={handleClearExportSearch}>
                        <span>検索中: {exportLastSearch}</span>
                        <X size={14} />
                      </button>
                    )}
                  </form>
                }
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
                />
                <SheetTable
                  topContent={
                    <>
                      <div className="upload-actions">
                        <button
                          type="button"
                          className="btn-outline-red"
                          onClick={handleClearPageData}
                          style={{ cursor: 'pointer' }}
                        >
                          <Trash2 size={18} />
                          <span>削除</span>
                        </button>
                      </div>
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
                    </>
                  }
                  headers={displayHeaders}
                  rows={rowsMeaningful}
                  title={TABLE_TITLE}
                  loading={loading}
                  error={error}
                  emptyMessage={filteredRows ? '該当するデータがありません' : 'データがありません'}
                  showOnlyFirstColumn={false}
                  hideBodyWhenEmpty={rowsMeaningful.length === 0}
                />
              </>
            )}
            {showDownloadPanel && (
              <div style={{ marginTop: '12px' }}>
                <SheetTable
                  headers={exportHeadersDisplay}
                  rows={loadingExport ? [] : exportRowsForDisplay}
                  title={TABLE_TITLE}
                  loading={loadingExport || loading}
                  error={error}
                  emptyMessage={loadingExport ? 'データを計算中...' : exportFilteredRows ? '該当するデータがありません' : '出力対象がありません'}
                  showOnlyFirstColumn={false}
                  hideBodyWhenEmpty={exportRowsForDisplay.length === 0 && !loadingExport}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
