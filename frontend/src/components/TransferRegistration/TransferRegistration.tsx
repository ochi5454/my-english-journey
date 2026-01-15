import React, { useState } from 'react'

const cardStyle: React.CSSProperties = {
  border: '1px solid #d8c69c',
  borderRadius: '14px',
  background: '#fdfbf6',
  padding: '16px',
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
}

const TransferRegistration: React.FC = () => {
  const [pdfName, setPdfName] = useState<string>('未選択')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [type, setType] = useState<string>('') // 種別
  const [affiliation, setAffiliation] = useState<string>('') // 所属
  const [team, setTeam] = useState<string>('') // チーム名
  const [message, setMessage] = useState<string | null>(null)
  const [previews, setPreviews] = useState<{ name: string; url: string; type: string }[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const addPreview = (file: File) => {
    const url = URL.createObjectURL(file)
    setPreviews((prev) => [...prev, { name: file.name, url, type: file.type }])
  }

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }

  const revokePreviews = () => {
    previews.forEach((p) => URL.revokeObjectURL(p.url))
  }

  const handleSubmit = () => {
    if (!pdfFile) {
      setMessage('PDFを選択してください')
      return
    }
    if (!affiliation || !team) {
      setMessage('種別・所属・チーム名を選択してください')
      return
    }
    const url = URL.createObjectURL(pdfFile)
    const entry = {
      id: Date.now(),
      pdfName: pdfFile.name,
      pdfUrl: url,
      date: new Date().toISOString(),
      status: 'pending',
      affiliation,
      team,
    }
    const key = 'transfer-approval-list'
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]')
      localStorage.setItem(key, JSON.stringify([...existing, entry]))
    } catch {
      localStorage.setItem(key, JSON.stringify([entry]))
    }
    setMessage('提出しました。承認ページで確認できます。')
    setPdfFile(null)
    setPdfName('未選択')
    setAffiliation('')
    setTeam('')
    setType('')
    setPreviews([])
  }
  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setPdfName('未選択')
      setPdfFile(null)
      return
    }
    if (file.type !== 'application/pdf') {
      setMessage('PDFファイルのみアップロードできます')
      return
    }
    setPdfName(file.name)
    setPdfFile(file)
    setMessage(null)
    addPreview(file)
  }

  // cleanup URLs on unmount
  React.useEffect(() => {
    return () => revokePreviews()
  }, [previews])

  return (
    <div style={{ padding: '24px', width: '100%', maxWidth: '900px', margin: '0 auto', color: '#0f172a' }}>
      <h2 style={{ marginBottom: '12px', color: '#0b2545' }}>移籍登録</h2>

      <section style={cardStyle}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 700, color: '#0b2545' }}>PDFアップロード</label>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                const file = e.dataTransfer.files?.[0]
                handleFileSelect(file || null)
              }}
              style={{
                border: dragActive ? '2px solid #0b2545' : '2px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '16px',
                background: dragActive ? '#e0e7ff' : '#fff',
                textAlign: 'center',
                cursor: 'pointer',
              }}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.pdf'
                input.onchange = (ev: any) => {
                  const file = ev.target.files?.[0]
                  handleFileSelect(file || null)
                }
                input.click()
              }}
            >
              <div style={{ fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>ここにPDFをドラッグ&ドロップ</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>またはクリックして選択</div>
              <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '8px' }}>選択中: {pdfName}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              種別
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                <option value="">選択してください</option>
                <option value="4種">4種</option>
                <option value="3種">3種</option>
                <option value="2種">2種</option>
                <option value="1種">1種</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              所属
              <select value={affiliation} onChange={(e) => setAffiliation(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                <option value="">選択してください</option>
                <option value="東京都">東京都</option>
                <option value="神奈川県">神奈川県</option>
                <option value="千葉県">千葉県</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#0b2545', fontWeight: 600 }}>
              チーム名
              <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                <option value="">選択してください</option>
                <option value="PROTHENTIAFC">PROTHENTIAFC</option>
                <option value="横浜Fマリノス">横浜Fマリノス</option>
                <option value="川崎フロンターレ">川崎フロンターレ</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSubmit}
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
          {message && <div style={{ fontSize: '13px', color: '#16a34a' }}>{message}</div>}
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: '16px' }}>
        <h3 style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 700, color: '#0b2545' }}>在籍選手</h3>
        {previews.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280' }}>在籍選手のリストはまだありません。PDFをアップロードするとここに表示されます。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {previews.map((p, idx) => (
              <div
                key={p.url}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '10px',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  alignItems: 'center',
                }}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === idx) return
                  setPreviews((prev) => {
                    const next = [...prev]
                    const [moved] = next.splice(dragIndex, 1)
                    next.splice(idx, 0, moved)
                    return next
                  })
                  setDragIndex(null)
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: '#0b2545',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f8fafc',
                    fontWeight: 800,
                    fontSize: '16px',
                  }}
                >
                  PDF
                </div>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center' }}>
                  {p.name}
                </a>
                <button
                  onClick={() => removePreview(idx)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #dc2626',
                    background: '#fff',
                    color: '#dc2626',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default TransferRegistration
