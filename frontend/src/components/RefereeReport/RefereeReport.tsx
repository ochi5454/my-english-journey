import React, { useRef, useState } from 'react'
import { useEffect } from 'react'

// Web Speech API 型を簡易定義（ビルドエラー回避用）
type SpeechRecognition = any

type ReportState = {
  competition: string
  division: string
  round: string
  matchDate: string
  kickoff: string
  venue: string
  weather: string
  temperature: string
  pitch: string
  homeTeam: string
  awayTeam: string
  homeScore: string
  awayScore: string
  referee: string
  ar1: string
  ar2: string
  fourth: string
  reserve: string
  homeColor: string
  awayColor: string
  cautions: string
  sendOffs: string
  incidents: string
  notes: string
}

type ReportHistory = {
  title: string
  competition?: string
  submittedAt: string
  form?: ReportState
  html?: string
}

const initialState: ReportState = {
  competition: '',
  division: '',
  round: '',
  matchDate: '',
  kickoff: '',
  venue: '',
  weather: '',
  temperature: '',
  pitch: '',
  homeTeam: '',
  awayTeam: '',
  homeScore: '',
  awayScore: '',
  referee: '',
  ar1: '',
  ar2: '',
  fourth: '',
  reserve: '',
  homeColor: '',
  awayColor: '',
  cautions: '',
  sendOffs: '',
  incidents: '',
  notes: '',
}

const card: React.CSSProperties = {
  border: '1px solid #d8c69c',
  borderRadius: '12px',
  background: '#fdfbf6',
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
  padding: '12px',
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }
const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }
const sectionTitleStyle: React.CSSProperties = { marginBottom: '10px', fontSize: '15px', fontWeight: 600 }
const dividerStyle: React.CSSProperties = { borderTop: '1px dashed #e2e8f0', margin: '2px 0 4px' }

