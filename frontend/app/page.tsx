'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { DownloadPanel } from './components/DownloadPanel'
import { SheetSummary } from './components/SheetSummary'
import { SheetTable } from './components/SheetTable'
import { Sidebar } from './components/Sidebar'
import { UploadSection } from './components/UploadSection'
import { API_BASE, FALLBACK_DEFS, FILE_ORDER, LEGEND, REPORT_HEADING, REPORT_PERIOD, TABLE_TITLE } from './constants/excel'
import { FileDef, SheetPayload } from './types/excel'

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

  const activeKey = FILE_ORDER[activeSheet]
  const activeDef = defs[activeKey] ?? { display_name: activeKey, expected_headers: [] }
  const subtitle = `${REPORT_PERIOD} | ${activeDef.display_name}`

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
        setSheetData((prev) => ({ ...prev, [key]: null }))
        return null
      }
      if (!res.ok) {
        throw new Error('fetch failed')
      }
      const json = (await res.json()) as SheetPayload
      setSheetData((prev) => ({ ...prev, [key]: json }))
      return json
    } catch {
      setError('データ取得に失敗しました。バックエンドが起動しているか確認してください。')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

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
      setUploadMessage('アップロード完了。最新データを表示します。')
      await loadSheet(activeKey)
    } catch (e: any) {
      setUploadError(e?.message ?? 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const handleGenerateDownload = async () => {
    setToast(null)
    setGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/processed/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ym: '' }),
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
    if (sheet?.grid?.length) return sheet.grid
    if (sheet?.headers?.length) return [sheet.headers, ...(sheet.rows || [])]
    const headers = activeDef.expected_headers ?? []
    return [headers, headers.length ? [Array(headers.length).fill('')] : []]
  }, [sheet, activeDef])

  const headers = grid[0] || []
  const bodyRows = grid.slice(1)

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
            <DownloadPanel heading={REPORT_HEADING} subtitle={subtitle} legend={LEGEND} generating={generating} toast={toast} onGenerate={handleGenerateDownload} />
          ) : (
            <>
              <SheetSummary heading={REPORT_HEADING} subtitle={subtitle} legend={LEGEND} />
              <UploadSection
                uploadedName={uploadedName}
                uploadMessage={uploadMessage}
                uploadError={uploadError}
                uploading={uploading}
                onFileSelected={handleFile}
              />
              <SheetTable headers={headers} rows={bodyRows} title={TABLE_TITLE} loading={loading} error={error} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
