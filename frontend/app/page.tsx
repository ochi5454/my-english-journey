'use client'

import { useEffect, useMemo, useState } from 'react'

type FileDef = { display_name: string; expected_headers: string[] }
type SheetPayload = {
  file_key: string
  file_name: string
  version: number
  sheets: { name: string; headers: string[]; rows: string[][]; grid?: string[][] }[]
  expected_headers: string[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000'

const FILE_ORDER = ['schedule_input', 'punches', 'days_items', 'tim_daily', 'person_progress'] as const

const FALLBACK_DEFS: Record<string, FileDef> = {
  schedule_input: {
    display_name: '勤務予定入力 (11_TIM_勤務予定入力.xlsx)',
    expected_headers: [
      '従業員番号',
      '勤務予定日',
      '出勤休日区分',
      '出勤休日区分名',
      '就業時間パターンコード',
      '就業時間パターン名',
      '就業開始時刻',
      '就業終了時刻',
      '休憩時間',
    ],
  },
  punches: {
    display_name: '出退社時刻 (12_TIM_出退社時刻.xlsx)',
    expected_headers: ['従業員番号', '勤務日付', '出社時刻', '退社時刻'],
  },
  days_items: {
    display_name: '日数項目 (13_日数項目.csv)',
    expected_headers: ['従業員番号', '勤務日', '出社時刻', '退社時刻', '日数項目', '日数項目名'],
  },
  tim_daily: {
    display_name: '日次実績 (14_TIM.xlsx)',
    expected_headers: [
      '従業員番号',
      '勤務日付',
      '(時間)定時開始時刻',
      '(時間)定時終了時刻',
      '(時間)呼出出勤',
      '(時間)呼出退勤',
      '(時間)呼出勤務',
      '(時間)実所定外時間',
      '(時間)出社日数',
      '(時間)在宅勤務時間',
      '(時間)在宅勤務日数',
      '(時間)終日在宅フラグ',
      '(時間)実労働時間',
      '(時間)休憩Ｈ',
      '(時間)休憩勤務開始',
      '(時間)休憩勤務終了',
      '(時間)休憩1開始時刻',
      '(時間)休憩1終了時刻',
      '(時間)休憩2開始時刻',
      '(時間)休憩2終了時刻',
      '(時間)休憩3開始時刻',
      '(時間)休憩3終了時刻',
      '(時間)休憩4開始時刻',
      '(時間)休憩4終了時刻',
    ],
  },
  person_progress: {
    display_name: '勤務予定進捗一覧 (15_勤務予定進捗一覧.csv)',
    expected_headers: ['社員番号', '氏名', 'カナ氏名', '勤怠年月', '勤務開始日', '進捗状況', '打刻実績', '勤務実績登録', '所属名称', 'メールアドレス'],
  },
}

const LEGEND = [
  { label: '80h超', desc: '長時間労働', bg: '#6b4f00', color: '#f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', bg: '#d0a754', color: '#1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', bg: '#e6a600', color: '#1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', bg: '#c7b202', color: '#0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', bg: '#1f8a55', color: '#fdfdfd' },
  { label: '15h〜20h', desc: '', bg: '#5f86c6', color: '#fdfdfd' },
]

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
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload')
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const activeKey = FILE_ORDER[activeSheet]
  const activeDef = defs[activeKey] ?? { display_name: activeKey, expected_headers: [] }

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

  const loadSheet = async (key: string) => {
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
    } catch (e) {
      setError('データ取得に失敗しました。バックエンドが起動しているか確認してください。')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSheet(activeKey)
  }, [activeKey])

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

  const downloadProcessed = async (key: string) => {
    setDownloadingKey(key)
    setDownloadError(null)
    try {
      let data = sheetData[key]
      if (!data) {
        data = await loadSheet(key)
      }
      const sheet = data?.sheets?.[0]
      if (!sheet) {
        throw new Error('データがありません。先にアップロードしてください。')
      }
      const gridData = sheet.grid?.length
        ? sheet.grid
        : sheet.headers?.length
          ? [sheet.headers, ...(sheet.rows || [])]
          : []
      if (!gridData.length) {
        throw new Error('ダウンロード可能なデータが見つかりません。')
      }
      const csv = gridData
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${key}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setDownloadError(err?.message ?? 'ダウンロードに失敗しました')
    } finally {
      setDownloadingKey(null)
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
    <div className="jfa-app">
      <nav className="jfa-nav">
        <div className="jfa-nav-top">
          <div className="jfa-brand">
            <span>AEON delight</span>
          </div>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button
            onClick={() => setActiveTab('upload')}
            className="jfa-button"
            style={{
              background: activeTab === 'upload' ? '#0b2545' : '#fff',
              color: activeTab === 'upload' ? '#fff' : '#0b2545',
              fontWeight: 800,
              border: '1px solid #0b2545',
            }}
          >
            ファイルアップロード
          </button>
          <button
            onClick={() => setActiveTab('download')}
            className="jfa-button"
            style={{
              background: activeTab === 'download' ? '#0b2545' : '#fff',
              color: activeTab === 'download' ? '#fff' : '#0b2545',
              fontWeight: 800,
              border: '1px solid #0b2545',
            }}
          >
            加工済みデータのダウンロード
          </button>
        </div>
      </nav>

      <main className="jfa-shell">
        {activeTab === 'upload' && (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {FILE_ORDER.map((key, idx) => (
                <button
                  key={key}
                  onClick={() => setActiveSheet(idx)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: idx === activeSheet ? '2px solid #0b2545' : '1px solid #e2e8f0',
                    background: idx === activeSheet ? '#fff' : '#f8fafc',
                    fontWeight: idx === activeSheet ? 800 : 600,
                    cursor: 'pointer',
                    boxShadow: idx === activeSheet ? '0 6px 12px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {defs[key]?.display_name || key}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-2xl font-bold text-[var(--jfa-navy)]">実所定外時間 推計データ</div>
              <div className="text-sm text-slate-600">
                2025年12月度 （2025年12月15日現在） | {defs[activeKey]?.display_name || activeKey}
              </div>
            </div>

            <div className="sheet-legend">
              {LEGEND.map((item) => (
                <div key={item.label} className="sheet-legend-row">
                  <span className="sheet-legend-chip" style={{ background: item.bg, color: item.color }}>
                    {item.label}
                  </span>
                  <span className="sheet-legend-text">{item.desc}</span>
                </div>
              ))}
            </div>

            <section className="sheet-card" style={{ marginTop: '8px' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  id="excel-upload"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <label
                  htmlFor="excel-upload"
                  className="jfa-button"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  エクセルをアップロード
                </label>
                {uploadedName && <span className="text-sm text-slate-600">選択中: {uploadedName}</span>}
              </div>
              <div className="text-xs text-slate-500 mt-2">※アップロードされたファイルは今後の取り込み処理に利用できます。</div>
              {uploadMessage && <div className="text-sm text-green-700 mt-1">{uploadMessage}</div>}
              {uploadError && <div className="text-sm text-red-600 mt-1">エラー: {uploadError}</div>}
              {uploading && <div className="text-sm text-slate-600 mt-1">アップロード中…</div>}
            </section>

            <section className="sheet-card">
              {loading && <div className="text-sm text-slate-600 mb-2">読み込み中…</div>}
              {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
              <div className="sheet-table-wrapper">
                <div className="sheet-table">
                  <div className="sheet-row sheet-header-band">
                    <div className="sheet-cell sheet-title" style={{ width: Math.max(headers.length * 110, 320) }}>
                      2025年12月度 実所定外時間 推計データ（2025年12月15日現在）
                    </div>
                  </div>
                  <div className="sheet-row sheet-header">
                    {headers.map((title, idx) => (
                      <div
                        key={title}
                        className="sheet-cell"
                        style={{
                          width: title.length > 10 ? 140 : 110,
                          background: '#fdfbf6',
                          fontWeight: 700,
                        }}
                      >
                        {title}
                      </div>
                    ))}
                  </div>
                  {bodyRows.map((row, rIdx) => (
                    <div className="sheet-row" key={`row-${activeSheet}-${rIdx}`}>
                      {headers.map((_, cIdx) => (
                        <div
                          key={`cell-${rIdx}-${cIdx}`}
                          className="sheet-cell sheet-body"
                          style={{
                            width: headers[cIdx]?.length > 10 ? 140 : 110,
                            background: rIdx === 0 ? '#fffef6' : '#fff',
                          }}
                        >
                          <div style={{ fontSize: '12px' }}>{row?.[cIdx] ?? ''}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'download' && (
          <section className="sheet-card" style={{ marginTop: '16px' }}>
            <div className="text-xl font-bold text-[var(--jfa-navy)] mb-2">加工済みデータのダウンロード</div>
            <div className="text-sm text-slate-600 mb-4">
              取得済みのシートをCSVでダウンロードできます。未取得のタブは自動で取得してから保存します。
            </div>
            <div className="flex flex-wrap gap-2">
              {FILE_ORDER.map((key) => (
                <button
                  key={`dl-${key}`}
                  onClick={() => downloadProcessed(key)}
                  className="jfa-button"
                  style={{
                    cursor: 'pointer',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#0b2545',
                    fontWeight: 700,
                    opacity: downloadingKey && downloadingKey !== key ? 0.6 : 1,
                  }}
                  disabled={!!downloadingKey && downloadingKey !== key}
                >
                  {defs[key]?.display_name || key}
                  {downloadingKey === key ? ' を準備中…' : ' をダウンロード'}
                </button>
              ))}
            </div>
            {downloadError && <div className="text-sm text-red-600 mt-3">エラー: {downloadError}</div>}
          </section>
        )}
      </main>
    </div>
  )
}
