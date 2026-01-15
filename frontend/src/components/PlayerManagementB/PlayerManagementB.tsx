import React, { useEffect, useMemo, useState } from 'react'

type PlayerEntry = { id: number; name: string; url: string; dataUrl: string; team?: string }

const STORAGE_KEY_PLAYERS = 'player-management-b-players'
const STORAGE_KEY_REG = 'player-management-b-reg'
const STORAGE_KEY_APPROVAL = 'player-management-b-approval'
const STORAGE_KEY_ASSOC = 'player-management-b-assoc'
const STORAGE_KEY_PREF_ASSOC = 'prefecture-association'
const STORAGE_KEY_RELEASE = 'player-management-b-release'
const BLOCKED_NAMES = new Set(['Jorge Castillo'])
const APPROVAL_KEY_MAP: Record<string, string> = {
  PROTHENTIAFC: 'player-management-a-approval',
  '横浜Fマリノス': 'player-management-b-approval',
}

const DEFAULT_PLAYERS = [
  'Renato Silva',
  'Thiago Costa',
  'João Martins',
  'Mikael Hansen',
  'Aleksandr Ivanov',
  'Gabriel Souza',
  'Emilio Vargas',
  'Nicolás Guzmán',
  'Paolo Ricci',
  'Santiago Lopez',
  'Miguel Torres',
].map((name, idx) => ({ id: 2001 + idx, name }))

const EMPTY_PDF_DATAURL = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iaiA8PD4+CmVuZG9iagp0cmFpbGVyPDw+PgolJUVPRg=='

const cardStyle: React.CSSProperties = {
  border: '1px solid #d8c69c',
  borderRadius: '12px',
  background: '#fdfbf6',
  padding: '16px',
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
}

const TEAM_META = [
  { name: 'PROTHENTIAFC', type: '1種', pref: '東京都' },
  { name: '横浜Fマリノス', type: '1種', pref: '神奈川県' },
]
const MOOD_FACES = ['😀', '😁', '😊', '😄', '😃', '🙂', '😺', '😸', '😆', '😇', '🤗']
const pickMood = (seed: number | undefined, offset = 0) => {
  const n = Number(seed)
  if (!Number.isFinite(n)) return '🙂'
  const idx = Math.abs(Math.floor(n + offset)) % MOOD_FACES.length
  return MOOD_FACES[idx] || '🙂'
}