const RefereeReport: React.FC = () => {
  // 録音チャンク設定（1分ごと+末尾10秒オーバーラップ）
  const CHUNK_MS = 60 * 1000
  const OVERLAP_MS = 10 * 1000
  const SLICE_MS = 10 * 1000
  const OVERLAP_PIECES = Math.ceil(OVERLAP_MS / SLICE_MS)
  const AUTO_STOP_MS = 60 * 1000

  const [form, setForm] = useState<ReportState>(initialState)
  const [rawText, setRawText] = useState<string>('') // 解析用（normalize後）
  const [rawSpeechText, setRawSpeechText] = useState<string>('') // 生文字起こし（表示・保存用、加工しない）
  const [normalizedSpeechText, setNormalizedSpeechText] = useState<string>('') // sanitize後の解析用
  const [parseMessage, setParseMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [recordingHint, setRecordingHint] = useState<string>('録音ボタンを押すと1分ごとに自動停止し文字起こしします。')
  const [speechNotice, setSpeechNotice] = useState<string>('')
  const [isApplyingDelay, setIsApplyingDelay] = useState<boolean>(false)
  const [history, setHistory] = useState<ReportHistory[]>([])
  const [showHistoryList, setShowHistoryList] = useState<boolean>(false)
  const printRef = useRef<HTMLDivElement | null>(null)
  const scale = 0.9
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const chunkQueueRef = useRef<Blob[]>([]) // バックエンド送信用チャンクキュー
  const isSendingChunkRef = useRef<boolean>(false)
  const chunkPiecesRef = useRef<Blob[]>([]) // 5分チャンクを組み立てる10秒ピース
  const overlapPiecesRef = useRef<Blob[]>([]) // 次チャンクに付与する末尾10秒ピース
  const chunkElapsedMsRef = useRef<number>(0)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const speechBufferRef = useRef<string>('') // interim含む最新の文字列
  const speechFinalRef = useRef<string>('') // 確定した文字起こし（連結）
  const speechInterimRef = useRef<string>('') // 直近のinterim
  const silenceTimerRef = useRef<number | null>(null)
  const speechRestartTimerRef = useRef<number | null>(null)
  const speechForceRestartTimerRef = useRef<number | null>(null)
  const applyDelayTimerRef = useRef<number | null>(null)
  const autoStopTimerRef = useRef<number | null>(null)
  const shouldKeepAudioRef = useRef<boolean>(true)
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000'

  const applyBackendResult = (resp: {
    tournament_name?: string | null
    match_category?: string | null
    round?: string | null
    match_date?: string | null
    kickoff_time?: string | null
    venue?: string | null
    weather?: string | null
    temperature?: string | null
    pitch_condition?: string | null
  }) => {
    const updates: Partial<ReportState> = {
      competition: resp.tournament_name || '',
      division: resp.match_category || '',
      round: resp.round || '',
      matchDate: resp.match_date || '',
      kickoff: resp.kickoff_time || '',
      venue: resp.venue || '',
      weather: resp.weather || '',
      temperature: resp.temperature || '',
      pitch: resp.pitch_condition || '',
    }
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const handleClear = () => {
    setForm(initialState)
    setMessage(null)
    setParseMessage(null)
  }

  const normalizeScoreString = (val: string) => {
    const digits = val.replace(/\D+/g, '')
    return digits
  }

  const handleChange = (key: keyof ReportState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let value = e.target.value
    if (key === 'homeScore' || key === 'awayScore') {
      value = normalizeScoreString(value)
    }
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('refReportHistory')
      if (saved) {
        setHistory(JSON.parse(saved))
      }
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }, [])

  const persistHistory = (next: ReportHistory[]) => {
    setHistory(next)
    try {
      localStorage.setItem('refReportHistory', JSON.stringify(next))
    } catch (err) {
      console.error('Failed to save history', err)
    }
  }

  const openHistoryPdf = (entry: ReportHistory) => {
    if (!entry.form) {
      alert('この履歴には詳細が保存されていません。')
      return
    }
    const html = entry.html || buildReportHtml(entry.form, entry.title, entry.submittedAt)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      alert('ポップアップがブロックされました。許可してください。')
    }
  }

  const deleteHistory = (idx: number) => {
    const next = history.filter((_, i) => i !== idx)
    persistHistory(next)
  }

  const clearAudioOnly = () => {
    stopRecorder()
    stopStream()
    recordedChunksRef.current = []
    setAudioUrl(null)
    setRecordError(null)
    setIsRecording(false)
    setRecordingHint('録音ボタンを押して会議を記録してください。')
      setSpeechNotice('')
  }

  const buildReportHtml = (f: ReportState, title: string, submittedAt: string) => {
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>審判報告書 ${title}</title>
          <style>
            body { font-family: -apple-system, "Noto Sans JP", sans-serif; padding: 16px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            h2 { font-size: 16px; margin: 16px 0 8px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
            .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
            .label { font-weight: 700; font-size: 13px; }
            .value { font-size: 13px; }
            pre { white-space: pre-wrap; font-family: inherit; }
          </style>
        </head>
        <body>
          <h1>審判報告書 ${title}</h1>
          <div style="font-size:11px;color:#64748b;">提出日時: ${new Date(submittedAt).toLocaleString()}</div>
          <div class="card">
            <h2>試合情報</h2>
            <div class="grid">
              <div><div class="label">大会名</div><div class="value">${f.competition || ''}</div></div>
              <div><div class="label">試合区分</div><div class="value">${f.division || ''}</div></div>
              <div><div class="label">節 / ラウンド</div><div class="value">${f.round || ''}</div></div>
              <div><div class="label">試合日</div><div class="value">${f.matchDate || ''}</div></div>
              <div><div class="label">キックオフ</div><div class="value">${f.kickoff || ''}</div></div>
              <div><div class="label">会場</div><div class="value">${f.venue || ''}</div></div>
              <div><div class="label">天候</div><div class="value">${f.weather || ''}</div></div>
              <div><div class="label">気温(℃)</div><div class="value">${f.temperature || ''}</div></div>
              <div><div class="label">ピッチ状態</div><div class="value">${f.pitch || ''}</div></div>
            </div>
          </div>
          <div class="card">
            <h2>試合結果</h2>
            <div class="grid">
              <div><div class="label">ホーム</div><div class="value">${f.homeTeam || ''}</div></div>
              <div><div class="label">アウェイ</div><div class="value">${f.awayTeam || ''}</div></div>
              <div><div class="label">ホーム色</div><div class="value">${f.homeColor || ''}</div></div>
              <div><div class="label">アウェイ色</div><div class="value">${f.awayColor || ''}</div></div>
              <div><div class="label">ホーム得点</div><div class="value">${f.homeScore || ''}</div></div>
              <div><div class="label">アウェイ得点</div><div class="value">${f.awayScore || ''}</div></div>
            </div>
          </div>
          <div class="card">
            <h2>審判団</h2>
            <div class="grid">
              <div><div class="label">主審</div><div class="value">${f.referee || ''}</div></div>
              <div><div class="label">副審1</div><div class="value">${f.ar1 || ''}</div></div>
              <div><div class="label">副審2</div><div class="value">${f.ar2 || ''}</div></div>
              <div><div class="label">第4審</div><div class="value">${f.fourth || ''}</div></div>
              <div><div class="label">予備審判員</div><div class="value">${f.reserve || ''}</div></div>
            </div>
          </div>
          <div class="card">
            <h2>警告 / 退場</h2>
            <div class="label">警告</div>
            <div class="value"><pre>${f.cautions || ''}</pre></div>
            <div class="label" style="margin-top:8px;">退場</div>
            <div class="value"><pre>${f.sendOffs || ''}</pre></div>
          </div>
          <div class="card">
            <h2>特記事項 / インシデント</h2>
            <div class="value"><pre>${f.incidents || ''}</pre></div>
          </div>
          <div class="card">
            <h2>備考</h2>
            <div class="value"><pre>${f.notes || ''}</pre></div>
          </div>
          <script>
            window.onload = () => window.print && window.print();
          </script>
        </body>
      </html>
    `
  }

  const handleSubmit = () => {
    const title = form.matchDate || new Date().toISOString().slice(0, 10)
    const submittedAt = new Date().toISOString()
    const snapshotHtml = buildReportHtml(form, title, submittedAt)
    const entry: ReportHistory = {
      title,
      competition: form.competition,
      submittedAt,
      form: { ...form },
      html: snapshotHtml,
    }
    const next = [entry, ...history].slice(0, 50)
    persistHistory(next)
    setMessage('提出しました。印刷/PDFで保存できます。')
    // ブロックのみ印刷（@media printで制御）
    setTimeout(() => window.print(), 200)
  }

  const normalizeDateFromText = (value: string) => {
    const trimmed = value.replace(/[です。．]/g, '').trim()
    const ymd = trimmed.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/)
    if (ymd) {
      const [, y, m, d] = ymd
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    const md = trimmed.match(/(\d{1,2})月(\d{1,2})日?/)
    if (md) {
      const [, m, d] = md
      const year = new Date().getFullYear().toString()
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    const iso = trimmed.match(/(\d{4}-\d{1,2}-\d{1,2})/)
    if (iso) return iso[1]
    return trimmed
  }

  const normalizeTime = (value: string) => {
    const trimmed = cleanValue(value)
    const half = trimmed.match(/(\d{1,2})時?半/)
    if (half) {
      const hh = half[1].padStart(2, '0')
      return `${hh}:30`
    }
    const hm = trimmed.match(/(\d{1,2})[:：時](\d{2})/)
    if (hm) {
      const [, h, m] = hm
      return `${h.padStart(2, '0')}:${m}`
    }
    const hOnly = trimmed.match(/(\d{1,2})時前後?/)
    if (hOnly) return `${hOnly[1].padStart(2, '0')}:00`
    return trimmed
  }

  const normalizeTemperature = (value: string) => {
    const cleaned = cleanValue(value)
    const num = cleaned.match(/(-?\d+(?:\.\d+)?)/)
    return num ? num[1] : value
  }

  const normalizeWeather = (value: string) => {
    const v = cleanValue(value)
    if (/晴/.test(v)) return '晴れ'
    if (/(曇|くもり)/.test(v)) return '曇り'
    if (/雨/.test(v)) return '雨'
    if (/雪/.test(v)) return '雪'
    return v
  }

  const cleanValue = (value: string) => {
    return value
      .replace(/(えー|えっと|あの|その|あと|それから)/g, '') // フィラー除去
      .replace(/(ですかね|と思います|たぶん|ぐらい|前後|かも|かな)/g, '') // 推測・曖昧
      .replace(/(です|でした|になります|にします|にしてください|にして下さい|お願いします|してください)/g, '') // 丁寧語・依頼
      .replace(/[はをがにで]/g, '') // 助詞を除去（値部分）
      .replace(/[。、．,，…]/g, '') // 句読点
      .trim()
  }

  const parseVoiceCommands = (text: string): Partial<ReportState> => {
    if (!text.trim()) return {}
    const compressed = text
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter((w, i, arr) => (i === 0 ? true : w !== arr[i - 1])) // 連続重複の軽減
      .join(' ')
      .replace(/国立協議場/g, '国立競技場')
      .replace(/キックオブ/g, 'キックオフ')
      .replace(/ピッチコンディション/g, 'ピッチ状態')
    // リアルタイム反映の対象を絞る（大会名・会場・ピッチ・天候・気温・試合区分・試合日・キックオフのみ）
    const map: Record<string, keyof ReportState> = {
      大会名: 'competition',
      大会: 'competition',
      試合区分: 'division',
      試合日: 'matchDate',
      キックオフ: 'kickoff',
      会場: 'venue',
      スタジアム: 'venue',
      天候: 'weather',
      天気: 'weather',
      気温: 'temperature',
      ピッチ: 'pitch',
      ピッチ状態: 'pitch',
      ピッチコンディション: 'pitch',
    }
    const overrides: Partial<ReportState> = {}
    const sentences = compressed.split(/[\n。．、,]/).map((s) => s.trim()).filter(Boolean)

    const resolveKey = (keyRaw: string): keyof ReportState | undefined => {
      if (map[keyRaw]) return map[keyRaw]
      const entries: Array<[string, keyof ReportState]> = [
        ['大会名', 'competition'],
        ['大会', 'competition'],
        ['会場', 'venue'],
        ['スタジアム', 'venue'],
        ['天候', 'weather'],
        ['天気', 'weather'],
        ['ピッチ状態', 'pitch'],
        ['ピッチ', 'pitch'],
        ['ピッチコンディション', 'pitch'],
      ]
      const hit = entries.find(([k]) => keyRaw.includes(k))
      return hit ? hit[1] : undefined
    }

    const allowedPrefixes = ['大会名', '大会', '試合区分', '会場', '天候', '気温', 'ピッチ', 'ピッチ状態', 'ピッチコンディション', '試合日', 'キックオフ']
    sentences.forEach((s) => {
      const startsAllowed = allowedPrefixes.some((p) => s.startsWith(p))
      if (!startsAllowed) return
      const m = s.match(/(.+?)(?:は|を)\s*(.+?)(?:です|でした|になります|にします|にしてください|にして下さい|にして|お願いします|してください)?$/)
      if (!m) return
      const keyRaw = m[1].trim()
      const valRaw = cleanValue(m[2])
      const targetKey = resolveKey(keyRaw)
      if (!targetKey) return
      let normalized = valRaw
      // 試合結果系はリアルタイムでは更新しない
      const disallowKeys: Array<keyof ReportState> = ['homeTeam', 'awayTeam', 'homeScore', 'awayScore', 'homeColor', 'awayColor', 'cautions', 'sendOffs', 'incidents', 'notes', 'round', 'fourth', 'referee', 'ar1', 'ar2', 'reserve']
      if (disallowKeys.includes(targetKey)) return
      // 長過ぎ/短過ぎの値は無効化
      if (normalized.length > 40) return
      if (normalized.length <= 1 || /^\d+$/.test(normalized)) return
      if (targetKey === 'matchDate') normalized = normalizeDateFromText(valRaw)
      if (targetKey === 'kickoff') normalized = normalizeTime(valRaw)
      if (targetKey === 'temperature') normalized = normalizeTemperature(valRaw)
      if (targetKey === 'weather') normalized = normalizeWeather(valRaw)
      ;(overrides as any)[targetKey] = normalized
    })
    return overrides
  }

  const stopStream = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
  }

  const stopRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
  }

  const stopSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.onresult = null
      speechRecognitionRef.current.onend = null
      try {
        speechRecognitionRef.current.stop()
      } catch {
        /* noop */
      }
      speechRecognitionRef.current = null
    }
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (speechRestartTimerRef.current) {
      window.clearTimeout(speechRestartTimerRef.current)
      speechRestartTimerRef.current = null
    }
    if (speechForceRestartTimerRef.current) {
      window.clearTimeout(speechForceRestartTimerRef.current)
      speechForceRestartTimerRef.current = null
    }
  }

  const restartSpeechRecognition = () => {
    stopSpeechRecognition()
    // 少し待ってから再起動し、InvalidStateErrorを回避
    window.setTimeout(() => {
      if (isRecording) {
        startSpeechRecognition()
      }
    }, 400)
  }

  const startSpeechRecognition = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setSpeechNotice('このブラウザは録音の自動文字起こしに対応していません。')
      return
    }
    const recognition: SpeechRecognition = new SpeechRecognitionCtor()
    recognition.lang = 'ja-JP'
    recognition.continuous = true
    recognition.interimResults = true
    speechBufferRef.current = ''
    speechFinalRef.current = ''
    speechInterimRef.current = ''
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (speechRestartTimerRef.current) {
      window.clearTimeout(speechRestartTimerRef.current)
      speechRestartTimerRef.current = null
    }
    if (speechForceRestartTimerRef.current) {
      window.clearTimeout(speechForceRestartTimerRef.current)
      speechForceRestartTimerRef.current = null
    }
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) {
          const finalChunk = res[0].transcript
          speechFinalRef.current += finalChunk
          // 確定した文は即座に正規化してフォームに反映
          const sanitized = sanitizeTranscript(finalChunk)
          if (sanitized) {
            setNormalizedSpeechText((prev) => (prev ? `${prev}\n${sanitized}` : sanitized))
            setRawText((prev) => (prev ? `${prev}\n${sanitized}` : sanitized))
            const overrides = parseVoiceCommands(sanitized)
            if (Object.keys(overrides).length) {
              setForm((prev) => ({ ...prev, ...overrides }))
            }
          }
        } else {
          interim += res[0].transcript
        }
      }
      speechInterimRef.current = interim
      const merged = (speechFinalRef.current + ' ' + interim).trim()
      speechBufferRef.current = merged
      setRawSpeechText(merged) // 生の文字起こし（表示用）

      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current)
      // 音声が途切れても定期再起動できるよう、強制タイマーもリセットして張り直す
      if (speechForceRestartTimerRef.current) window.clearTimeout(speechForceRestartTimerRef.current)
      speechForceRestartTimerRef.current = window.setTimeout(() => {
        if (isRecording) {
          restartSpeechRecognition()
        }
      }, 2 * 60 * 1000)
    }
    recognition.onend = () => {
      // 録音中にWeb Speech APIが自然終了した場合は自動で再起動する
      if (isRecording) {
        if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current)
        speechRestartTimerRef.current = window.setTimeout(() => {
          startSpeechRecognition()
        }, 300)
        setSpeechNotice('音声認識を再起動しています...')
      } else {
        setSpeechNotice('')
      }
    }
    try {
      recognition.start()
      speechRecognitionRef.current = recognition
      setSpeechNotice('')
      // 強制再スタート（4分ごと）で途切れを防ぐ
      speechForceRestartTimerRef.current = window.setTimeout(() => {
        if (isRecording) {
          restartSpeechRecognition()
        }
      }, 2 * 60 * 1000) // 2分ごとに強制再起動
    } catch {
      setSpeechNotice('')
    }
  }

  const startRecording = async () => {
    setRecordError(null)
    setRecordingHint('録音中... 発言するとテキスト化に使えます。')
    shouldKeepAudioRef.current = true
    recordedChunksRef.current = []
    chunkQueueRef.current = []
    chunkPiecesRef.current = []
    overlapPiecesRef.current = []
    chunkElapsedMsRef.current = 0
    isSendingChunkRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const piece = new Blob([event.data], { type: 'audio/webm' })
          // 全体保存用に蓄積
          recordedChunksRef.current.push(piece)
          // 5分チャンク用にピースを貯める
          chunkPiecesRef.current.push(piece)
          chunkElapsedMsRef.current += SLICE_MS
          if (chunkElapsedMsRef.current >= CHUNK_MS) {
            enqueueChunkWithOverlap()
            processChunkQueue()
          }
        }
      }
      recorder.onstop = () => {
        // 停止時に残りピースをまとめて送信キューへ
        enqueueChunkWithOverlap()
        processChunkQueue()
        if (shouldKeepAudioRef.current) {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
          setAudioUrl(URL.createObjectURL(blob))
        } else {
          setAudioUrl(null)
        }
        setIsRecording(false)
        setRecordingHint('録音が完了しました。報告書に反映してください。')
        stopStream()
        // 自動停止の場合、次の録音ができるようにヒントを初期化
        if (!shouldKeepAudioRef.current) {
          setRecordingHint('1分ごとに録音を再開できます。必要に応じて開始してください。')
        }
      }
      // 60秒ごとに dataavailable を発火させる（長尺対策）
      recorder.start(SLICE_MS)
      setIsRecording(true)
      startSpeechRecognition()
      if (autoStopTimerRef.current) {
        window.clearTimeout(autoStopTimerRef.current)
      }
      autoStopTimerRef.current = window.setTimeout(() => {
        stopRecording(true)
      }, AUTO_STOP_MS)
    } catch (err) {
      setRecordError('マイクへのアクセスに失敗しました。権限を確認してください。')
      setIsRecording(false)
      setRecordingHint('録音ボタンを押して会議を記録できます。')
      stopStream()
    }
  }

  const stopRecording = (auto?: boolean) => {
    // 残りのピースをまとめて送信キューへ
    enqueueChunkWithOverlap()
    processChunkQueue()
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    shouldKeepAudioRef.current = !auto
    setRecordingHint(auto ? '1分区切りで自動停止しました。文字起こしを継続します。' : '録音を停止しました。最終解析を実行しています...')
    stopRecorder()
    stopSpeechRecognition()
    if (auto) {
      recordedChunksRef.current = []
      chunkQueueRef.current = []
      chunkPiecesRef.current = []
      overlapPiecesRef.current = []
      chunkElapsedMsRef.current = 0
    }
    // 録音停止時に生テキストを正規化し、解析用にセット（フォーム反映はしない）
    const normalized = sanitizeTranscript(rawSpeechText)
    setNormalizedSpeechText(normalized)
    setRawText(normalized)
    // 最終チャンクを一括送信して結果を反映
    submitAllChunksOnStop().finally(() => {
      setIsApplyingDelay(false)
    })
  }

  const resetRecording = () => {
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    stopRecorder()
    stopStream()
    stopSpeechRecognition()
    recordedChunksRef.current = []
    chunkPiecesRef.current = []
    overlapPiecesRef.current = []
    chunkElapsedMsRef.current = 0
    chunkQueueRef.current = []
    setAudioUrl(null)
    setIsRecording(false)
    setRecordingHint('録音ボタンを押して会議を記録してください。')
    setRecordError(null)
    setRawText('')
    setRawSpeechText('')
    setNormalizedSpeechText('')
    setParseMessage(null)
    setMessage(null)
    speechBufferRef.current = ''
    setSpeechNotice('')
    if (applyDelayTimerRef.current) {
      window.clearTimeout(applyDelayTimerRef.current)
      applyDelayTimerRef.current = null
    }
    shouldKeepAudioRef.current = true
    setIsApplyingDelay(false)
  }

  useEffect(() => {
    return () => {
      stopRecorder()
      stopStream()
      stopSpeechRecognition()
      if (autoStopTimerRef.current) {
        window.clearTimeout(autoStopTimerRef.current)
        autoStopTimerRef.current = null
      }
    }
  }, [])

  // OCR機能は削除済み

  const addPeriodWithConjunctionExclusion = (text: string) => {
    let t = text.trim()
    if (!t) return t
    // すでに句読点・改行で終わっていれば何もしない
    if (/[。！？!?\n]$/.test(t)) return t

    // 句点を付けない語尾（接続助詞など）
    const conjunctionEndings = ['が', 'けど', 'けれど', 'けれども', 'のに', 'しかし', 'なので', 'だから', 'ですから', 'そして', 'また', 'それで', 'それから', 'ところが', 'すると', 'だが', 'とか', 'みたいで', 'っぽくて', 'ね', 'さ']
    if (conjunctionEndings.some((c) => t.endsWith(c))) return t

    // 句点を付ける候補となる丁寧語・終止表現
    const endings = [
      'です',
      'ます',
      'でした',
      'ございます',
      'ございました',
      'ですね',
      'ますね',
      'でしたね',
      'でしょう',
      'と思います',
      'と考えます',
      'ということです',
      'ということになります',
      'になります',
      'となります',
      '以上です',
      '以上になります',
      'ありがとうございます',
      'ありがとうございました',
      'よろしくお願いします',
      'お願いいたします',
      '失礼します',
    ]
    const pattern = new RegExp(`(${endings.join('|')})$`)
    if (pattern.test(t)) return t + '。'

    // URL/英数字・時刻などで終わる場合も句点を付ける
    if (/[A-Za-z0-9:_./-]$/.test(t)) return t + '。'

    return t
  }

    const sanitizeTranscript = (input: string) => {
      // 報告書不要の曖昧語・感嘆・フィラーを除去し、公式文書向けに前処理
      const cleaned = input
        .replace(/\b(えー|えっと|あの|その|あとで|多分|ちょっと|結構|まあ|たぶん|かなり|かも)\b/g, '')
        .replace(/(！|!|\?)/g, '')
        .replace(/[ ]+/g, ' ')
        .trim()
      return addPeriodWithConjunctionExclusion(cleaned)
    }

  const finalizeSegment = (text: string) => {
    const segment = sanitizeTranscript(text)
    if (!segment) return
    const voiceOverrides = parseVoiceCommands(segment)
    const finalForm = { ...initialState, ...form, ...voiceOverrides }
    console.log('rawSegment:', text)
    console.log('cleanedSegment:', segment)
    console.log('segmentOverrides:', voiceOverrides)
    setForm((prev) => ({ ...prev, ...finalForm }))
    setRawText((prev) => (prev ? `${prev}\n${segment}` : segment))
    speechBufferRef.current = ''
    speechFinalRef.current = ''
    speechInterimRef.current = ''
  }

  const parseFromText = (source?: string) => {
    const textRaw = (source ?? rawText ?? normalizedSpeechText ?? rawSpeechText).trim()
    if (!textRaw) {
      setParseMessage('貼り付けテキストが空です。')
      return
    }
    // 句読点を足した後で、断片的な短文が多すぎる場合は長文のみを残す簡易フィルタ
    const textWithPeriod = sanitizeTranscript(textRaw)
    const lines = textWithPeriod.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    const longLines = lines.filter((l) => l.length >= 6)
    const text = (longLines.length ? longLines : lines).join('\n')
    const voiceOverrides = parseVoiceCommands(text)
    const stripSpeaker = (s: string) => s.replace(/^(R|AR1|AR2|4th|第4|主審|副審)[：:]\s*/, '')
    const flatten = (s: string) => stripSpeaker(s).trim()
    const pick = (regex: RegExp) => {
      let last: RegExpExecArray | null = null
      const matches = text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))
      for (const m of matches) last = m as RegExpExecArray
      if (last) return last[1].trim()
      const single = text.match(regex)
      return single ? single[1].trim() : ''
    }
    const applyIfEmpty = (target: Partial<ReportState>, key: keyof ReportState, value: string | undefined) => {
      if (!value) return
      if (!target[key] || target[key] === '不明' || target[key] === '') {
        ;(target as any)[key] = value
      }
    }
    const pickName = (value?: string) => {
      if (!value) return ''
      const quoted = value.match(/[「『]([^」』]+)[」』]/)
      if (quoted) return quoted[1].trim()
      let cleaned = value
        .replace(/(主審|副審1|副審２|副審2|第4の審判員|第4の審判|第４の審判員|第４の審判|第4審|4th|予備審判員|予備審判)[：:は=]?\s*/gi, '')
        .replace(/（[^）]*）/g, '')
        .replace(/[「」『』【】［］\[\]（）()。]/g, '')
        .replace(/(です|だ|になります|担当します).*$/g, '')
        .replace(/(私|わたし|わたくし|自分|俺|ボク)\s*/gi, '')
        .trim()
      // 複数名が区切りで入っていた場合は先頭だけを採用
      cleaned = cleaned.split(/[,，、\/／・;]/)[0].trim()
      return cleaned
    }
    const applyNameIfEmpty = (target: Partial<ReportState>, key: keyof ReportState, value?: string) => {
      const name = pickName(value)
      applyIfEmpty(target, key, name)
    }

    // ユニフォーム色を最大3色抽出するヘルパー
    const extractUniformColors = (source: string, labelKeys: string[]): string => {
      const colors = ['赤', '青', '白', '黒', '緑', '黄', '紫', '橙', 'オレンジ', '紺', '水色', 'ピンク', 'グレー', '灰', '茶', '金', '銀']
      // ラベルに続く行を探す
      const pattern = new RegExp(`(?:${labelKeys.join('|')})[は:\\s]*([^。\\n]+)`, 'i')
      const m = source.match(pattern)
      if (!m || !m[1]) return ''
      // 区切り文字で分割
      const raw = m[1].replace(/ユニフォーム|色|カラー/gi, '')
      const parts = raw.split(/[・・,，／\/\s]+/).map((p) => p.trim()).filter(Boolean)
      const picked: string[] = []
      parts.forEach((p) => {
        // 色語に含まれていれば採用
        const hit = colors.find((c) => p.includes(c))
        if (hit) picked.push(hit)
        else if (p.length <= 4) picked.push(p) // 短い色表現はそのまま採用
      })
      return picked.slice(0, 3).join('・')
    }
    const updates: Partial<ReportState> = {}
    const bulkMatch = text.match(/主審[：:\s]*([^\s、。，]+)[\s\S]*?副審1[：:\s]*([^\s、。，]+)[\s\S]*?副審2[：:\s]*([^\s、。，]+)[\s\S]*?(第4の審判員|第4審判|第４の審判員|第４審判|第4審|4th)[：:\s]*([^\s、。，]+)[\s\S]*?予備審判員[：:\s]*([^\s、。，]+)/)
    if (bulkMatch) {
      updates.referee = pickName(bulkMatch[1])
      updates.ar1 = pickName(bulkMatch[2])
      updates.ar2 = pickName(bulkMatch[3])
      updates.fourth = pickName(bulkMatch[5])
      updates.reserve = pickName(bulkMatch[6])
    }
    // 審判団をまとめて記述している行から抜き出す
    const pickRole = (patterns: RegExp[]) => {
      for (const r of patterns) {
        const m = text.match(r)
        if (m && m[1]) return pickName(m[1])
      }
      return ''
    }
    updates.referee = updates.referee || pickRole([/主審(?:は|：|:)?\s*([^\s、。，]+)/])
    updates.ar1 = updates.ar1 || pickRole([/副審1(?:は|：|:)?\s*([^\s、。，]+)/])
    updates.ar2 = updates.ar2 || pickRole([/副審2(?:は|：|:)?\s*([^\s、。，]+)/])
    updates.fourth =
      updates.fourth ||
      pickRole([/(第4の審判員|第4審判|第４の審判員|第４審判|第4審|4th)(?:は|：|:)?\s*([^\s、。，]+)/, /第4[：:\s]*([^\s、。，]+)/])
    updates.reserve = updates.reserve || pickRole([/予備審判員(?:は|：|:)?\s*([^\s、。，]+)/])
    const detailLines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const pickTime = () => {
      // HH:MM または 10時03分 などを HH:MM に正規化
      const colon = text.match(/(\d{1,2}:\d{2})/)
      if (colon) return colon[1]
      const jp = text.match(/(\d{1,2})時(\d{2})分/)
      if (jp) {
        const hh = jp[1].padStart(2, '0')
        const mm = jp[2].padStart(2, '0')
        return `${hh}:${mm}`
      }
      return ''
    }
    // 過剰反映を防ぐための簡易トリミング
    const truncateAtKeywords = (val: string, keywords: string[]) => {
      let t = val
      keywords.forEach((k) => {
        if (!k) return
        if (t.includes(k)) {
          t = t.split(k)[0].trim()
        }
      })
      t = t.split(/[、。]/)[0].trim()
      return t
    }
    const dateMatch =
      text.match(/(\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/) ||
      text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) ||
      text.match(/(\d{1,2})月(\d{1,2})日/)
    if (dateMatch) {
      if (dateMatch.length === 4 && dateMatch[2] && dateMatch[3]) {
        const yyyy = dateMatch[1]
        const mm = dateMatch[2].padStart(2, '0')
        const dd = dateMatch[3].padStart(2, '0')
        updates.matchDate = `${yyyy}-${mm}-${dd}`
      } else {
        const yyyy = new Date().getFullYear().toString()
        const mm = dateMatch[1].padStart(2, '0')
        const dd = dateMatch[2].padStart(2, '0')
        updates.matchDate = `${yyyy}-${mm}-${dd}`
      }
    }
    updates.competition = pick(/競技会名[：:]\s*([^\n]+)/) || pick(/大会名[：:]\s*([^\n]+)/)
    updates.competition = truncateAtKeywords(updates.competition || '', ['試合区分', '節', 'ラウンド', 'キックオフ', '会場', '天候', '気温', 'ピッチ'])

    updates.division = pick(/試合区分[：:]\s*([^\n]+)/) || (text.includes('リーグ戦') ? 'リーグ戦' : '')
    if (!/^[1-4]種$/.test(updates.division || '')) {
      const m = (updates.division || '').match(/([1-4])\s*種/)
      updates.division = m ? `${m[1]}種` : updates.division
    }

    updates.round = pick(/節\s*\/\s*ラウンド[：:]\s*([^\n]+)/) || (text.match(/第(\d+)節/) ? `第${text.match(/第(\d+)節/)![1]}節` : '')
    updates.round = truncateAtKeywords(updates.round || '', ['試合日', 'キックオフ', '会場', '天候', '気温', 'ピッチ'])

    updates.kickoff = pick(/試合開始[^\d]*(\d{1,2}:\d{2})/) || pickTime()

    updates.venue = pick(/会場[：:]\s*([^\n]+)/) || pick(/会場は「?([^\n」]+)」?/)
    updates.venue = truncateAtKeywords(updates.venue || '', ['天候', '気温', 'ピッチ', 'ホーム', 'アウェイ'])

    updates.weather =
      pick(/天候[：:]\s*([^\n]+)/) ||
      pick(/気象は\s*([^\s、，]+[^\n]*)/) ||
      pick(/天候は\s*([^\n。]+)/) ||
      (text.includes('晴') ? '晴れ' : '')
    updates.weather = truncateAtKeywords(updates.weather || '', ['気温', 'ピッチ', 'ホーム', 'アウェイ'])
    if (!/(晴|曇|雨|雪)/.test(updates.weather || '')) updates.weather = ''

    const tempRaw = pick(/気温[^\d-]*(-?\d{1,2}(?:\.\d+)?)/) || pick(/気温は\s*(-?\d{1,2}(?:\.\d+)?)/)
    if (tempRaw) {
      const num = parseFloat(tempRaw)
      if (!isNaN(num) && num > -60 && num < 70) updates.temperature = num.toString()
    }

    updates.pitch =
      pick(/ピッチ[状態]*[：:]\s*([^\n]+)/) ||
      pick(/ピッチ状態は「?([^\n」]+)」?/) ||
      pick(/ピッチ状態は\s*([^\n。]+)/) ||
      (text.includes('芝') ? '芝' : '')
    updates.pitch = truncateAtKeywords(updates.pitch || '', ['ホーム', 'アウェイ', 'チーム', '得点'])
    updates.homeTeam =
      pick(/ホームチーム[「\"]?([^\n」\"]+)[」\"]?/) ||
      pick(/Aチーム[「\"]?([^\n」\"]+)[」\"]?/) ||
      updates.homeTeam
    updates.awayTeam =
      pick(/アウェイチーム[「\"]?([^\n」\"]+)[」\"]?/) ||
      pick(/Bチーム[「\"]?([^\n」\"]+)[」\"]?/) ||
      updates.awayTeam
    const scoreMatch =
      text.match(/ホームチーム[「」\"]?([^\n」\"]+)[」\"]?\s*(\d+)[、,／\/]\s*アウェイチーム[「」\"]?([^\n」\"]+)[」\"]?\s*(\d+)/) ||
      text.match(/ホームチーム.*?(\d+)[得点点].*?アウェイチーム.*?(\d+)[得点点]/) ||
      text.match(/ホーム.*?(\d+)[得点点].*?アウェイ.*?(\d+)[得点点]/) ||
      text.match(/ホームチーム.*?(\d+)\s*対\s*(\d+)/) ||
      text.match(/A\s*(\d+)\s*[–\-]\s*(\d+)\s*B/)
    if (scoreMatch) {
      if (scoreMatch.length === 5) {
        updates.homeTeam = updates.homeTeam || scoreMatch[1]
        updates.homeScore = scoreMatch[2]
        updates.awayTeam = updates.awayTeam || scoreMatch[3]
        updates.awayScore = scoreMatch[4]
      } else {
        updates.homeScore = scoreMatch[1]
        updates.awayScore = scoreMatch[2]
      }
    }
    // ユニフォームカラー
    const homeColorMatch = text.match(/ホームチームのカラーは\s*([^\n。]+)[。]?/)
    if (homeColorMatch) updates.homeColor = homeColorMatch[1].replace(/\s+/g, ' ').trim()
    const awayColorMatch = text.match(/アウェイチームは\s*([^\n。]+)[。]?/)
    if (awayColorMatch) updates.awayColor = awayColorMatch[1].replace(/\s+/g, ' ').trim()
    // ユニフォーム色（最大3色）を自然文から抽出
    const homeColorExtracted = extractUniformColors(text, ['ホームチームユニフォーム', 'ホームユニフォーム', 'ホームのユニフォーム', 'ホーム色'])
    if (homeColorExtracted) updates.homeColor = homeColorExtracted
    const awayColorExtracted = extractUniformColors(text, ['アウェイチームユニフォーム', 'アウェイユニフォーム', 'アウェイのユニフォーム', 'アウェイ色', 'アウェイカラー'])
    if (awayColorExtracted) updates.awayColor = awayColorExtracted
    // 追加スキャン（行単位）
    detailLines.forEach((ln) => {
      if (/大会名|競技会名/.test(ln)) applyIfEmpty(updates, 'competition', ln.replace(/.*[：:]/, '').trim())
      if (/試合区分/.test(ln)) applyIfEmpty(updates, 'division', ln.replace(/.*[：:]/, '').trim())
      if (/第\d+節/.test(ln)) applyIfEmpty(updates, 'round', ln.match(/第\d+節/)?.[0])
      if (/キックオフ|試合開始/.test(ln)) applyIfEmpty(updates, 'kickoff', pickTime())
      if (/会場/.test(ln)) applyIfEmpty(updates, 'venue', ln.replace(/.*[：:]/, '').replace(/会場は/, '').trim())
      if (/天候|気象/.test(ln) && ln.replace(/.*[：:]/, '').trim()) applyIfEmpty(updates, 'weather', ln.replace(/.*[：:]/, '').trim())
      if (/気温/.test(ln) && ln.match(/(\d{1,2})/)) applyIfEmpty(updates, 'temperature', ln.match(/(\d{1,2})/)?.[1])
      if (/ピッチ/.test(ln)) applyIfEmpty(updates, 'pitch', ln.replace(/.*[：:]/, '').trim())
      if (/主審/.test(ln)) applyNameIfEmpty(updates, 'referee', ln.replace(/.*[：:]/, '').trim())
      if (/副審1/.test(ln)) applyNameIfEmpty(updates, 'ar1', ln.replace(/.*[：:]/, '').trim())
      if (/副審2/.test(ln)) applyNameIfEmpty(updates, 'ar2', ln.replace(/.*[：:]/, '').trim())
      if (/(第4の審判員|第4の審判|第４の審判員|第４の審判|第4審|4th|第4)/i.test(ln)) applyNameIfEmpty(updates, 'fourth', ln.replace(/.*[：:]/, '').trim())
      if (/予備審判/.test(ln)) applyNameIfEmpty(updates, 'reserve', ln.replace(/.*[：:]/, '').trim())
    })
    updates.referee = pickName(updates.referee)
    updates.ar1 = pickName(updates.ar1)
    updates.ar2 = pickName(updates.ar2)
    updates.fourth = pickName(updates.fourth)
    updates.reserve = pickName(updates.reserve)
    const cautionLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /(前半|後半).*(警告|反スポ|遅延|異議|乱暴|ラフ|スライディング)/.test(l) && /(番|監督|コーチ)/.test(l))
      .map(flatten)
    if (cautionLines.length === 0) {
      const cautionMatches = Array.from(
        text.matchAll(/(前半|後半)(\d+)分[^。\n]*?(ホームチーム|アウェイチーム|ホーム|アウェイ|[^\s、。]+)[^\n]*?(\d+)番[、,\s]*([^\n。]+)/g)
      )
      const mapped = cautionMatches.map((m) => `${m[1]}${m[2]}分 ${m[3]} ${m[4]}番 ${m[5].trim()}`)
      if (mapped.length) updates.cautions = mapped.join('\n')
    } else {
      updates.cautions = cautionLines.join('\n')
    }
    const sendOffLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /(退場|退席|退場者)/.test(l) && /番/.test(l))
      .map(flatten)
    if (sendOffLines.length) updates.sendOffs = sendOffLines.join('\n')
    const cautionIds = new Set(
      cautionLines.map((l) => l.replace(/\s+/g, ' ').trim())
    )
    const sendOffIds = new Set(
      sendOffLines.map((l) => l.replace(/\s+/g, ' ').trim())
    )
    const incidentLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /(投げ込み|装具|ボールパーソン|技術エリア|抗議|注意|中断|特記事項)/.test(l))
      .filter((l) => !cautionIds.has(l.replace(/\s+/g, ' ').trim()) && !sendOffIds.has(l.replace(/\s+/g, ' ').trim()))
    const uniqueIncidents = Array.from(new Set(incidentLines)).filter(Boolean)
    const incidentSummary =
      pick(/その他特記事項[：:]\s*([^\n]+)/) ||
      pick(/備考[：:]\s*([^\n]+)/) ||
      uniqueIncidents
        .filter(Boolean)
        .map(flatten)
        .slice(0, 3)
        .join(' / ')
    updates.incidents = incidentSummary ? flatten(incidentSummary) : updates.incidents
    const noteLines = detailLines.filter((l) => /備考|メモ/.test(l))
    if (noteLines.length) updates.notes = noteLines.map(flatten).join('\n')

    const finalForm: ReportState = {
      competition: updates.competition || form.competition,
      division: updates.division || form.division,
      round: updates.round || form.round,
      matchDate: updates.matchDate || form.matchDate,
      kickoff: updates.kickoff || form.kickoff,
      venue: updates.venue || form.venue,
      weather: updates.weather || form.weather,
      temperature: updates.temperature || form.temperature,
      pitch: updates.pitch || form.pitch,
      homeTeam: updates.homeTeam || form.homeTeam,
      awayTeam: updates.awayTeam || form.awayTeam,
      homeScore: normalizeScoreString(updates.homeScore || form.homeScore || '0'),
      awayScore: normalizeScoreString(updates.awayScore || form.awayScore || '0'),
      referee: updates.referee || form.referee,
      ar1: updates.ar1 || form.ar1,
      ar2: updates.ar2 || form.ar2,
      fourth: updates.fourth || form.fourth,
      reserve: updates.reserve || form.reserve,
      homeColor: updates.homeColor || form.homeColor,
      awayColor: updates.awayColor || form.awayColor,
      cautions: updates.cautions || form.cautions || 'なし',
      sendOffs: updates.sendOffs || form.sendOffs || 'なし',
      incidents: updates.incidents || form.incidents || '特記事項なし',
      notes: updates.notes || form.notes,
    }
    // 音声コマンドの指定がある項目は優先的に上書き
    Object.assign(finalForm, voiceOverrides)
    console.log('rawTranscript:', textRaw)
    console.log('cleanedTranscript:', text)
    console.log('voiceOverrides:', voiceOverrides)
    setForm((prev) => ({ ...prev, ...finalForm }))
    setParseMessage('テキストを報告書に反映しました。')
  }

  const formatIncidentLine = (item: { minute?: number; team?: string; number?: string; player_name?: string; code?: string; detail?: string; reason?: string }) => {
    const half = item.minute !== undefined ? (item.minute <= 45 ? '前半' : '後半') : ''
    const min = item.minute !== undefined ? (item.minute <= 45 ? item.minute : item.minute - 45) : ''
    const minuteText = item.minute !== undefined ? `${half}${min}分` : ''
    const team = item.team ? `${item.team}` : ''
    const num = item.number ? `${item.number}番` : ''
    const name = item.player_name || ''
    const code = item.code || item.reason || ''
    const detail = item.detail || ''
    return [minuteText, team, num, name, code, detail].filter(Boolean).join(' ')
  }

  const applyIncidentsResult = (resp: { cautions?: Array<any>; send_offs?: Array<any>; special_notes?: string }) => {
    const cautionsStr = (resp.cautions || []).map(formatIncidentLine).join('\n')
    const sendOffsStr = (resp.send_offs || []).map(formatIncidentLine).join('\n')
    const notes = resp.special_notes || ''
    setForm((prev) => ({
      ...prev,
      cautions: cautionsStr || prev.cautions,
      sendOffs: sendOffsStr || prev.sendOffs,
      incidents: notes || prev.incidents,
    }))
  }

  const enqueueChunkWithOverlap = () => {
    const parts = [...overlapPiecesRef.current, ...chunkPiecesRef.current]
    if (!parts.length) return
    const chunk = new Blob(parts, { type: 'audio/webm' })
    chunkQueueRef.current.push(chunk)
    // 次チャンク用に末尾10秒分を保持
    const overlapCount = Math.min(OVERLAP_PIECES, parts.length)
    overlapPiecesRef.current = parts.slice(parts.length - overlapCount)
    chunkPiecesRef.current = []
    chunkElapsedMsRef.current = 0
  }

  // バックグラウンドでチャンクを順次送信してフォームに反映
  const processChunkQueue = async () => {
    if (isSendingChunkRef.current) return
    isSendingChunkRef.current = true
    try {
      while (chunkQueueRef.current.length > 0) {
        const chunk = chunkQueueRef.current.shift()
        if (!chunk) continue
        const fd = new FormData()
        fd.append('file', chunk, 'chunk.webm')
        try {
          const res = await fetch(`${apiBase}/audio/parse?diarize=true`, { method: 'POST', body: fd })
          if (res.ok) {
            const data = await res.json()
            applyBackendResult(data)
          }
        } catch (err) {
          console.warn('chunk parse failed', err)
        }
        try {
          const resInc = await fetch(`${apiBase}/audio/parse/incidents?diarize=true`, { method: 'POST', body: fd })
          if (resInc.ok) {
            const inc = await resInc.json()
            applyIncidentsResult(inc)
          }
        } catch (err) {
          console.warn('chunk incidents parse failed', err)
        }
      }
    } finally {
      isSendingChunkRef.current = false
    }
  }

  // 録音停止時に全データを一括送信して最終反映
  const submitAllChunksOnStop = async () => {
    try {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
      if (blob.size === 0) return
      const fd = new FormData()
      fd.append('file', blob, 'all.webm')
      const res = await fetch(`${apiBase}/audio/parse?diarize=true`, { method: 'POST', body: fd })
      if (res.ok) {
        const data = await res.json()
        applyBackendResult(data)
      }
      const resInc = await fetch(`${apiBase}/audio/parse/incidents?diarize=true`, { method: 'POST', body: fd })
      if (resInc.ok) {
        const inc = await resInc.json()
        applyIncidentsResult(inc)
      }
    } catch (err) {
      console.warn('final parse failed', err)
    }
  }

  const applyFromAudio = async () => {
    // 録音が無ければテキスト入力のパースにフォールバック
    if (!recordedChunksRef.current.length) {
      parseFromText()
      return
    }
    setIsApplyingDelay(true)
    setParseMessage('音声を解析しています...')
    try {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
      const fd = new FormData()
      fd.append('file', blob, 'mtg.webm')
      const res = await fetch(`${apiBase}/audio/parse?diarize=true`, { method: 'POST', body: fd })
      if (!res.ok) {
        throw new Error('backend error')
      }
      const data = await res.json()
      applyBackendResult(data)
      // incidents も取得
      try {
        const resInc = await fetch(`${apiBase}/audio/parse/incidents?diarize=true`, { method: 'POST', body: fd })
        if (resInc.ok) {
          const inc = await resInc.json()
          applyIncidentsResult(inc)
        }
      } catch (e) {
        console.warn('incidents parse failed', e)
      }
      setParseMessage('音声の解析結果を反映しました。')
    } catch (err) {
      console.error('audio parse failed, fallback to text', err)
      setParseMessage('音声解析に失敗したため、テキストから反映します。')
      parseFromText()
    } finally {
      setIsApplyingDelay(false)
    }
  }

  return (
    <div
      style={{
        padding: '12px',
        maxWidth: '1100px',
        margin: '0 auto',
        color: '#0f172a',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print-exclude { display: none !important; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          width: `${(1 / scale) * 100}%`,
        }}
      >
        <div className="print-exclude" style={{ ...card, marginBottom: '12px' }}>
          <h3 style={{ marginBottom: '8px', fontSize: '15px', fontWeight: 600 }}>テキストを貼る（最大10,000文字）</h3>
          <p style={{ marginTop: 0, marginBottom: '10px', fontSize: '12px', color: '#475569' }}>
            Notionの文字起こしやメモをそのまま貼り付けてください。解析ボタンで入力欄へ反映します。
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value.slice(0, 10000))}
            maxLength={10000}
            placeholder="ここにテキストを貼り付け"
            style={{
              width: '100%',
              minHeight: '220px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #d7e3f4',
              background: '#fff',
              fontSize: '14px',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <span style={{ fontSize: '12px', color: '#475569' }}>{rawText.length}/10000</span>
            <button
              onClick={() => parseFromText(rawText)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '2px solid transparent',
                background: '#2563eb',
                color: '#f8fafc',
                fontWeight: 800,
                cursor: 'pointer',
                minWidth: '140px',
                letterSpacing: '0.02em',
                boxShadow: '0 10px 24px rgba(37, 99, 235, 0.25)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              報告書に反映
            </button>
          </div>
          {parseMessage && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: parseMessage.includes('失敗') || parseMessage.includes('空') ? '#b91c1c' : '#0f766e' }}>
              {parseMessage}
            </div>
          )}
        </div>

        <div ref={printRef} className="print-area">
          <section style={{ ...card, marginBottom: '14px', display: 'grid', gap: '14px' }}>
            <div>
              <h3 style={sectionTitleStyle}>試合情報</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={labelStyle}>
                  大会名
                  <input value={form.competition} onChange={handleChange('competition')} style={inputStyle} placeholder="" />
                </label>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <label style={labelStyle}>
                    試合区分
                    <input value={form.division} onChange={handleChange('division')} style={inputStyle} placeholder="" />
                  </label>
                  <label style={labelStyle}>
                    節 / ラウンド
                    <input value={form.round} onChange={handleChange('round')} style={inputStyle} placeholder="" />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <label style={labelStyle}>
                    試合日
                    <input type="date" value={form.matchDate} onChange={handleChange('matchDate')} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    キックオフ
                    <input type="time" value={form.kickoff} onChange={handleChange('kickoff')} style={inputStyle} />
                  </label>
                </div>
                <label style={labelStyle}>
                  会場
                  <input value={form.venue} onChange={handleChange('venue')} style={inputStyle} placeholder="" />
                </label>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <label style={labelStyle}>
                    天候
                    <input value={form.weather} onChange={handleChange('weather')} style={inputStyle} placeholder="" />
                  </label>
                  <label style={labelStyle}>
                    気温(℃)
                    <input type="number" value={form.temperature} onChange={handleChange('temperature')} style={inputStyle} placeholder="" />
                  </label>
                  <label style={labelStyle}>
                    ピッチ状態
                    <input value={form.pitch} onChange={handleChange('pitch')} style={inputStyle} placeholder="" />
                  </label>
                </div>
              </div>
            </div>

            <div style={dividerStyle} />

            <div>
              <h3 style={sectionTitleStyle}>試合結果</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'center' }}>
                  <label style={labelStyle}>
                    ホームチーム
                    <input value={form.homeTeam} onChange={handleChange('homeTeam')} style={inputStyle} placeholder="" />
                  </label>
                  <label style={labelStyle}>
                    アウェイチーム
                    <input value={form.awayTeam} onChange={handleChange('awayTeam')} style={inputStyle} placeholder="" />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'center' }}>
                  <label style={labelStyle}>
                    ホームチームユニフォーム
                    <input value={form.homeColor} onChange={handleChange('homeColor')} style={inputStyle} placeholder="" />
                  </label>
                  <label style={labelStyle}>
                    アウェイチームユニフォーム
                    <input value={form.awayColor} onChange={handleChange('awayColor')} style={inputStyle} placeholder="" />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', alignItems: 'center' }}>
                  <label style={labelStyle}>
                    ホーム得点
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.homeScore}
                      onChange={handleChange('homeScore')}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    アウェイ得点
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.awayScore}
                      onChange={handleChange('awayScore')}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div style={dividerStyle} />

            <div>
              <h3 style={sectionTitleStyle}>審判団</h3>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>氏名のみを入力してください（例: 佐藤 / 高橋）。</div>
              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label style={labelStyle}>
                  主審
                  <input value={form.referee} onChange={handleChange('referee')} style={inputStyle} placeholder="" />
                </label>
                <label style={labelStyle}>
                  副審1
                  <input value={form.ar1} onChange={handleChange('ar1')} style={inputStyle} placeholder="" />
                </label>
                <label style={labelStyle}>
                  副審2
                  <input value={form.ar2} onChange={handleChange('ar2')} style={inputStyle} placeholder="" />
                </label>
                <label style={labelStyle}>
                  第4審
                  <input value={form.fourth} onChange={handleChange('fourth')} style={inputStyle} placeholder="" />
                </label>
                <label style={labelStyle}>
                  予備審判員
                  <input value={form.reserve} onChange={handleChange('reserve')} style={inputStyle} placeholder="" />
                </label>
              </div>
            </div>

            <div style={dividerStyle} />

            <div>
              <h3 style={sectionTitleStyle}>警告 / 退場</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={labelStyle}>
                  警告（選手名・理由・分）
                  <textarea value={form.cautions} onChange={handleChange('cautions')} style={{ ...inputStyle, minHeight: '72px' }} />
                </label>
                <label style={labelStyle}>
                  退場（選手名・理由・分）
                  <textarea value={form.sendOffs} onChange={handleChange('sendOffs')} style={{ ...inputStyle, minHeight: '72px' }} />
                </label>
              </div>
            </div>

            <div style={dividerStyle} />

            <div>
              <h3 style={sectionTitleStyle}>特記事項 / インシデント</h3>
              <label style={labelStyle}>
                内容
                <textarea
                  value={form.incidents}
                  onChange={handleChange('incidents')}
                  style={{ ...inputStyle, minHeight: '90px' }}
                  placeholder="異常気象、負傷、設備トラブルなど"
                />
              </label>
            </div>

            <div style={dividerStyle} />

            <div>
              <h3 style={sectionTitleStyle}>備考</h3>
              <label style={labelStyle}>
                メモ
                <textarea value={form.notes} onChange={handleChange('notes')} style={{ ...inputStyle, minHeight: '90px' }} />
              </label>
            </div>
          </section>
        </div>

        <div className="print-exclude" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={handleClear}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#111827',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: '120px',
            }}
          >
            クリア
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: '120px',
            }}
          >
            提出&PDF出力
          </button>
        </div>

        {message && (
          <div className="print-exclude" style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: '#ecfdf3', color: '#166534', fontSize: '13px' }}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

export default RefereeReport
