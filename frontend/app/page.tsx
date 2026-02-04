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
import { estimateEtaSeconds, loadSpeed, saveSpeed, updateSpeedEma } from './utils/eta'
import { useJobUpload } from './hooks/useJobUpload'
import { jobClient } from './api/jobClient'
import { AuthGuard } from './components/AuthGuard'
import { HeaderBar } from './components/HeaderBar'

const DEFAULT_PAGE_SIZE = 25
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
const normalizeEmpNo = (value: unknown) => stripParens(value ?? '').trim().replace(/^0+/, '')
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
  status: ['進捗状況', '勤務予定', '勤務予定日', '勤務予定区分', '勤務状況'],
  overtime: ['実所定外時間', '残業時間', '残業', '(時間)実所定外時間'],
  overtime_detail: ['残業時間', '実所定外時間', '(時間)残業時間'],
  call_time: ['呼出出勤時間', '呼出出勤', '(時間)呼出出勤'],
  org_code: ['所属コード', '(人事所属本務(基準日))所属コード'],
  org1: ['所属名称1', '所属名称１', '所属1', '所属情報1', '所属情報１', '(人事所属本務(基準日))所属名称１'],
  org2: ['所属名称2', '所属名称２', '所属2', '所属情報2', '所属情報２', '(人事所属本務(基準日))所属名称２'],
  org3: ['所属名称3', '所属名称３', '所属3', '所属情報3', '所属情報３', '(人事所属本務(基準日))所属名称３'],
  org4: ['所属名称4', '所属名称４', '所属4', '所属情報4', '所属情報４', '(人事所属本務(基準日))所属名称４'],
  org5: ['所属名称5', '所属名称５', '所属5', '所属情報5', '所属情報５', '(人事所属本務(基準日))所属名称５'],
  org6: ['所属名称6', '所属名称６', '所属6', '所属情報6', '所属情報６', '(人事所属本務(基準日))所属名称６'],
  org7: ['所属名称7', '所属名称７', '所属7', '所属情報7', '所属情報７', '(人事所属本務(基準日))所属名称７'],
  org8: ['所属名称8', '所属名称８', '所属8', '所属情報8', '所属情報８', '(人事所属本務(基準日))所属名称８'],
  grade_code: ['従業員区分(ｺｰﾄﾞ)', '(従業員区分(基準日))従業員区分(ｺｰﾄﾞ)'],
  grade: [
    '従業員区分',
    'グレード',
    'キャリアグレード',
    'キャリア グレード',
    '所属情報のキャリアグレード',
    '(従業員区分(基準日))従業員区分',
  ],
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
  const [overtimeSearchInput, setOvertimeSearchInput] = useState('')
  const [overtimeFilteredRows, setOvertimeFilteredRows] = useState<string[][] | null>(null)
  const [overtimeLastSearch, setOvertimeLastSearch] = useState('')
  const [loadingExport, setLoadingExport] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [exportEtaSec, setExportEtaSec] = useState<number | null>(null)
  const etaTimerRef = useRef<number | null>(null)
  const [exportTotalRows, setExportTotalRows] = useState(0)
  const [exportProcessedRows, setExportProcessedRows] = useState(0)
  const [exportStartAt, setExportStartAt] = useState<number | null>(null)
  const [exportSpeed, setExportSpeed] = useState<number>(() => loadSpeed())
  const [overtimeRowsDisplay, setOvertimeRowsDisplay] = useState<string[][]>([])
  const [showOvertimePanel, setShowOvertimePanel] = useState(false)
  const [overtimeOverrideMap, setOvertimeOverrideMap] = useState<Record<string, { actual?: number; overtime?: number }>>({})
  // 全データ用のstate（ルックアップマップ構築用）
  const [allPersonProgressData, setAllPersonProgressData] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [allOrgInfoData, setAllOrgInfoData] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const { data: savedPreviews } = useImportDataStore()

  useEffect(() => {
    // Hydrate client-only cached export data after mount to avoid SSR/client mismatches
    const normalizeOvertimeRows = (rows: unknown): string[][] => {
      if (!Array.isArray(rows)) return []
      return rows.map((r) => {
        if (!Array.isArray(r)) return []
        const isTimeLike = (v: unknown) => {
          const s = String(v ?? '').trim()
          return /^\d{1,3}:\d{2}$/.test(s) || /^\d+$/.test(s)
        }
        // 期待: [従業員番号, 前, 後, 合計, 所属6]
        if (r.length >= 5) {
          const a = String(r[1] ?? '')
          const b = String(r[2] ?? '')
          const c = String(r[3] ?? '')
          const d = String(r[4] ?? '')
          // 旧並び [emp, org6, start, end, total]
          if (!isTimeLike(a) && isTimeLike(b) && isTimeLike(c)) {
            return [String(r[0] ?? ''), b, c, d, a]
          }
          return [String(r[0] ?? ''), a, b, c, d]
        }
        if (r.length === 4) {
          // v1 (従業員番号 + 3列のみ)
          return [String(r[0] ?? ''), String(r[1] ?? ''), String(r[2] ?? ''), String(r[3] ?? ''), '']
        }
        return r.map((v) => String(v ?? ''))
      })
    }
    try {
      const savedEstimated = localStorage.getItem('exportData_estimated')
      if (savedEstimated) {
        setWorkerExportRows(JSON.parse(savedEstimated))
      }
      const savedOvertime = localStorage.getItem('exportData_overtime')
      if (savedOvertime) {
        setOvertimeRowsDisplay(normalizeOvertimeRows(JSON.parse(savedOvertime)))
      }
      const ts = localStorage.getItem('exportData_timestamp')
      if (ts) {
        exportFetchedOnceRef.current = true
      }
    } catch (e) {
      console.warn('[Export] Failed to load cached export data:', e)
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
        const res = await fetch(`${API_BASE}/excel/config`, { credentials: 'include' })
        if (!res.ok) throw new Error('config load failed')
        const json = await res.json()
        setDefs((prev) => ({ ...prev, ...sanitizeDefs(json) }))
      } catch {
        // フォールバック定義を使う
      }
    }
    loadDefs()
  }, [])

  const [datasetIds, setDatasetIds] = useState<Record<string, string | null>>({})
  const [pageByKey, setPageByKey] = useState<Record<string, number>>({})
  const [pageSizeByKey, setPageSizeByKey] = useState<Record<string, number>>({})
  const [totalByKey, setTotalByKey] = useState<Record<string, number>>({})

  const loadSheet = useCallback(async (key: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
    setLoading(true)
    setError(null)
    try {
      let datasetId = datasetIds[key]
      if (!datasetId) {
        const listRes = await fetch(`${API_BASE}/datasets?kind=${key}`, { credentials: 'include' })
        if (listRes.ok) {
          const listJson = await listRes.json()
          const ready = Array.isArray(listJson) ? listJson.find((d) => d?.status === 'ready') : null
          datasetId = ready?.id ?? null
          setDatasetIds((prev) => ({ ...prev, [key]: datasetId }))
        }
      }

      if (!datasetId) {
        const fallbackHeaders = defs[key]?.expected_headers ?? []
        const grid = [fallbackHeaders]
        const payload: SheetPayload = {
          file_key: key,
          file_name: '',
          version: 1,
          sheets: [{ name: 'Sheet1', headers: fallbackHeaders, rows: [], grid }],
          expected_headers: fallbackHeaders,
        }
        setSheetData((prev) => ({ ...prev, [key]: payload }))
        setPageByKey((prev) => ({ ...prev, [key]: 1 }))
        setPageSizeByKey((prev) => ({ ...prev, [key]: pageSize }))
        setTotalByKey((prev) => ({ ...prev, [key]: grid.length - 1 }))
        return payload
      }

      const res = await fetch(`${API_BASE}/datasets/${datasetId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ page, pageSize }),
      })
      if (!res.ok) {
        throw new Error('fetch failed')
      }
      const json = await res.json()
      const headers = (json?.columns as string[]) ?? []
      const rows = (json?.rows as string[][]) ?? []
      const total = Number(json?.total) || rows.length
      const pageFromServer = Number(json?.page) || page
      const pageSizeFromServer = Number(json?.pageSize) || pageSize
      const grid = [headers, ...rows]
      const payload: SheetPayload = {
        file_key: key,
        file_name: '',
        version: 1,
        sheets: [{ name: 'Sheet1', headers, rows, grid }],
        expected_headers: defs[key]?.expected_headers ?? [],
      }
      setSheetData((prev) => ({ ...prev, [key]: payload }))
      setPageByKey((prev) => ({ ...prev, [key]: pageFromServer }))
      setPageSizeByKey((prev) => ({ ...prev, [key]: pageSizeFromServer }))
      setTotalByKey((prev) => ({ ...prev, [key]: total }))
      const sheetPayload = payload.sheets?.[0]
      if (sheetPayload) {
        setImportData(key, {
          headers: sheetPayload.headers ?? [],
          rows: sheetPayload.rows ?? [],
          fileName: payload.file_name,
          importedAt: new Date().toISOString(),
        })
      }
      return payload
    } catch (err) {
      console.warn('[LoadSheet] failed:', err)
      // avoid noisy error message; keep silent for UX
      return null
    } finally {
      setLoading(false)
    }
  }, [datasetIds, defs, setImportData])

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
    // load once per activeKey; avoid dependency on loadSheet to prevent refetch loop when callbacks change
    const initialPage = pageByKey[activeKey] ?? 1
    const initialSize = pageSizeByKey[activeKey] ?? DEFAULT_PAGE_SIZE
    loadSheet(activeKey, initialPage, initialSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

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
      const res = await fetch(`${API_BASE}/excel/${activeKey}/upload`, { method: 'POST', body: fd, credentials: 'include' })
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
      const uploadJson = await res.json()
      if (uploadJson?.dataset_id || uploadJson?.id) {
        setDatasetIds((prev) => ({ ...prev, [activeKey]: uploadJson.dataset_id || uploadJson.id }))
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
      // エラー表示は行わず、空のままにして気付けるようにする
      setUploadError(null)
      setUploadMessage(null)
    } finally {
      setUploading(false)
      setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
      setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
      setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
    }
  }

  /**
   * 新しい非同期版のファイルアップロード処理
   *
   * ナレッジリファレンスのパターンに従う:
   * - HTTP 202 Acceptedで即座にjob_idを返す
   * - バックグラウンドで処理を実行
   * - ポーリングで進捗確認
   */
  const handleFileAsync = async (file?: File) => {
    if (!file) return

    setUploadedName(file.name)
    setUploadMessage(null)
    setUploadError(null)
    setUploading(true)
    setUploadStart((prev) => ({ ...prev, [activeKey]: Date.now() }))
    setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))

    try {
      // ローカルプレビュー（即座に表示）
      const preview = await parseLocalPreview(file)
      if (preview) {
        setImportData(activeKey, {
          headers: preview.headers,
          rows: preview.rows,
          fileName: file.name,
          importedAt: new Date().toISOString(),
        })
      }

      // 非同期アップロード開始
      console.log('[Upload] Starting async upload for', activeKey)
      const response = await jobClient.uploadFileAsync(file, activeKey)
      console.log('[Upload] Job created:', response.job_id)

      setUploadMessage(`処理中... (Job ID: ${response.job_id})`)

      // ポーリング
      const finalStatus = await jobClient.pollUntilComplete(
        response.job_id,
        (status) => {
          // 進捗更新
          const percent = status.progress.percent
          const processed = status.progress.processed
          const total = status.progress.total

          console.log(`[Upload] Progress: ${percent}% (${processed}/${total})`)

          // UIに進捗を表示
          if (total > 0) {
            setUploadMessage(`処理中... ${percent}% (${processed}/${total})`)
          }
        },
        2000 // 2秒間隔でポーリング
      )

      console.log('[Upload] Completed:', finalStatus)

      // 完了後、データセットIDを保存
      if (finalStatus.result?.dataset_id) {
        setDatasetIds((prev) => ({
          ...prev,
          [activeKey]: finalStatus.result.dataset_id
        }))
      }

      // データを再読み込み
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
      console.error('[Upload] Error:', e)
      setUploadError(e?.message || 'アップロードに失敗しました')
      setUploadMessage(null)
    } finally {
      setUploading(false)
      setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
      setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
    }
  }

  const handleGenerateDownload = async () => {
    // エクスポートボタン削除に伴い未使用。将来のためのダミー。
  }

  const handleClearExportTable = () => {
    const ok = window.confirm('エクスポート用の表示データを削除しますか？')
    if (!ok) return
    setSheetData((prev) => ({ ...prev, [processedFileKey]: null }))
    clearImportData(processedFileKey)

    // エクスポートデータもクリア
    setWorkerExportRows([])
    setOvertimeRowsDisplay([])

    // localStorage からも削除
    try {
      localStorage.removeItem('exportData_estimated')
      localStorage.removeItem('exportData_overtime')
      localStorage.removeItem('exportData_timestamp')
      console.log('[Export] Data cleared from localStorage')
    } catch (e) {
      console.warn('[Export] Failed to clear localStorage:', e)
    }
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
  const currentPage = pageByKey[activeKey] ?? 1
  const currentPageSize = pageSizeByKey[activeKey] ?? DEFAULT_PAGE_SIZE
  const totalRowsForPagination = filteredRows ? rowsMeaningful.length : totalByKey[activeKey] ?? rowsMeaningful.length
  const handlePageChange = useCallback(
    (nextPage: number) => {
      const size = pageSizeByKey[activeKey] ?? DEFAULT_PAGE_SIZE
      setPageByKey((prev) => ({ ...prev, [activeKey]: nextPage }))
      loadSheet(activeKey, nextPage, size)
    },
    [activeKey, loadSheet, pageSizeByKey],
  )
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSizeByKey((prev) => ({ ...prev, [activeKey]: size }))
      setPageByKey((prev) => ({ ...prev, [activeKey]: 1 }))
      loadSheet(activeKey, 1, size)
    },
    [activeKey, loadSheet],
  )
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

  const mergeByEmployee = (rows: string[][], overrides: Record<string, { actual?: number; overtime?: number }> = {}) => {
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
    grouped.forEach(({ base, sums }, empNo) => {
      const out = [...base]
      const override = overrides[empNo]
      const actual = override?.actual
      const overtime = override?.overtime
      out[3] = formatMinutes(actual ?? sums[3])
      out[4] = formatMinutes(overtime ?? sums[4])
      out[5] = formatMinutes(sums[5])
      mergedRows.push(out)
    })
    return [...mergedRows, ...orphanRows]
  }

  const hhmmToMinutes = (value: string | number | undefined | null): number | null => {
    if (value == null) return null
    const str = String(value).trim()
    if (!str) return null
    if (str.includes(':')) {
      const [h, m] = str.split(':').map((v) => Number(v) || 0)
      if (m >= 60 || h < 0) return null
      return h * 60 + m
    }
    const num = Number(str)
    if (!Number.isFinite(num)) return null
    const h = Math.floor(num / 100)
    const m = num % 100
    if (m >= 60 || h < 0) return null
    return h * 60 + m
  }

  const minutesToHHMM = (minutes: number | null | undefined) => {
    if (minutes == null || !Number.isFinite(minutes)) return ''
    const safe = Math.max(0, Math.round(minutes))
    const h = Math.floor(safe / 60)
    const m = safe % 60
    return `${h}:${m.toString().padStart(2, '0')}`
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
    // エクスポートパネルが開いているときだけ計算
    if (!showDownloadPanel) return []
    const grids: GridPayload[] = []
    FILE_ORDER.slice(0, 6).forEach((key) => {
      const grid = buildGridForKey(key)
      const headers = grid[0] || []
      const body = grid.slice(1)
      if (!body.length) {
        console.log(`[ExportGrids] Skipping ${key}: no data (headers=${headers.length})`)
        return
      }
      console.log(`[ExportGrids] Adding ${key}: ${body.length} rows`)
      grids.push({ headers, rows: body })
    })
    console.log(`[ExportGrids] Total grids: ${grids.length}, total rows: ${grids.reduce((sum, g) => sum + g.rows.length, 0)}`)
    return grids
  }, [buildGridForKey, showDownloadPanel, savedPreviews, sheetData])

  const totalRowsForExport = useMemo(
    () => exportSourceGrids.reduce((sum, g) => sum + (g.rows?.length || 0), 0),
    [exportSourceGrids],
  )

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

  const [overtimeMap, setOvertimeMap] = useState<Record<string, { actual?: number; overtime?: number }>>({})

  // 従業員番号 -> グレード（キャリアグレード含む）のマップを作成（全データを使用）
  const orgGradeMap = useMemo(() => {
    // 全データがある場合はそちらを優先
    let headers: string[] = []
    let rows: string[][] = []
    if (allOrgInfoData && allOrgInfoData.rows.length > 0) {
      headers = allOrgInfoData.headers
      rows = allOrgInfoData.rows
    } else {
      // フォールバック: 従来のbuildGridForKey
      const grid = buildGridForKey('org_info')
      headers = grid[0] || []
      rows = grid.slice(1)
    }
    if (!rows.length) return {}

    const headerMap: Record<string, number> = {}
    headers.forEach((h, idx) => {
      headerMap[normalizeHeader(stripParens(h))] = idx
    })

    const findIdx = (names: string[]) => {
      for (const n of names) {
        const idx = headerMap[normalizeHeader(n)]
        if (idx != null) return idx
      }
      return undefined
    }

    const empIdx = findIdx(['従業員番号', '社員番号'])
    const gradeIdx = findIdx([
      'キャリアグレード',
      '所属情報のキャリアグレード',
      'キャリア グレード',
      '従業員区分',
      '従業員区分(ｺｰﾄﾞ)',
      '従業員区分コード',
      'グレード',
      '等級',
    ])
    if (empIdx == null || gradeIdx == null) return {}

    const map: Record<string, string> = {}
    rows.forEach((r) => {
      const empRaw = stripParens(r[empIdx] ?? '').trim()
      const grade = stripParens(r[gradeIdx] ?? '').trim()
      // 完全一致のみ：正規化キーは追加しない
      if (empRaw && grade) {
        map[empRaw] = grade
      }
    })
    return map
  }, [buildGridForKey, allOrgInfoData])

  // 勤務予定進捗一覧の進捗状況を従業員番号キーで保持（全データを使用）
  const progressStatusMap = useMemo(() => {
    // 全データがある場合はそちらを優先
    let headers: string[] = []
    let rows: string[][] = []
    if (allPersonProgressData && allPersonProgressData.rows.length > 0) {
      headers = allPersonProgressData.headers
      rows = allPersonProgressData.rows
    } else {
      // フォールバック: 従来のbuildGridForKey
      const grid = buildGridForKey('person_progress')
      headers = grid[0] || []
      rows = grid.slice(1)
    }
    if (!rows.length) return {}

    const headerMap: Record<string, number> = {}
    headers.forEach((h, idx) => {
      headerMap[normalizeHeader(stripParens(h))] = idx
    })

    const findIdx = (names: string[]) => {
      for (const n of names) {
        const idx = headerMap[normalizeHeader(n)]
        if (idx != null) return idx
      }
      return undefined
    }

    const empIdx = findIdx(['従業員番号', '社員番号', '社員no', '社員No'])
    const statusIdx = findIdx(['進捗状況', '勤務予定'])
    if (empIdx == null || statusIdx == null) return {}

    const map: Record<string, string> = {}
    rows.forEach((r) => {
      const empRaw = stripParens(r[empIdx] ?? '').trim()
      const status = stripParens(r[statusIdx] ?? '').trim()
      // 完全一致のみ：正規化キーは追加しない
      if (empRaw && status) {
        map[empRaw] = status
      }
    })
    return map
  }, [buildGridForKey, allPersonProgressData])

  const org6Map = useMemo(() => {
    // 全データがある場合はそちらを優先
    let headers: string[] = []
    let rows: string[][] = []
    if (allOrgInfoData && allOrgInfoData.rows.length > 0) {
      headers = allOrgInfoData.headers
      rows = allOrgInfoData.rows
    } else {
      // フォールバック: 従来のbuildGridForKey
      const grid = buildGridForKey('org_info')
      headers = grid[0] || []
      rows = grid.slice(1)
    }
    if (!rows.length) return {}

    const headerMap: Record<string, number> = {}
    headers.forEach((h, idx) => {
      headerMap[normalizeHeader(stripParens(h))] = idx
    })

    const findIdx = (names: string[]) => {
      for (const n of names) {
        const idx = headerMap[normalizeHeader(n)]
        if (idx != null) return idx
      }
      return undefined
    }

    const empIdx = findIdx(['従業員番号', '社員番号'])
    const org6Idx = findIdx(['所属情報6', '所属情報６', '所属名称6', '所属名称６'])
    if (empIdx == null || org6Idx == null) return {}

    const map: Record<string, string> = {}
    rows.forEach((r) => {
      const empRaw = stripParens(r[empIdx] ?? '').trim()
      const val = stripParens(r[org6Idx] ?? '').trim()
      // 完全一致のみ：正規化キーは追加しない
      if (empRaw && val) {
        map[empRaw] = val
      }
    })
    return map
  }, [buildGridForKey, allOrgInfoData])

  const enrichRows = useCallback(
    (rows: string[][]) => {
      const result = rows.map((r) => {
        const empRaw = (r?.[0] ?? '').trim()
        if (!empRaw) return r

        const next = [...r]

        // status (col 2) を勤務予定進捗一覧の進捗状況からのみ取得
        const status = progressStatusMap[empRaw]
        next[2] = status || ''

        // grade (col 6) - 完全一致のみ
        const gradeCurrent = stripParens(next[6] ?? '').trim()
        const grade = orgGradeMap[empRaw]
        if (!gradeCurrent && grade) {
          next[6] = grade
        }

        // org6 (col 12) - 完全一致のみ
        const org6Current = stripParens(next[12] ?? '').trim()
        const org6 = org6Map[empRaw]
        if (!org6Current && org6) {
          next[12] = org6
        }

        return next
      })

      return result
    },
    [progressStatusMap, orgGradeMap, org6Map],
  )

  useEffect(() => {
    const fetchOvertime = async () => {
      try {
        const res = await fetch(`${API_BASE}/excel/punches/overtime`, { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        const map: Record<string, { actual?: number; overtime?: number }> = {}
        ;(json?.rows || []).forEach((item: any) => {
          const emp = item?.emp_no?.toString().trim()
          if (!emp) return
          const minutes = Number(item?.total_minutes)
          if (!Number.isFinite(minutes)) return
          map[emp] = { actual: minutes, overtime: minutes }
        })
        setOvertimeMap(map)
      } catch {
        // ignore fetch errors
      }
    }
    fetchOvertime()
  }, [])

  const exportRows = useMemo(() => {
    if (workerExportRows.length) {
      // バックエンドから取得したデータは既にマージ・集計済みなので、そのまま返す
      console.log(`[Export] Using backend data: ${workerExportRows.length} rows (already merged)`)
      return enrichRows(workerExportRows)
    }

    // バックエンドから取得する方式なので、フォールバックは使用しない
    console.log('[Export] Waiting for backend data...')
    return []

    // 以下、古いフォールバックロジック（無効化）
    /*
    const t0 = performance.now()
    const meaningfulRows = combinedMappedRows.filter((row) => row.some((cell) => (cell ?? '').toString().trim() !== ''))
    const result = mergeByEmployee(meaningfulRows, { ...overtimeMap, ...overtimeOverrideMap })

    const elapsed = performance.now() - t0
    if (result.length > 0) {
      console.log(`[Performance] Export calculation (fallback): ${elapsed.toFixed(2)}ms (${result.length} rows)`)
    }

    return result
    */
  }, [workerExportRows, enrichRows])

  const exportRowsDisplay = useMemo(
    () => exportRows.map((row) => row.map(stripParens)).filter(isMeaningfulRow),
    [exportRows]
  )

  // 実所定外時間シート（推計）側の残業時間を権威値として保持（従業員番号→分）
  const authoritativeOvertimeMap = useMemo(() => {
    const map: Record<string, number> = {}
    exportRowsDisplay.forEach((row) => {
      const emp = normalizeEmpNo(row?.[0])
      if (!emp) return
      // 優先: 残業時間(index4)、なければ実所定外時間(index3)
      const minutes = parseMinutes(row?.[4] ?? row?.[3])
      if (Number.isFinite(minutes)) {
        map[emp] = minutes
      }
    })
    return map
  }, [exportRowsDisplay])

  // 実所定外時間（推計）テーブルの所属名称6を従業員番号で引けるよう保持
  const org6FromEstimated = useMemo(() => {
    const map: Record<string, string> = {}
    exportRowsDisplay.forEach((row) => {
      const emp = normalizeEmpNo(row?.[0])
      const org6 = stripParens(row?.[12] ?? '').trim()
      if (emp && org6) map[emp] = org6
    })
    return map
  }, [exportRowsDisplay])

  const overtimeHeadersDisplay = ['従業員番号', '就業開始前残業時間', '就業終了後残業時間', '合計残業時間', '所属名称６']
  const overtimeRowsForDisplay = overtimeFilteredRows ?? overtimeRowsDisplay

  const adjustOvertimeRow = useCallback(
    (r: string[]) => {
      const emp = normalizeEmpNo(r?.[0])
      const org6Fallback = stripParens(r?.[4] ?? r?.[1] ?? '')
      const org6 = org6FromEstimated[emp] ?? org6Fallback

      const startMin = parseMinutes(r?.[1])
      const endMin = parseMinutes(r?.[2])
      const totalMin = parseMinutes(r?.[3])

      const desired = authoritativeOvertimeMap[emp]
      if (desired == null || !Number.isFinite(desired)) {
        return [
          r?.[0] ?? '',
          formatMinutes(startMin),
          formatMinutes(endMin),
          formatMinutes(totalMin),
          org6,
        ]
      }

      const currentTotal = startMin + endMin
      let adjStart = startMin
      let adjEnd = endMin
      if (currentTotal > 0) {
        const ratio = desired / currentTotal
        adjStart = startMin * ratio
        adjEnd = endMin * ratio
      } else {
        // 内訳が無い場合は全量を開始前に寄せる
        adjStart = desired
        adjEnd = 0
      }

      return [
        r?.[0] ?? '',
        formatMinutes(adjStart),
        formatMinutes(adjEnd),
        formatMinutes(desired),
        org6,
      ]
    },
    [authoritativeOvertimeMap, org6FromEstimated],
  )

  const overtimeTableRowsForDisplay = useMemo(
    () => overtimeRowsForDisplay.map(adjustOvertimeRow),
    [overtimeRowsForDisplay, adjustOvertimeRow],
  )

  const handleDownloadExportExcel = useCallback(() => {
    try {
      if (exportRowsDisplay.length === 0) {
        setToast('エクスポートデータがありません')
        return
      }

      // 所属名称6（列インデックス12）でグルーピングしてファイルを分割
      const ORG6_COL = 12
      const groups: Record<string, string[][]> = {}
      exportRowsDisplay.forEach((row) => {
        const org6 = (row[ORG6_COL] || '').trim() || '未設定'
        if (!groups[org6]) groups[org6] = []
        groups[org6].push(row)
      })

      // 従業員番号で残業詳細をフィルタするためのマップを準備
      const overtimeByEmp = new Map<string, string[][]>()
      if (overtimeRowsDisplay.length > 0) {
        overtimeRowsDisplay.forEach((r) => {
          const emp = (r?.[0] ?? '').toString().trim()
          if (!emp) return
          if (!overtimeByEmp.has(emp)) overtimeByEmp.set(emp, [])
          overtimeByEmp.get(emp)!.push(r)
        })
      }

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '')

      Object.entries(groups).forEach(([org6, rows]) => {
        const wb = XLSX.utils.book_new()

        // シート1: グループの推計データ（凡例付き）
        const estimatedSheet = buildLegendSheet(rows)
        XLSX.utils.book_append_sheet(wb, estimatedSheet, 'データをエクスポート')

        // シート2: グループに属する従業員の残業時間詳細のみ
        if (overtimeRowsDisplay.length > 0) {
          const overtimeHeaders = ['従業員番号', '就業開始前残業時間', '就業終了後残業時間', '合計残業時間', '所属名称６']
          const empSet = new Set(rows.map((r) => (r?.[0] ?? '').toString().trim()))
          const overtimeFiltered = overtimeRowsDisplay
            .filter((r) => empSet.has((r?.[0] ?? '').toString().trim()))
            .map(adjustOvertimeRow)
          if (overtimeFiltered.length > 0) {
            const overtimeSheet = XLSX.utils.aoa_to_sheet([overtimeHeaders, ...overtimeFiltered])
            overtimeSheet['!cols'] = overtimeHeaders.map(() => ({ wch: 20 }))
            XLSX.utils.book_append_sheet(wb, overtimeSheet, '残業時間詳細')
          }
        }

        const safeOrg6 = org6.replace(/[\\\\/:*?\"<>|]/g, '_') || '未設定'
        const filename = `時間外労働_エクスポート_${safeOrg6}_${dateStr}_${timeStr}.xlsx`
        XLSX.writeFile(wb, filename)
      })

      setToast('所属名称6ごとにExcelをダウンロードしました')
    } catch (error) {
      console.error('Excel download failed:', error)
      setToast('Excelのダウンロードに失敗しました')
    }
  }, [exportRowsDisplay, overtimeRowsDisplay, buildLegendSheet, org6FromEstimated, adjustOvertimeRow])

  const handleDownloadOvertimeExcel = useCallback(() => {
    try {
      if (overtimeTableRowsForDisplay.length === 0) {
        setToast('残業時間データがありません')
        return
      }

      // 所属名称6ごとに分割して出力
      const groups: Record<string, string[][]> = {}
      overtimeTableRowsForDisplay.forEach((row) => {
        const org6 = (row?.[4] ?? '').toString().trim() || '未設定'
        if (!groups[org6]) groups[org6] = []
        groups[org6].push(row)
      })

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '')

      Object.entries(groups).forEach(([org6, rows]) => {
        const wb = XLSX.utils.book_new()
        const overtimeHeaders = ['従業員番号', '就業開始前残業時間', '就業終了後残業時間', '合計残業時間', '所属名称６']
        const overtimeSheet = XLSX.utils.aoa_to_sheet([overtimeHeaders, ...rows])
        overtimeSheet['!cols'] = overtimeHeaders.map(() => ({ wch: 20 }))
        XLSX.utils.book_append_sheet(wb, overtimeSheet, '残業時間詳細')

        const safeOrg6 = org6.replace(/[\\\\/:*?\"<>|]/g, '_') || '未設定'
        const filename = `残業時間詳細_${safeOrg6}_${dateStr}_${timeStr}.xlsx`
        XLSX.writeFile(wb, filename)
      })

      setToast('所属名称6ごとに残業時間詳細をダウンロードしました')
    } catch (error) {
      console.error('Excel download failed:', error)
      setToast('Excelのダウンロードに失敗しました')
    }
  }, [overtimeTableRowsForDisplay])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRowsDisplay])

  const applyOvertimeSearch = useCallback(
    (query: string, options: { persistLast?: boolean } = {}) => {
      const { persistLast = true } = options
      const normalizedQuery = normalizeSearchText(query)
      if (!normalizedQuery) {
        setOvertimeFilteredRows(null)
        if (persistLast) {
          setOvertimeLastSearch('')
        }
        return
      }
      if (persistLast) {
        setOvertimeLastSearch(query.trim())
      }
      const matches = overtimeRowsDisplay.filter((row) =>
        row.some((cell) => normalizeSearchText(asString(cell)).includes(normalizedQuery)),
      )
      setOvertimeFilteredRows(matches)
    },
    [normalizeSearchText, overtimeRowsDisplay],
  )

  const handleOvertimeSearchSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      applyOvertimeSearch(overtimeSearchInput)
    },
    [applyOvertimeSearch, overtimeSearchInput],
  )

  useEffect(() => {
    if (overtimeLastSearch.trim()) {
      applyOvertimeSearch(overtimeLastSearch, { persistLast: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtimeRowsDisplay])

  const handleClearOvertimeSearch = useCallback(() => {
    setOvertimeSearchInput('')
    setOvertimeFilteredRows(null)
    setOvertimeLastSearch('')
  }, [])

  // エクスポートページを開いたときにバックエンドから全データを取得
  const exportFetchedOnceRef = useRef(false)

  useEffect(() => {
    if (!showDownloadPanel) return
    // 既にロード済みなら再フェッチせずに表示を保持
    if (exportFetchedOnceRef.current && workerExportRows.length && overtimeRowsDisplay.length) {
      console.log('[Export] Using cached export data (skip fetch)')
      return
    }

    const fetchExportData = async () => {
      setLoadingExport(true)

      try {
        console.log('[Export] Fetching merged data from backend /export/all...')

        // カーソルを使って全データを取得
        let allEstimatedRows: string[][] = []
        let allOvertimeRows: string[][] = []
        let cursor: string | null = null
        let pageCount = 0

        do {
          const url = cursor
            ? `${API_BASE}/export/all?format=json&limit=5000&cursor=${encodeURIComponent(cursor)}`
            : `${API_BASE}/export/all?format=json&limit=5000`

          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })

          if (!response.ok) {
            // バックエンド未実装 / エラーの場合は空データで終了し、再試行ループを防ぐ
            console.warn(`[Export] Backend returned ${response.status}. Skip fetch and use empty data.`)
            exportFetchedOnceRef.current = true
            setWorkerExportRows([])
            setOvertimeRowsDisplay([])
            return
          }

          const data = await response.json()
          pageCount++

          if (data.estimated?.rows) {
            allEstimatedRows = allEstimatedRows.concat(data.estimated.rows)
          }
          if (data.overtime_detail?.rows) {
            allOvertimeRows = allOvertimeRows.concat(data.overtime_detail.rows)
          }

          cursor = data.has_more ? data.next_cursor : null

          console.log(`[Export] Page ${pageCount}: fetched ${data.estimated?.rows?.length || 0} estimated, ${data.overtime_detail?.rows?.length || 0} overtime rows. Total so far: ${allEstimatedRows.length} / ${allOvertimeRows.length}`)
        } while (cursor)

        console.log('[Export] All data fetched:', {
          total_estimated: allEstimatedRows.length,
          total_overtime: allOvertimeRows.length,
          pages: pageCount,
        })

        // バックエンドで既にマージ・集計済みのデータをセット
        const enrichedRows = enrichRows(allEstimatedRows)
        setWorkerExportRows(enrichedRows)
        setOvertimeRowsDisplay(allOvertimeRows)

        // localStorage に永続化
        try {
          localStorage.setItem('exportData_estimated', JSON.stringify(enrichedRows))
          localStorage.setItem('exportData_overtime', JSON.stringify(allOvertimeRows))
          localStorage.setItem('exportData_timestamp', new Date().toISOString())
          console.log('[Export] Data saved to localStorage')
        } catch (e) {
          console.warn('[Export] Failed to save to localStorage:', e)
        }

        exportFetchedOnceRef.current = true
        console.log('[Export] Data loaded successfully')
      } catch (error) {
        console.error('[Export] Failed to fetch export data:', error)
      } finally {
        setLoadingExport(false)
      }
    }

    fetchExportData()
  }, [showDownloadPanel])

  const exportRowsForDisplay = exportFilteredRows ?? exportRowsDisplay
  const hasExportData = exportRowsForDisplay.length > 0
  const exportHeadersDisplay = useMemo(() => EXPORT_HEADERS.map(stripParens), [])

  const applySearch = useCallback(
    (query: string) => {
      const normalizedQuery = normalizeSearchText(query)
      if (!normalizedQuery) {
        setFilteredRows(null)
        setLastSearch('')
        return
      }
      setLastSearch(query.trim())
      const currentRows = grid.slice(1)
      const matches = currentRows.filter((row) =>
        row.some((cell) => normalizeSearchText(asString(cell)).includes(normalizedQuery)),
      )
      setFilteredRows(matches)
    },
    [normalizeSearchText, grid],
  )

  const handleSearchSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      applySearch(searchInput)
    },
    [applySearch, searchInput],
  )

  const handleClearSearch = useCallback(() => {
    setSearchInput('')
    setFilteredRows(null)
    setLastSearch('')
  }, [])

  const resolveDatasetId = useCallback(
    async (key: string) => {
      if (datasetIds[key]) return datasetIds[key]
      const listRes = await fetch(`${API_BASE}/datasets?kind=${key}`, { credentials: 'include' })
      if (!listRes.ok) return null
      const listJson = await listRes.json()
      const id = (Array.isArray(listJson) ? listJson.find((d) => d?.status === 'ready') : null)?.id ?? null
      setDatasetIds((prev) => ({ ...prev, [key]: id }))
      return id
    },
    [datasetIds],
  )

  const handleClearPageData = useCallback(async () => {
    const ok = window.confirm('表示中のデータを削除しますか？')
    if (!ok) return

    // バックエンド上の最新データセットも削除
    try {
      const listRes = await fetch(`${API_BASE}/datasets?kind=${activeKey}`, { credentials: 'include' })
      if (listRes.ok) {
        const listJson = await listRes.json()
        const ids: string[] = Array.isArray(listJson) ? listJson.map((d: any) => d.id).filter(Boolean) : []
        for (const id of ids) {
          await fetch(`${API_BASE}/datasets/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)
        }
      }
      // 削除したデータセットIDをキャッシュから消す
      setDatasetIds((prev) => {
        const next = { ...prev }
        delete next[activeKey]
        return next
      })
    } catch (err) {
      console.warn('[Delete] Failed to delete dataset on backend:', err)
    }

    setSheetData((prev) => ({ ...prev, [activeKey]: null }))
    clearImportData(activeKey)
    setUploadedName(null)
    setUploadMessage(null)
    setUploadError(null)
    setUploadStart((prev) => ({ ...prev, [activeKey]: null }))
    setUploadElapsedSec((prev) => ({ ...prev, [activeKey]: 0 }))
    setUploadEstimateSec((prev) => ({ ...prev, [activeKey]: null }))
    setPageByKey((prev) => ({ ...prev, [activeKey]: 1 }))
    setPageSizeByKey((prev) => ({ ...prev, [activeKey]: DEFAULT_PAGE_SIZE }))
    setTotalByKey((prev) => ({ ...prev, [activeKey]: 0 }))
  }, [activeKey, resolveDatasetId])

  const fetchDatasetAll = useCallback(
    async (key: string, pageSize = 500) => {
      const datasetId = await resolveDatasetId(key)
      if (!datasetId) return null

      let allRows: string[][] = []
      let headers: string[] = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const res = await fetch(`${API_BASE}/datasets/${datasetId}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ filters: {}, page, pageSize }),
        })
        if (!res.ok) return null

        const json = await res.json()
        if (page === 1) {
          headers = (json?.columns as string[]) || []
        }

        const rows = (json?.rows as string[][]) || []
        allRows = allRows.concat(rows)

        // 取得した件数がpageSizeより少なければ最後のページ
        hasMore = rows.length >= pageSize
        page++
      }

      return { headers, rows: allRows }
    },
    [resolveDatasetId],
  )

  // ルックアップマップ構築用に全データを取得
  useEffect(() => {
    const fetchAllLookupData = async () => {
      try {
        const [personData, orgData] = await Promise.all([
          fetchDatasetAll('person_progress'),
          fetchDatasetAll('org_info'),
        ])
        if (personData) {
          setAllPersonProgressData(personData)
        }
        if (orgData) {
          setAllOrgInfoData(orgData)
        }
      } catch (err) {
        console.warn('[LookupData] Failed to fetch lookup data:', err)
      }
    }
    fetchAllLookupData()
  }, [fetchDatasetAll])

  const handleExportDataset = useCallback(async () => {
    const datasetId = await resolveDatasetId(activeKey)
    if (!datasetId) {
      setToast('エクスポート対象のデータセットがありません')
      return
    }
    setLoadingExport(true)
    try {
      const res = await fetch(`${API_BASE}/datasets/${datasetId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeKey}-export.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      setToast('エクスポートを開始しました')
    } catch (err: any) {
      setToast(err?.message || 'エクスポートに失敗しました')
    } finally {
      setLoadingExport(false)
    }
  }, [activeKey, resolveDatasetId])

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
  // ETA helpers
  const resetEtaTimer = useCallback(() => {
    if (etaTimerRef.current) {
      window.clearInterval(etaTimerRef.current)
      etaTimerRef.current = null
    }
  }, [])

  const startEtaTimer = useCallback(
    (total: number) => {
      resetEtaTimer()
      if (!total) {
        setExportEtaSec(null)
        setExportTotalRows(0)
        setExportProcessedRows(0)
        setExportStartAt(null)
        return
      }
      const started = performance.now()
      setExportStartAt(started)
      setExportTotalRows(total)
      setExportProcessedRows(0)
      const tick = () => {
        const eta = estimateEtaSeconds(
          { totalRows: total, startAt: started, processed: exportProcessedRows },
          exportSpeed,
        )
        setExportEtaSec(eta)
      }
      tick()
      etaTimerRef.current = window.setInterval(tick, 1000)
    },
    [exportProcessedRows, exportSpeed, resetEtaTimer],
  )

  const finishEta = useCallback(
    (processedTotal?: number) => {
      const total = processedTotal ?? exportTotalRows
      resetEtaTimer()
      setExportEtaSec(0)
      if (exportStartAt && total) {
        const elapsedSec = (performance.now() - exportStartAt) / 1000
        const measured = elapsedSec > 0 ? total / elapsedSec : exportSpeed
        const newSpeed = updateSpeedEma(exportSpeed, measured)
        setExportSpeed(newSpeed)
        saveSpeed(newSpeed)
      }
      window.setTimeout(() => setExportEtaSec(null), 1200)
      setExportStartAt(null)
      setExportTotalRows(0)
      setExportProcessedRows(0)
    },
    [exportSpeed, exportStartAt, exportTotalRows, resetEtaTimer],
  )

  // エクスポートパネルが開いたときに1回だけWorkerを起動
  const workerStartedRef = useRef(false)

  useEffect(() => {
    // パネルが閉じたらリセット（データは永続化済みなのでクリアしない）
    if (!showDownloadPanel) {
      workerStartedRef.current = false
      // データは永続化されているので、stateはクリアしない
      // setWorkerExportRows([]) を削除
      setExportEtaSec(null)
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      return
    }

    // バックエンド /export/all を使用するため、Worker処理は無効化
    console.log('[Worker] Disabled - using backend /export/all instead')

    // 以下、古いWorker処理（コメントアウト）
    /*
    if (workerStartedRef.current) {
      console.log('[Worker] Already started, skipping')
      return
    }

    if (typeof Worker === 'undefined') {
      console.log('[Worker] Worker not supported')
      setWorkerExportRows([])
      return
    }
    if (!totalRowsForExport || exportSourceGrids.length === 0) {
      console.log(`[Worker] Not ready: totalRows=${totalRowsForExport}, grids=${exportSourceGrids.length}`)
      setWorkerExportRows([])
      setExportEtaSec(null)
      return
    }

    console.log(`[Worker] Starting with ${exportSourceGrids.length} grids, ${totalRowsForExport} total rows`)
    workerStartedRef.current = true
    startEtaTimer(totalRowsForExport)
    const worker = new Worker(new URL('./workers/exportWorker.ts', import.meta.url))
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
      const data = e.data
      if (data.type === 'progress') {
        setExportProcessedRows(data.processed)
        const eta = estimateEtaSeconds(
          { totalRows: totalRowsForExport, startAt: exportStartAt || performance.now(), processed: data.processed },
          exportSpeed,
        )
        setExportEtaSec(eta)
        return
      }
      if ('exportRows' in data) {
        console.log(`[Worker] Completed: ${data.exportRows?.length || 0} rows`)
        setWorkerExportRows(data.exportRows || [])
        finishEta(totalRowsForExport)
        setLoadingExport(false)
      }
    }
    const payload: ExportWorkerRequest = { grids: exportSourceGrids }
    worker.postMessage(payload)
    */
  }, [showDownloadPanel])

  // 残業時間（開始前/終了後/合計）テーブル
  // NOTE: バックエンド /export/all から取得するため、この処理は無効化
  useEffect(() => {
    console.log('[Overtime] Disabled - using backend /export/all instead')
    return

    // 以下、古い処理（コメントアウト）
    /*
    let canceled = false
    const run = async () => {
      // 既にロード済みのデータだけで集計する（追加フェッチしない）
      const scheduleGrid = buildGridForKey('schedule_input')
      const punchesGrid = buildGridForKey('punches')

      const schedHeaders = scheduleGrid[0] || []
      const schedRows = scheduleGrid.slice(1)
      const punchHeaders = punchesGrid[0] || []
      const punchRows = punchesGrid.slice(1)

      if (schedRows.length === 0 || punchRows.length === 0) {
        if (!canceled) {
          setOvertimeRowsDisplay([])
          setOvertimeOverrideMap({})
        }
        return
      }
    const schedMapIdx: Record<string, number> = {}
    schedHeaders.forEach((h, idx) => {
      const norm = normalizeHeader(stripParens(h))
      schedMapIdx[norm] = idx
    })
    const punchMapIdx: Record<string, number> = {}
    punchHeaders.forEach((h, idx) => {
      const norm = normalizeHeader(stripParens(h))
      punchMapIdx[norm] = idx
    })
    const pick = (row: string[], map: Record<string, number>, names: string[]) => {
      for (const n of names) {
        const idx = map[normalizeHeader(n)]
        if (idx !== undefined) return row[idx]
      }
      return ''
    }
    type Planned = { start: number | null; end: number | null }
    const plannedByKey = new Map<string, Planned>()

    const parsePatternHours = (pattern: string) => {
      const m = /([0-9]+(?:\\.[0-9]+)?)h/i.exec(pattern || '')
      if (!m) return null
      return Number(m[1])
    }

    schedRows.forEach((row) => {
      const emp = String(pick(row as any, schedMapIdx, ['従業員番号'])).trim()
      const date = String(pick(row as any, schedMapIdx, ['勤務予定日'])).trim()
      if (!emp || !date) return
      const startVal = pick(row as any, schedMapIdx, ['就業開始時刻'])
      const endVal = pick(row as any, schedMapIdx, ['就業終了時刻'])
      const restVal = pick(row as any, schedMapIdx, ['休憩時間'])
      const patternVal = pick(row as any, schedMapIdx, ['就業時間パターン名'])
      const start = hhmmToMinutes(startVal)
      let end = hhmmToMinutes(endVal)
      if (end == null && start != null) {
        const restMin = Number(restVal) || 0
        const hours = parsePatternHours(String(patternVal))
        if (hours != null) {
          end = start + restMin + Math.round(hours * 60)
        }
      }
      plannedByKey.set(`${emp}__${date}`, { start, end })
    })

    const sums = new Map<string, { startOt: number; endOt: number }>()
    const applyThreshold = (minutes: number) => {
      if (minutes <= 15) return 0
      return minutes
    }
    punchRows.forEach((row) => {
      const emp = String(pick(row as any, punchMapIdx, ['従業員番号'])).trim()
      const date = String(pick(row as any, punchMapIdx, ['勤務日付', '勤務日'])).trim()
      if (!emp || !date) return
      const plan = plannedByKey.get(`${emp}__${date}`)
      if (!plan || plan.start == null || plan.end == null) return
      const actualStart = hhmmToMinutes(pick(row as any, punchMapIdx, ['出社時刻']))
      const actualEnd = hhmmToMinutes(pick(row as any, punchMapIdx, ['退社時刻']))
      if (actualStart == null && actualEnd == null) return
      let startOt = 0
      let endOt = 0
      if (actualStart != null && actualStart < plan.start) {
        startOt = applyThreshold(plan.start - actualStart)
      }
      if (actualEnd != null && actualEnd > plan.end) {
        endOt = applyThreshold(actualEnd - plan.end)
      }
      // 勤務時間が10時間超なら追加休憩30分を残業から差し引く
      let totalOt = startOt + endOt
      if (actualStart != null && actualEnd != null) {
        const workDuration = actualEnd - actualStart
        if (workDuration > 10 * 60) {
          totalOt = Math.max(0, totalOt - 30)
        }
      }
      // start/endの比率で戻すより単純に終了後から優先的に差し引く
      if (totalOt < startOt + endOt) {
        const deficit = startOt + endOt - totalOt
        let endReduce = Math.min(endOt, deficit)
        endOt -= endReduce
        let startReduce = deficit - endReduce
        if (startReduce > 0) startOt = Math.max(0, startOt - startReduce)
      }
      const entry = sums.get(emp) || { startOt: 0, endOt: 0 }
      entry.startOt += startOt
      entry.endOt += endOt
      sums.set(emp, entry)
    })

    const rows: string[][] = []
    const overrideMap: Record<string, { actual?: number; overtime?: number }> = {}
    Array.from(sums.keys())
      .sort()
      .forEach((emp) => {
        const v = sums.get(emp)!
        const total = v.startOt + v.endOt
        rows.push([emp, minutesToHHMM(v.startOt), minutesToHHMM(v.endOt), minutesToHHMM(total)])
        overrideMap[emp] = { actual: total, overtime: total }
      })
      if (!canceled) {
        setOvertimeRowsDisplay(rows)
        setOvertimeOverrideMap(overrideMap)
      }
    }
    run()
    return () => {
      canceled = true
    }
    */
  }, [])

  // Cache fetch/POSTを停止（CORS回避）
  useEffect(() => {
    setCacheLoaded(true)
  }, [])

  return (
    <AuthGuard>
      <div className="dash-shell">
        <header className="dash-header-bar">
          <div className="header-title">時間外労働管理システム</div>
        </header>
        <HeaderBar />
        <div className="dash-layout">
        <Sidebar
          defs={defs}
          fileOrder={FILE_ORDER}
          activeSheet={activeSheet}
          onChangeSheet={(idx) => {
            setActiveSheet(idx)
            setShowDownloadPanel(false)
            setShowOvertimePanel(false)
          }}
          onCloseDownloadPanel={() => {
            setShowDownloadPanel(false)
            setShowOvertimePanel(false)
          }}
          showDownloadPanel={showDownloadPanel}
          onShowDownload={() => {
            setShowDownloadPanel(true)
            setShowOvertimePanel(false)
          }}
          showOvertimePanel={showOvertimePanel}
          onShowOvertime={() => {
            setShowOvertimePanel(true)
            setShowDownloadPanel(false)
          }}
        />

        <div className="dash-main">
          <div className="dash-content">
            {showDownloadPanel ? (
              <DownloadPanel
                heading={REPORT_HEADING}
                subtitle={downloadSubtitle}
                toast={toast}
                onClear={handleClearExportTable}
                onDownload={handleDownloadExportExcel}
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
                etaSeconds={exportEtaSec}
              />
            ) : showOvertimePanel ? (
              <div>
                <DownloadPanel
                  heading=""
                  subtitle="開始前/終了後/合計"
                  toast={toast}
                  onClear={() => {
                    setOvertimeRowsDisplay([])
                    try {
                      localStorage.removeItem('exportData_overtime')
                      console.log('[Export] Overtime data cleared from localStorage')
                    } catch (e) {
                      console.warn('[Export] Failed to clear localStorage:', e)
                    }
                  }}
                  onDownload={handleDownloadOvertimeExcel}
                  etaSeconds={null}
                  rightContent={
                    <form className="search-bar" onSubmit={handleOvertimeSearchSubmit} style={{ margin: 0, minWidth: '260px' }}>
                      <Search size={16} className="search-icon" />
                      <input
                        type="search"
                        className="search-input"
                        placeholder="検索"
                        value={overtimeSearchInput}
                        onChange={(e) => setOvertimeSearchInput(e.target.value)}
                      />
                      <button className="search-button" type="submit">
                        検索
                      </button>
                      {overtimeLastSearch && (
                        <button type="button" className="search-chip" onClick={handleClearOvertimeSearch}>
                          <span>検索中: {overtimeLastSearch}</span>
                          <X size={14} />
                        </button>
                      )}
                    </form>
                  }
                />
                <div style={{ marginTop: '12px' }}>
                  <SheetTable
                    headers={overtimeHeadersDisplay}
                    rows={overtimeTableRowsForDisplay}
                    title=""
                    loading={loading}
                    error={error}
                    emptyMessage={overtimeFilteredRows ? '該当するデータがありません' : '残業データがありません'}
                    showOnlyFirstColumn={false}
                    hideBodyWhenEmpty={overtimeTableRowsForDisplay.length === 0}
                    sortable={true}
                    defaultPageSize={100}
                    pageSizeOptions={[25, 50, 100, 500, 1000]}
                  />
                </div>
              </div>
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
                  onFileSelected={handleFileAsync}
                />
                <SheetTable
                  topContent={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        width: '100%',
                      }}
                    >
                      <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', height: '44px' }}>
                        <button
                          type="button"
                          className="btn-outline-red"
                          onClick={handleClearPageData}
                          style={{ cursor: 'pointer', height: '44px', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Trash2 size={18} />
                          <span>削除</span>
                        </button>
                      </div>
                      <form
                        onSubmit={handleSearchSubmit}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: 0,
                          margin: 0,
                          flex: 1,
                          minWidth: '320px',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: 1,
                            maxWidth: '520px',
                          }}
                        >
                          <Search size={16} color="#9ca3af" />
                          <input
                            type="search"
                            className="search-input"
                            placeholder=""
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              boxShadow: 'none',
                              padding: '6px 4px',
                              width: '100%',
                              borderBottom: '1px solid #e5e7eb',
                              height: '44px',
                            }}
                          />
                        </div>
                        <button
                          className="search-button"
                          type="submit"
                          disabled={loading}
                          style={{
                            minWidth: '110px',
                            borderRadius: '12px',
                            height: '44px',
                            boxShadow: '0 4px 10px rgba(25,118,210,0.18)',
                          }}
                        >
                          検索
                        </button>
                        {lastSearch && (
                          <button type="button" className="search-chip" onClick={handleClearSearch}>
                            <span>検索中: {lastSearch}</span>
                            <X size={14} />
                          </button>
                        )}
                      </form>
                    </div>
                  }
                  headers={displayHeaders}
                  rows={rowsMeaningful}
                  title={TABLE_TITLE}
                  loading={loading}
                  error={error}
                  emptyMessage={filteredRows ? '該当するデータがありません' : 'データがありません'}
                  showOnlyFirstColumn={false}
                  hideBodyWhenEmpty={rowsMeaningful.length === 0}
                  page={currentPage}
                  pageSize={currentPageSize}
                  totalOverride={totalRowsForPagination}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  sortable={true}
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
                  sortable={true}
                                  />
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
