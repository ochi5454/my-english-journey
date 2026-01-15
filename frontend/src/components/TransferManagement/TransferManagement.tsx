import React, { useEffect, useMemo, useState } from 'react'

type PlayerEntry = { id: number; name: string; url: string; dataUrl: string; team?: string }

const STORAGE_KEY_PLAYERS = 'player-management-b-players'
const STORAGE_KEY_REG = 'player-management-b-reg'
const STORAGE_KEY_APPROVAL = 'player-management-b-approval'
const STORAGE_KEY_ASSOC = 'player-management-b-assoc'
const STORAGE_KEY_PREF_ASSOC = 'prefecture-association'
const APPROVAL_KEY_MAP: Record<string, string> = {
  PROTHENTIAFC: 'player-management-a-approval',
  '横浜Fマリノス': 'player-management-b-approval',
}

const TEAM_META = [
  { name: 'PROTHENTIAFC', type: '1種', pref: '東京都' },
  { name: '横浜Fマリノス', type: '1種', pref: '神奈川県' },
]
const MOOD_FACES = ['😀', '🙂', '😊', '😌', '😎', '😐', '😕', '🙁', '😴', '🤒', '🤕']
const pickMood = (seed: number | undefined, offset = 0) => {
  const n = Number(seed)
  if (!Number.isFinite(n)) return '🙂'
  const idx = Math.abs(Math.floor(n + offset)) % MOOD_FACES.length
  return MOOD_FACES[idx] || '🙂'
}
const statusOptions = ['ー', '在籍中', '移籍先承認待ち', '差し戻し', '協会承認待ち']

const TransferManagement: React.FC = () => {
  const [players, setPlayers] = useState<PlayerEntry[]>([])
  const [statusMap, setStatusMap] = useState<Record<number, string>>({})
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
    setReleaseQueue([])
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

  useEffect(() => {
    const restore = async (key: string) => {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const saved = JSON.parse(raw) as { id: number; name: string; dataUrl: string }[]
      const list = await Promise.all(
        saved.map(async (s) => {
          const blob = await fetch(s.dataUrl).then((r) => r.blob())
          const url = URL.createObjectURL(blob)
          return { id: s.id, name: s.name, url, dataUrl: s.dataUrl }
        })
      )
      return list
    }
    restore(STORAGE_KEY_PLAYERS).then(setPlayers).catch(() => {})
    restore(STORAGE_KEY_REG).then(setRegFiles).catch(() => {})
    restore(STORAGE_KEY_APPROVAL).then(setApprovalFiles).catch(() => {})
    restore(STORAGE_KEY_ASSOC).then(setAssocFiles).catch(() => {})
    const cleared = localStorage.getItem('assoc-cleared-b')
    if (!cleared) {
      localStorage.setItem(STORAGE_KEY_ASSOC, JSON.stringify([]))
      setAssocFiles([])
      localStorage.setItem('assoc-cleared-b', 'yes')
    }
  }, [])

  useEffect(() => {
    // players が変わったとき、ステータス未設定のものを在籍中に初期化
    setStatusMap((prev) => {
      const next = { ...prev }
      players.forEach((p) => {
        if (!next[p.id]) next[p.id] = '在籍中'
      })
      return next
    })
  }, [players])

  useEffect(() => {
    return () => {
      players.forEach((p) => URL.revokeObjectURL(p.url))
      regFiles.forEach((p) => URL.revokeObjectURL(p.url))
      approvalFiles.forEach((p) => URL.revokeObjectURL(p.url))
      assocFiles.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [players, regFiles, approvalFiles, assocFiles])

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
    <div style={{ padding: '16px', color: '#0f172a', background: '#f8f7f3' }}>
      <h2 style={{ marginBottom: '12px', color: '#0b2545' }}>在籍選手（横浜Fマリノスロジック統合）</h2>

      <div
        style={{
          border: '1px solid #e0e7ff',
          borderRadius: '14px',
          background: '#fff',
          padding: '12px 16px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontWeight: 700, color: '#0b2545' }}>アイコン</div>
          <div style={{ fontWeight: 700, color: '#0b2545' }}>ステータス</div>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
          {players.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragPlayerId(p.id)}
              onDragEnd={() => setDragPlayerId(null)}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.3fr 1.2fr',
                gap: '10px',
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                cursor: 'grab',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '14px',
                    background: '#f7e1b5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0b2545',
                    fontWeight: 800,
                    fontSize: '22px',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                  }}
                >
                  {pickMood(p.id)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#475569', fontSize: '13px' }}>
                <select
                  value={statusMap[p.id] || '在籍中'}
                  onChange={(e) => {
                    const val = e.target.value
                    setStatusMap((prev) => ({ ...prev, [p.id]: val }))
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontWeight: 700,
                    minWidth: '120px',
                  }}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* 退団ドロップ＋確定/キャンセル */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px', gap: '10px', marginBottom: '10px', alignItems: 'stretch' }}>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setReleaseDragActive(true)
            }}
            onDragLeave={() => setReleaseDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setReleaseDragActive(false)
              if (dragPlayerId !== null) {
                setReleaseQueue((prev) => {
                  if (prev.some((x) => x.id === dragPlayerId)) return prev
                  const target = players.find((x) => x.id === dragPlayerId)
                  return target ? [...prev, target] : prev
                })
                setDragPlayerId(null)
                setReleaseMessage('退団用に追加しました。右のボタンで確定してください。')
                return
              }
              if (e.dataTransfer.files?.[0]) {
                setReleaseMessage('在籍一覧からドラッグしてください。')
              }
            }}
            style={{
              border: releaseDragActive ? '2px solid #b91c1c' : '2px dashed #cbd5e1',
              borderRadius: '10px',
              padding: '12px',
              background: releaseDragActive ? '#fee2e2' : '#fff',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 700 }}>退団用ドロップエリア</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>在籍選手からドラッグして退団キューへ</div>
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
                setReleaseQueue([])
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

        {/* 移籍登録 */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setRegDragActive(true)
          }}
          onDragLeave={() => setRegDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setRegDragActive(false)
            if (dragPlayerId !== null) {
              movePlayerToReg(dragPlayerId)
              setDragPlayerId(null)
              return
            }
          }}
          style={{
            border: regDragActive ? '2px solid #0b2545' : '2px dashed #cbd5e1',
            borderRadius: '10px',
            padding: '12px',
            background: regDragActive ? '#e0e7ff' : '#fff',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: '10px',
          }}
        >
          <div style={{ fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>ここにPDFをドラッグ&ドロップ</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>在籍選手からドラッグして移籍登録へ</div>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
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
            提出
          </button>
        </div>
        {regMessage && <div style={{ fontSize: '13px', color: regMessage.includes('提出') ? '#16a34a' : '#b91c1c' }}>{regMessage}</div>}
        {regFiles.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>移籍登録のPDFはまだありません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {regFiles.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
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
                <div style={{ fontSize: '12px', color: '#1f2937', textAlign: 'center', wordBreak: 'break-word' }}>{p.name}</div>
              </a>
            ))}
          </div>
        )}

        {/* 移籍承認 */}
        <div style={{ marginTop: '12px' }}>
          <h4 style={{ margin: '0 0 6px', color: '#0b2545' }}>移籍承認</h4>
          {approvalFiles.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>移籍承認待ちのPDFはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {approvalFiles.map((p) => (
                <div
                  key={p.id}
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

        {/* 協会承認待ち */}
        <div style={{ marginTop: '12px' }}>
          <h4 style={{ margin: '0 0 6px', color: '#0b2545' }}>協会承認待ち</h4>
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

export default TransferManagement