const PlayerManagementB: React.FC = () => {
  const [players, setPlayers] = useState<PlayerEntry[]>([])
  const [dragPlayerId, setDragPlayerId] = useState<number | null>(null)

  const [regFiles, setRegFiles] = useState<PlayerEntry[]>([])
  const [approvalFiles, setApprovalFiles] = useState<PlayerEntry[]>([])
  const [regDragActive, setRegDragActive] = useState(false)
  const [assocFiles, setAssocFiles] = useState<PlayerEntry[]>([])
  const [regType, setRegType] = useState('')
  const [regAffiliation, setRegAffiliation] = useState('')
  const [regTeam, setRegTeam] = useState('')
  const [regMessage, setRegMessage] = useState<string | null>(null)
  const [releaseDragActive, setReleaseDragActive] = useState(false)
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null)
  const [releaseQueue, setReleaseQueue] = useState<PlayerEntry[]>([])

  const typeOptions = useMemo(() => Array.from(new Set(TEAM_META.map((t) => t.type))), [])
  const affiliationOptions = useMemo(() => {
    const filtered = TEAM_META.filter((t) => (!regType ? true : t.type === regType))
    return Array.from(new Set(filtered.map((t) => t.pref)))
  }, [regType])
  const teamOptions = useMemo(() => {
    return TEAM_META.filter((t) => {
      if (regType && t.type !== regType) return false
      if (regAffiliation && t.pref !== regAffiliation) return false
      return true
    })
  }, [regType, regAffiliation])

  const elevate = (el: HTMLElement, hovering: boolean) => {
    el.style.transform = hovering ? 'translateY(-3px)' : 'translateY(0)'
    el.style.boxShadow = hovering ? '0 10px 22px rgba(0,0,0,0.14)' : '0 4px 10px rgba(0,0,0,0.12)'
  }

  const removePlayer = (id: number) => {
    setPlayers((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      URL.revokeObjectURL(prev[idx].url)
      const next = prev.filter((p) => p.id !== id)
      localStorage.setItem(
        STORAGE_KEY_PLAYERS,
        JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
      )
      return next
    })
  }

  const confirmRelease = () => {
    if (!releaseQueue.length) {
      setReleaseMessage('退団用にドラッグしたPDFがありません。')
      return
    }
    const ids = new Set(releaseQueue.map((p) => p.id))
    setPlayers((prev) => {
      const next = prev.filter((p) => {
        const willRemove = ids.has(p.id)
        if (willRemove) URL.revokeObjectURL(p.url)
        return !willRemove
      })
      localStorage.setItem(
        STORAGE_KEY_PLAYERS,
        JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
      )
      return next
    })
    persistReleaseQueue([])
    setReleaseMessage('退団を確定しました。')
  }

  const movePlayerToReg = (id: number) => {
    setPlayers((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      const entry = prev[idx]
      const nextPlayers = [...prev]
      nextPlayers.splice(idx, 1)
      localStorage.setItem(
        STORAGE_KEY_PLAYERS,
        JSON.stringify(nextPlayers.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
      )
      setRegFiles((regPrev) => {
        if (regPrev.some((r) => r.id === entry.id)) return regPrev
        const next = [...regPrev, entry]
        localStorage.setItem(
          STORAGE_KEY_REG,
          JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
        )
        return next
      })
      return nextPlayers
    })
  }

  const createEntriesFromFiles = async (fileList: FileList, idPrefix: number) => {
    const files = Array.from(fileList)
    const entries: PlayerEntry[] = await Promise.all(
      files.map(
        (file, idx) =>
          new Promise<PlayerEntry>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              const blob = new Blob([file], { type: file.type || 'application/pdf' })
              const url = URL.createObjectURL(blob)
              resolve({ id: idPrefix + idx, name: file.name, url, dataUrl })
            }
            reader.readAsDataURL(file)
          })
      )
    )
    return entries
  }

  const persistReleaseQueue = (entries: PlayerEntry[]) => {
    setReleaseQueue(entries)
    localStorage.setItem(
      STORAGE_KEY_RELEASE,
      JSON.stringify(entries.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
    )
  }

  useEffect(() => {
    const restoreFromRaw = async (raw: string | null) => {
      if (!raw) return []
      const saved = JSON.parse(raw) as { id: number; name: string; dataUrl: string }[]
      const list = await Promise.all(
        saved.map(async (s) => {
          if (BLOCKED_NAMES.has(s.name)) return null
          const blob = await fetch(s.dataUrl).then((r) => r.blob())
          const url = URL.createObjectURL(blob)
          return { id: s.id, name: s.name, url, dataUrl: s.dataUrl }
        })
      )
      return list.filter(Boolean) as PlayerEntry[]
    }

    const createEmptyEntry = async (entry: { id: number; name: string }) => {
      const blob = await fetch(EMPTY_PDF_DATAURL).then((r) => r.blob())
      const url = URL.createObjectURL(blob)
      return { id: entry.id, name: entry.name, url, dataUrl: EMPTY_PDF_DATAURL }
    }

    const bootstrap = async () => {
      const storedPlayers = localStorage.getItem(STORAGE_KEY_PLAYERS)
      if (storedPlayers) {
        restoreFromRaw(storedPlayers)
          .then((list) => {
            setPlayers(list)
            localStorage.setItem(
              STORAGE_KEY_PLAYERS,
              JSON.stringify(list.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
            )
          })
          .catch(() => {})
      } else {
        const seeded = await Promise.all(DEFAULT_PLAYERS.map(createEmptyEntry))
        setPlayers(seeded)
        localStorage.setItem(
          STORAGE_KEY_PLAYERS,
          JSON.stringify(seeded.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
        )
      }

      restoreFromRaw(localStorage.getItem(STORAGE_KEY_REG))
        .then((list) => {
          setRegFiles(list)
          localStorage.setItem(STORAGE_KEY_REG, JSON.stringify(list.map(({ id, name, dataUrl }) => ({ id, name, dataUrl }))))
        })
        .catch(() => {})
      restoreFromRaw(localStorage.getItem(STORAGE_KEY_APPROVAL))
        .then((list) => {
          setApprovalFiles(list)
          localStorage.setItem(
            STORAGE_KEY_APPROVAL,
            JSON.stringify(list.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
          )
        })
        .catch(() => {})
      restoreFromRaw(localStorage.getItem(STORAGE_KEY_ASSOC))
        .then((list) => {
          setAssocFiles(list)
          localStorage.setItem(STORAGE_KEY_ASSOC, JSON.stringify(list.map(({ id, name, dataUrl }) => ({ id, name, dataUrl }))))
        })
        .catch(() => {})
      restoreFromRaw(localStorage.getItem(STORAGE_KEY_RELEASE))
        .then((list) => {
          persistReleaseQueue(list)
          localStorage.setItem(
            STORAGE_KEY_RELEASE,
            JSON.stringify(list.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
          )
        })
        .catch(() => {})

      // 一度だけ協会承認待ちをクリア
      const cleared = localStorage.getItem('assoc-cleared-b')
      if (!cleared) {
        localStorage.setItem(STORAGE_KEY_ASSOC, JSON.stringify([]))
        setAssocFiles([])
        localStorage.setItem('assoc-cleared-b', 'yes')
      }
    }

    bootstrap().catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      players.forEach((p) => URL.revokeObjectURL(p.url))
      regFiles.forEach((p) => URL.revokeObjectURL(p.url))
      approvalFiles.forEach((p) => URL.revokeObjectURL(p.url))
      assocFiles.forEach((p) => URL.revokeObjectURL(p.url))
      releaseQueue.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [players, regFiles, approvalFiles, assocFiles, releaseQueue])

  const pushToApprovalStorage = (team: string, files: PlayerEntry[]) => {
    const targetKey = APPROVAL_KEY_MAP[team] || STORAGE_KEY_APPROVAL
    const raw = localStorage.getItem(targetKey)
    const saved = raw ? (JSON.parse(raw) as { id: number; name: string; dataUrl: string }[]) : []
    const merged = [...saved]
    files.forEach((f) => {
      if (!merged.some((m) => m.id === f.id)) merged.push({ id: f.id, name: f.name, dataUrl: f.dataUrl })
    })
    localStorage.setItem(targetKey, JSON.stringify(merged))
    return targetKey
  }

  const pushToPrefectureAssociation = (files: PlayerEntry[], team: string) => {
    const raw = localStorage.getItem(STORAGE_KEY_PREF_ASSOC)
    const saved = raw ? (JSON.parse(raw) as { id: number; name: string; dataUrl: string; team?: string }[]) : []
    const merged = [...saved]
    files.forEach((f) => {
      if (!merged.some((m) => m.id === f.id)) merged.push({ id: f.id, name: f.name, dataUrl: f.dataUrl, team })
    })
    localStorage.setItem(STORAGE_KEY_PREF_ASSOC, JSON.stringify(merged))
  }

  return (
    <div style={{ padding: '24px', color: '#0f172a' }}>
      <h2 style={{ marginBottom: '12px', color: '#0b2545' }}>横浜Fマリノス</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        {/* 在籍選手 */}
        <div style={cardStyle}>
          <h3 style={{ margin: 0, marginBottom: '8px', color: '#0b2545', fontSize: '15px' }}>在籍選手</h3>
          {players.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>アップロードされたPDFはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              {players.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragPlayerId(p.id)}
                  onDragEnd={() => setDragPlayerId(null)}
                  onMouseEnter={(e) => elevate(e.currentTarget, true)}
                  onMouseLeave={(e) => elevate(e.currentTarget, false)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'grab',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg,#f9e0c7,#f7d1b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5b3417',
                      fontSize: '24px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                    }}
                  >
                    {pickMood(p.id)}
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center', wordBreak: 'break-word' }}>
                    {p.name}
                  </a>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>ドラッグで移籍登録へ</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 移籍登録 */}
        <div style={cardStyle}>
          <h3 style={{ margin: 0, marginBottom: '8px', color: '#0b2545', fontSize: '15px' }}>移籍登録</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '6px' }}>
            <div style={{ fontWeight: 800, color: '#b91c1c' }}>退団キュー: {releaseQueue.length}件</div>
            <div style={{ fontWeight: 800, color: '#0b2545' }}>移籍登録キュー: {regFiles.length}件</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px', gap: '10px', marginBottom: '10px', alignItems: 'stretch' }}>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setReleaseDragActive(true)
              }}
            onDragLeave={() => setReleaseDragActive(false)}
              onDrop={async (e) => {
                e.preventDefault()
                setReleaseDragActive(false)
              if (dragPlayerId !== null) {
                setReleaseQueue((prev) => {
                  if (prev.some((p) => p.id === dragPlayerId)) return prev
                  const target = players.find((p) => p.id === dragPlayerId)
                  const next = target ? [...prev, target] : prev
                  if (next !== prev) persistReleaseQueue(next)
                  return next
                })
                setDragPlayerId(null)
                setReleaseMessage('退団用に追加しました。右のボタンで確定してください。')
                return
              }
              if (e.dataTransfer.files?.[0]) {
                const entries = await createEntriesFromFiles(e.dataTransfer.files, Date.now())
                setReleaseQueue((prev) => {
                  const next = [...prev, ...entries]
                  persistReleaseQueue(next)
                  return next
                })
                setReleaseMessage('ファイルを退団キューに追加しました。')
              }
              }}
              style={{
                border: releaseDragActive ? '2px solid #b91c1c' : '2px dashed #fca5a5',
                borderRadius: '10px',
                padding: '12px',
                background: releaseDragActive ? '#fee2e2' : '#fff5f5',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 700 }}>退団ドロップエリア</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>在籍選手・PDFをドロップするとここに保持</div>
              {releaseQueue.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>キュー: {releaseQueue.length}件</div>
              )}
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                onClick={confirmRelease}
                style={{
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#b91c1c',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '10px 12px',
                }}
              >
                退団を確定
              </button>
              <button
                onClick={() => {
                  persistReleaseQueue([])
                  setReleaseMessage('退団キューをリセットしました。')
                }}
                style={{
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#0f172a',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '10px 12px',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
          {releaseMessage && <div style={{ fontSize: '12px', color: releaseMessage.includes('確定') ? '#166534' : '#b91c1c', marginBottom: '8px' }}>{releaseMessage}</div>}
          {releaseQueue.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              {releaseQueue.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={(e) => elevate(e.currentTarget, true)}
                  onMouseLeave={(e) => elevate(e.currentTarget, false)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg,#f9e0c7,#f7d1b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5b3417',
                      fontSize: '24px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                    }}
                  >
                    {pickMood(p.id)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center', wordBreak: 'break-word' }}>{p.name}</div>
                </a>
              ))}
            </div>
          )}
          <div
          onDragOver={(e) => {
            e.preventDefault()
            setRegDragActive(true)
          }}
          onDragLeave={() => setRegDragActive(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setRegDragActive(false)
            if (dragPlayerId !== null) {
              movePlayerToReg(dragPlayerId)
              setDragPlayerId(null)
              return
            }
            if (e.dataTransfer.files?.length) {
              const entries = await createEntriesFromFiles(e.dataTransfer.files, Date.now())
              setRegFiles((prev) => {
                const next = [...prev, ...entries]
                localStorage.setItem(
                  STORAGE_KEY_REG,
                  JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
                )
                return next
              })
              setRegMessage('ドロップしたPDFを追加しました。')
            }
          }}
            style={{
              border: regDragActive ? '2px solid #1d4ed8' : '2px dashed #bfdbfe',
              borderRadius: '10px',
              padding: '12px',
              background: regDragActive ? '#e0e7ff' : '#f8fbff',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            <div style={{ fontSize: '13px', color: '#0b2545', fontWeight: 700 }}>移籍登録ドロップエリア</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>在籍から移動 or PDFを直接ドロップ</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '8px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              種別
              <select
                value={regType}
                onChange={(e) => {
                  setRegType(e.target.value)
                  setRegTeam('')
                  if (e.target.value && !affiliationOptions.includes(regAffiliation)) setRegAffiliation('')
                }}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="">選択してください</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              所属
              <select
                value={regAffiliation}
                onChange={(e) => {
                  setRegAffiliation(e.target.value)
                  setRegTeam('')
                }}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="">選択してください</option>
                {affiliationOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              チーム
              <select
                value={regTeam}
                onChange={(e) => {
                  const val = e.target.value
                  setRegTeam(val)
                  const meta = TEAM_META.find((t) => t.name === val)
                  if (meta) {
                    setRegType(meta.type)
                    setRegAffiliation(meta.pref)
                  }
                }}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="">選択してください</option>
                {teamOptions.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => {
                if (!regFiles.length) {
                  setRegMessage('PDFを移籍登録に追加してください')
                  return
                }
                if (!regType || !regAffiliation || !regTeam) {
                  setRegMessage('種別・所属・チームを選択してください')
                  return
                }
                const targetKey = pushToApprovalStorage(regTeam, regFiles)
                if (targetKey === STORAGE_KEY_APPROVAL) {
                  setApprovalFiles((prev) => {
                    const combined = [...prev]
                    regFiles.forEach((f) => {
                      if (!combined.some((x) => x.id === f.id)) combined.push(f)
                    })
                    return combined
                  })
                }
                // 協会承認待ちブロックにも反映
                setAssocFiles((prev) => {
                  const combined = [...prev]
                  regFiles.forEach((f) => {
                    if (!combined.some((x) => x.id === f.id)) combined.push(f)
                  })
                  localStorage.setItem(
                    STORAGE_KEY_ASSOC,
                    JSON.stringify(combined.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
                  )
                  return combined
                })
                // 都道府県協会ページ用ストレージへも登録
                pushToPrefectureAssociation(regFiles, regTeam)
                setRegFiles([])
                localStorage.setItem(STORAGE_KEY_REG, JSON.stringify([]))
                setRegMessage(`${regTeam} の承認待ちに送信しました。`)
              }}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                background: '#0b2545',
                color: '#f8fafc',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              移籍を確定
            </button>
            <button
              onClick={() => {
                if (!regFiles.length) return
                setPlayers((prev) => {
                  const next = [...prev, ...regFiles]
                  localStorage.setItem(
                    STORAGE_KEY_PLAYERS,
                    JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
                  )
                  return next
                })
                setRegFiles([])
                localStorage.setItem(STORAGE_KEY_REG, JSON.stringify([]))
                setRegMessage('移籍登録をキャンセルし、在籍に戻しました。')
              }}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
          {regMessage && <div style={{ fontSize: '13px', color: regMessage.includes('提出') ? '#16a34a' : '#b91c1c' }}>{regMessage}</div>}
          {regFiles.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>移籍登録のPDFはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              {regFiles.map((p) => (
                <div
                  key={p.id}
                  onMouseEnter={(e) => elevate(e.currentTarget, true)}
                  onMouseLeave={(e) => elevate(e.currentTarget, false)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg,#f9e0c7,#f7d1b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5b3417',
                      fontSize: '24px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                    }}
                  >
                    {pickMood(p.id, 1)}
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center', wordBreak: 'break-word' }}>
                    {p.name}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ margin: 0, marginBottom: '8px', color: '#0b2545', fontSize: '15px' }}>移籍承認</h3>
          {approvalFiles.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>移籍承認待ちのPDFはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {approvalFiles.map((p) => (
                <div
                  key={p.id}
                  onMouseEnter={(e) => elevate(e.currentTarget, true)}
                  onMouseLeave={(e) => elevate(e.currentTarget, false)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg,#f9e0c7,#f7d1b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5b3417',
                      fontSize: '24px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                    }}
                  >
                    {pickMood(p.id, 2)}
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center', wordBreak: 'break-word' }}>
                    {p.name}
                  </a>
                  <button
                    onClick={() => {
                      setApprovalFiles((prev) => {
                        const next = prev.filter((x) => x.id !== p.id)
                        localStorage.setItem(
                          STORAGE_KEY_APPROVAL,
                          JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
                        )
                        return next
                      })
                      setAssocFiles((prev) => {
                        if (prev.some((x) => x.id === p.id)) return prev
                        const next = [...prev, p]
                        localStorage.setItem(
                          STORAGE_KEY_ASSOC,
                          JSON.stringify(next.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })))
                        )
                        return next
                      })
                      pushToPrefectureAssociation([p], '横浜Fマリノス')
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#0b2545',
                      color: '#f8fafc',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    承認
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={cardStyle}>
          <h3 style={{ margin: 0, marginBottom: '8px', color: '#0b2545', fontSize: '15px' }}>協会承認待ち</h3>
          {assocFiles.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>協会承認待ちはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              {assocFiles.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={(e) => elevate(e.currentTarget, true)}
                  onMouseLeave={(e) => elevate(e.currentTarget, false)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg,#f9e0c7,#f7d1b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5b3417',
                      fontSize: '24px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                      transition: 'transform 150ms ease, box-shadow 150ms ease',
                    }}
                  >
                    {pickMood(p.id)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#1f2937', textAlign: 'center', wordBreak: 'break-word' }}>{p.name}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlayerManagementB
