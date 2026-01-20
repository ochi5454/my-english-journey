'use client'

import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { api } from '../../api/client'

type Task = {
  id: number
  title: string
  status: string
  due_date?: string
  assignee?: string
}

type Document = {
  id: number
  doc_type: string
  content: string
}

type Alert = { id: number; message: string }

type Tournament = {
  id: number
  name: string
  category: string
  scale: string
  start_date: string
  end_date: string
  tasks: Task[]
  documents: Document[]
  alerts: Alert[]
}

const fetcher = (url: string) => api.get(url).then((r) => r.data)

export default function TournamentDetail() {
  const params = useParams<{ id: string }>()
  const { data, mutate } = useSWR<Tournament>(`/tournaments/${params.id}`, fetcher)

  const generateTasks = async () => {
    await api.post(`/tournaments/${params.id}/generate/tasks`)
    mutate()
  }

  const generateDoc = async (type: string) => {
    await api.post(`/tournaments/${params.id}/generate/doc/${type}`)
    mutate()
  }

  const updateTaskStatus = async (taskId: number, status: string) => {
    await api.patch(`/tasks/${taskId}`, { status })
    mutate()
  }

  const formatDoc = (doc: Document) => {
    try {
      const parsed = JSON.parse(doc.content)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return doc.content
    }
  }

  const renderDoc = (doc: Document) => {
    if (doc.doc_type === 'timeline') {
      try {
        const parsed = JSON.parse(doc.content)
        const timeline = parsed.timeline as { time: string; action: string }[]
        return (
          <div className="space-y-1">
            {timeline?.map((t, idx) => (
              <div key={idx} className="flex gap-2 text-xs">
                <span className="font-semibold w-14">{t.time}</span>
                <span>{t.action}</span>
              </div>
            ))}
          </div>
        )
      } catch {
        return <pre className="whitespace-pre-wrap text-xs mt-1">{doc.content}</pre>
      }
    }
    return <pre className="whitespace-pre-wrap text-xs mt-1">{formatDoc(doc)}</pre>
  }

  if (!data) return <div>Loading...</div>

  return (
    <div className="jfa-app">
      <nav className="jfa-nav">
        <div className="jfa-nav-top">
          <div className="jfa-brand">
            <span>AEON delight</span>
          </div>
        </div>
        <div className="jfa-nav-bottom">
          <div className="jfa-nav-links">
            <button className="jfa-nav-button" type="button">
              トーナメントダッシュボード
            </button>
          </div>
        </div>
      </nav>

      <main className="jfa-shell">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500">大会詳細</div>
          <div className="text-3xl font-extrabold text-[var(--jfa-navy)]">{data.name}</div>
          <div className="text-sm text-slate-600">
            {data.category} / {data.scale} / {data.start_date} - {data.end_date}
          </div>
        </div>

        <div className="jfa-section">
          <div className="jfa-section-title">
            <span>AIアクション</span>
            <div className="jfa-chip-row">
              <span className="jfa-pill">ToDo</span>
              <span className="jfa-pill">進行表</span>
              <span className="jfa-pill">メール生成</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="jfa-button" onClick={generateTasks}>
              ToDo自動生成
            </button>
            <button className="jfa-button jfa-button-outline" onClick={() => generateDoc('timeline')}>
              進行表生成
            </button>
            <button className="jfa-button jfa-button-dark" onClick={() => generateDoc('email_venue')}>
              会場手配メール生成
            </button>
            <button className="jfa-button jfa-button-dark" onClick={() => generateDoc('email_referee')}>
              審判手配メール生成
            </button>
          </div>
        </div>

        {data.alerts.length > 0 && (
          <div className="jfa-section" style={{ borderColor: 'rgba(245, 158, 11, 0.35)', background: '#fffbf3' }}>
            <div className="jfa-section-title">
              <span>遅延アラート</span>
              <span className="jfa-pill" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.12)' }}>
                要確認
              </span>
            </div>
            <ul className="list-disc ml-5 text-sm text-amber-800">
              {data.alerts.map((a) => (
                <li key={a.id}>{a.message}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="jfa-section">
          <div className="jfa-section-title">
            <span>ToDo</span>
            <span className="text-xs text-slate-500">ステータスを更新できます</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {data.tasks.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded-lg p-3 bg-[#fdfbf6]">
                <div className="font-semibold">{t.title}</div>
                <div className="text-xs text-slate-600">期限: {t.due_date || '未設定'}</div>
                <div className="text-xs text-slate-600 mb-2">担当: {t.assignee || '未設定'}</div>
                <select
                  className="border rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--jfa-gold)]"
                  value={t.status}
                  onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                >
                  <option value="todo">未着手</option>
                  <option value="in_progress">進行中</option>
                  <option value="done">完了</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="jfa-section">
          <div className="jfa-section-title">
            <span>生成結果</span>
            <span className="text-xs text-slate-500">進行表・メールはここに表示</span>
          </div>
          <div className="space-y-2 text-sm">
            {data.documents.map((d) => (
              <details key={d.id} className="border border-slate-200 rounded p-3 bg-[#fdfbf6]">
                <summary className="cursor-pointer font-semibold">{d.doc_type}</summary>
                {renderDoc(d)}
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
