import React, { useEffect, useMemo, useState } from 'react'

type Entry = { id: number; name: string; url: string; dataUrl: string; team?: string }

const STORAGE_KEY_PREF_ASSOC = 'prefecture-association'
const STORAGE_KEY_PLAYERS_A = 'player-management-a-players'
const STORAGE_KEY_PLAYERS_B = 'player-management-b-players'
const STORAGE_KEY_ASSOC_A = 'player-management-a-assoc'
const STORAGE_KEY_ASSOC_B = 'player-management-b-assoc'
const MOOD_FACES = ['😀', '🙂', '😊', '😌', '😎', '😐', '😕', '🙁', '😴', '🤒', '🤕']
const pickMood = (seed: number | undefined, offset = 0) => {
  const n = Number(seed)
  if (!Number.isFinite(n)) return '🙂'
  const idx = Math.abs(Math.floor(n + offset)) % MOOD_FACES.length
  return MOOD_FACES[idx] || '🙂'
}
const elevate = (el: HTMLElement, hovering: boolean) => {
  el.style.transform = hovering ? 'translateY(-3px)' : 'translateY(0)'
  el.style.boxShadow = hovering ? '0 10px 22px rgba(0,0,0,0.14)' : '0 4px 10px rgba(0,0,0,0.12)'
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #d8c69c',
  borderRadius: '12px',
  background: '#fdfbf6',
  padding: '16px',
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
}

const PrefectureAssociation: React.FC = () => {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    const restore = async () => {
      const raw = localStorage.getItem(STORAGE_KEY_PREF_ASSOC)
      const clearedFlag = localStorage.getItem('prefecture-assoc-cleared-once')
      if (raw && !clearedFlag) {
        // 一度だけ既存の承認待ちをクリアする
        localStorage.setItem(STORAGE_KEY_PREF_ASSOC, JSON.stringify([]))
        localStorage.setItem('prefecture-assoc-cleared-once', 'yes')
        setEntries([])
        return
      }
      if (!raw) return
      const saved = JSON.parse(raw) as { id: number; name: string; dataUrl: string; team?: string }[]
      const list = await Promise.all(
        saved.map(async (s) => {
          const blob = await fetch(s.dataUrl).then((r) => r.blob())
          const url = URL.createObjectURL(blob)
          return { id: s.id, name: s.name, url, dataUrl: s.dataUrl, team: s.team }
        })
      )
      setEntries(list)
    }
    restore().catch(() => {})

    return () => {
      entries.forEach((e) => URL.revokeObjectURL(e.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addBackToPlayers = (team: string, entry: Entry) => {
    const targetKey = team === '横浜Fマリノス' ? STORAGE_KEY_PLAYERS_B : STORAGE_KEY_PLAYERS_A
    const raw = localStorage.getItem(targetKey)
    const saved = raw ? (JSON.parse(raw) as { id: number; name: string; dataUrl: string }[]) : []
    if (!saved.some((s) => s.id === entry.id)) {
      const next = [...saved, { id: entry.id, name: entry.name, dataUrl: entry.dataUrl }]
      localStorage.setItem(targetKey, JSON.stringify(next))
    }
  }

  const removeFromTeamAssoc = (team: string, entryId: number) => {
    const targetKey = team === '横浜Fマリノス' ? STORAGE_KEY_ASSOC_B : STORAGE_KEY_ASSOC_A
    const raw = localStorage.getItem(targetKey)
    const saved = raw ? (JSON.parse(raw) as { id: number; name: string; dataUrl: string }[]) : []
    const filtered = saved.filter((s) => s.id !== entryId)
    localStorage.setItem(targetKey, JSON.stringify(filtered))
  }

  const handleApprove = (entry: Entry) => {
    const team = entry.team || 'PROTHENTIAFC'
    addBackToPlayers(team, entry)
    removeFromTeamAssoc(team, entry.id)
    const filtered = entries.filter((e) => e.id !== entry.id)
    setEntries(filtered)
    localStorage.setItem(
      STORAGE_KEY_PREF_ASSOC,
      JSON.stringify(filtered.map(({ id, name, dataUrl, team: t }) => ({ id, name, dataUrl, team: t })))
    )
  }

  return (
    <div style={{ padding: '24px', color: '#0f172a' }}>
      <h2 style={{ marginBottom: '12px', color: '#0b2545' }}>都道府県協会</h2>
      <div style={cardStyle}>
        <h3 style={{ margin: 0, marginBottom: '8px', color: '#0b2545', fontSize: '15px' }}>承認依頼</h3>
        {entries.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>承認依頼はまだありません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            {entries.map((p) => (
              <div
                key={p.id}
                onMouseEnter={(e) => elevate(e.currentTarget, true)}
                onMouseLeave={(e) => elevate(e.currentTarget, false)}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '10px',
                  background: '#fff',
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
                <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center', wordBreak: 'break-word' }}>
                  {p.name}
                </a>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>{p.team || 'PROTHENTIAFC'}</div>
                <button
                  onClick={() => handleApprove(p)}
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
    </div>
  )
}

export default PrefectureAssociation
