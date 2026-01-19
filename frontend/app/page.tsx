'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { DownloadPanel } from './components/DownloadPanel'
import { SheetTable } from './components/SheetTable'
import { Sidebar } from './components/Sidebar'
import { UploadSection } from './components/UploadSection'
import { API_BASE, FALLBACK_DEFS, FILE_ORDER, LEGEND, REPORT_HEADING, TABLE_TITLE } from './constants/excel'
import { FileDef, SheetPayload } from './types/excel'

const STORAGE_KEY = 'overtime_import_cache_v1'

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
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [savedPreviews, setSavedPreviews] = useState<
    Record<string, { headers: string[]; rows: string[][]; fileName?: string | null; importedAt?: string }>
  >(() => readInitialSavedPreviews())

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

  useEffect(() => {
    loadSheet(activeKey)
  }, [activeKey, loadSheet])

  const handleFile = async (file?: File) => {
    if (!file) return
    setUploadedName(file.name)
    setUploadMessage(null)
    setUploadError(null)
    setUploading(true)
    try {
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
      setUploadError(e?.message ?? 'アップロードに失敗しました')
    } finally {
      setUploading(false)
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
  }

  const handleGenerateDownload = async () => {
    setToast(null)
    setGenerating(true)
    try {
      const targetKey = showDownloadPanel ? processedFileKey : activeKey
      const res = await fetch(`${API_BASE}/processed/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ym: '', file_key: targetKey }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail?.message || body?.detail || '生成に失敗しました')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?(.*)"?/)
      const filename = match?.[1] || 'processed.xlsx'
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setToast('Excelを生成しました')
    } catch (err: any) {
      setToast(err?.message || '生成に失敗しました')
    } finally {
      setGenerating(false)
    }
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

  const processedSheet = sheetData[processedFileKey]?.sheets?.[0]
  const exportHeaders = [
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
  ]

  const normalizeHeader = (h: string) =>
    (h || '')
      .replace(/[\s　]/g, '')
      .replace(/[()（）\[\]【】]/g, '')
      .replace(/^時間/, '')
      .replace(/\//g, '')
      .toLowerCase()

  const columnMapAliases: Record<string, string[]> = {
    emp_no: ['従業員番号', '社員番号', '社員No'],
    name: ['氏名', '名前', 'カナ氏名'],
    status: ['勤務予定', '勤務予定日', '勤務予定区分', '勤務状況', '進捗状況'],
    overtime: ['実所定外時間', '残業時間', '残業'],
    overtime_detail: ['残業時間', '実所定外時間'],
    call_time: ['呼出出勤時間', '呼出出勤'],
    grade: ['グレード'],
    role: ['職制', '役職'],
    org2: ['所属名称2', '所属2'],
    org3: ['所属名称3', '所属3'],
    org4: ['所属名称4', '所属4'],
    org5: ['所属名称5', '所属5'],
    org6: ['所属名称6', '所属6'],
    org7: ['所属名称7', '所属7'],
    org8: ['所属名称8', '所属8'],
  }

  const buildColumnMap = (headers: string[]) => {
    const normalized: Record<string, number> = {}
    headers.forEach((h, idx) => {
      normalized[normalizeHeader(h)] = idx
    })
    const resolved: Record<string, number> = {}
    Object.entries(columnMapAliases).forEach(([key, aliases]) => {
      for (const name of aliases) {
        const idx = normalized[normalizeHeader(name)]
        if (idx !== undefined) {
          resolved[key] = idx
          break
        }
      }
    })
    return resolved
  }

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
    const colMap = buildColumnMap(headers)
    const pick = (row: string[], key: string, fallback = '') => {
      const idx = colMap[key]
      if (idx === undefined) return fallback
      return row[idx] ?? fallback
    }
    if (!rows.length) return [[...Array(exportHeaders.length)].map(() => '')]
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
  }, [processedGrid])

  useEffect(() => {
    if (showDownloadPanel && !savedPreviews[processedFileKey] && !processedSheet) {
      loadSheet(processedFileKey)
    }
  }, [showDownloadPanel, processedFileKey, loadSheet, savedPreviews, processedSheet])

  return (
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
              legend={LEGEND}
              generating={generating}
              toast={toast}
              onGenerate={handleGenerateDownload}
            />
          ) : (
            <>
              <UploadSection
                uploadedName={uploadedName}
                uploadMessage={uploadMessage}
                uploadError={uploadError}
                uploading={uploading}
                onClear={handleClearPageData}
                onFileSelected={handleFile}
              />
              <SheetTable headers={headers} rows={bodyRows} title={TABLE_TITLE} loading={loading} error={error} />
            </>
          )}
          {showDownloadPanel && (
            <div style={{ marginTop: '12px' }}>
              <SheetTable headers={exportHeaders} rows={processedRows} title={TABLE_TITLE} loading={loading} error={error} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
