import React, { useEffect, useMemo, useRef, useState } from 'react'

type Task = {
  name: string
  owner: string
  plannedStart: string
  plannedEnd: string
  actualStart: string
  actualEnd: string
}

type Phase = {
  label: string
  start: string
  end: string
  color: string
}

const TIMELINE_START = '2025-12-01'
const TIMELINE_END = '2026-03-31'

const tasks: Task[] = []

const phases: Phase[] = [
  { label: '試作フェーズ', start: '2025-12-05', end: '2025-12-15', color: '#f7e2be' },
  { label: '量産フェーズ', start: '2026-01-10', end: '2026-02-05', color: '#d7e7ff' },
  { label: '展示会', start: '2026-03-15', end: '2026-03-20', color: '#f5d5b8' },
]

const parseISODate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d.getTime()) ? null : d
}

const isWeekend = (iso: string) => {
  const d = parseISODate(iso)
  if (!d) return false
  const day = d.getDay()
  return day === 0 || day === 6
}

const ProjectManagement: React.FC = () => {
  const [taskList, setTaskList] = useState<Task[]>(() => {
    try {
      const raw = localStorage.getItem('pm_tasks')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Task>[]
        return parsed.map((t) => ({
          name: t.name || '',
          owner: t.owner || '',
          plannedStart: t.plannedStart || TIMELINE_START,
          plannedEnd: t.plannedEnd || TIMELINE_START,
          actualStart: t.actualStart || TIMELINE_START,
          actualEnd: t.actualEnd || TIMELINE_START,
        }))
      }
    } catch {
      /* ignore parse errors */
    }
    return tasks
  })
  const [newTask, setNewTask] = useState<{
    name: string
    owner: string
    plannedStart: string
    plannedEnd: string
    actualStart: string
    actualEnd: string
  }>({
    name: '',
    owner: '',
    plannedStart: '',
    plannedEnd: '',
    actualStart: '',
    actualEnd: '',
  })
  const [deleteName, setDeleteName] = useState<string>('')
  const headerGridRef = useRef<HTMLDivElement | null>(null)
  const hasTasks = taskList.length > 0

  const timeline = useMemo(() => {
    const start = parseISODate(TIMELINE_START)!
    const end = parseISODate(TIMELINE_END)!
    return { start, end }
  }, [])

  const days = useMemo(() => {
    const result: { label: string; iso: string }[] = []
    const cur = new Date(timeline.start)
    while (cur <= timeline.end) {
      const iso = cur.toISOString().slice(0, 10)
      result.push({ label: `${cur.getMonth() + 1}/${cur.getDate()}`, iso })
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [timeline])

  const dayCount = days.length

  const dayIndex = (iso: string) => {
    const target = parseISODate(iso) || timeline.start
    return Math.max(
      0,
      Math.min(dayCount - 1, Math.floor((target.getTime() - timeline.start.getTime()) / (1000 * 60 * 60 * 24)))
    )
  }

  useEffect(() => {
    const measure = () => {
      if (!headerGridRef.current) return
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [dayCount])

  const addTask = () => {
    if (!newTask.name || !newTask.owner) return
    const startIso = newTask.plannedStart || TIMELINE_START
    const endIso = newTask.plannedEnd || startIso
    const actualStartIso = newTask.actualStart || startIso
    const actualEndIso = newTask.actualEnd || endIso
    const startDate = parseISODate(startIso)
    const endDate = parseISODate(endIso)
    const actualStartDate = parseISODate(actualStartIso)
    const actualEndDate = parseISODate(actualEndIso)
    const normalized =
      startDate && endDate && startDate > endDate
        ? { start: endIso, end: startIso }
        : { start: startIso, end: endIso }
    const normalizedActual =
      actualStartDate && actualEndDate && actualStartDate > actualEndDate
        ? { start: actualEndIso, end: actualStartIso }
        : { start: actualStartIso, end: actualEndIso }
    const added: Task = {
      name: newTask.name,
      owner: newTask.owner,
      plannedStart: normalized.start,
      plannedEnd: normalized.end,
      actualStart: normalizedActual.start,
      actualEnd: normalizedActual.end,
    }
    setTaskList((prev) => [...prev, added])
    setNewTask({
      name: '',
      owner: '',
      plannedStart: '',
      plannedEnd: '',
      actualStart: '',
      actualEnd: '',
    })
  }

  const updateTaskField = (index: number, field: 'name' | 'owner', value: string) => {
    setTaskList((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  const deleteTaskByName = () => {
    const target = deleteName.trim()
    if (!target) return
    setTaskList((prev) => prev.filter((t) => t.name !== target))
    setDeleteName('')
  }

  // 永続化: taskList を localStorage に保存
  useEffect(() => {
    try {
      localStorage.setItem('pm_tasks', JSON.stringify(taskList))
    } catch {
      /* ignore write errors */
    }
  }, [taskList])

  return (
    <div style={{ padding: '24px', width: '100%', maxWidth: '100%', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '12px' }}>試合運営</h2>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          background: '#fff',
          boxShadow: '0 4px 10px rgba(0,0,0,0.04)',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>タスクの追加・削除・完了</h3>

        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 1fr', alignItems: 'center' }}>
          <input
            value={newTask.name}
            onChange={(e) => setNewTask((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="タスク名を入力"
            style={inputStyle}
          />
          <input
            value={newTask.owner}
            onChange={(e) => setNewTask((prev) => ({ ...prev, owner: e.target.value }))}
            placeholder="担当者を入力"
            style={inputStyle}
          />
          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <input
              type="date"
              value={newTask.plannedStart}
              onChange={(e) => setNewTask((prev) => ({ ...prev, plannedStart: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="date"
              value={newTask.plannedEnd}
              onChange={(e) => setNewTask((prev) => ({ ...prev, plannedEnd: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="date"
              value={newTask.actualStart}
              onChange={(e) => setNewTask((prev) => ({ ...prev, actualStart: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="date"
              value={newTask.actualEnd}
              onChange={(e) => setNewTask((prev) => ({ ...prev, actualEnd: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <button
            onClick={addTask}
            style={{
              padding: '12px 16px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              height: '100%',
              minHeight: '38px',
            }}
          >
            追加
          </button>
        </div>

        <div style={{ marginTop: '12px', display: 'grid', gap: '8px', gridTemplateColumns: '1fr auto' }}>
          <input
            value={deleteName}
            onChange={(e) => setDeleteName(e.target.value)}
            placeholder="削除したいタスク名を入力"
            style={inputStyle}
          />
          <button
            onClick={deleteTaskByName}
            style={{
              padding: '8px 14px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            削除
          </button>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          background: '#f8fafc',
          boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            background: '#fff',
            fontSize: '15px',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          ガントチャート
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'white',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#4b5563' }}>
            <span>{TIMELINE_START} 〜 {TIMELINE_END}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '14px', height: '8px', background: '#cddffb', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.05)' }} />
              <span style={{ fontSize: '12px', color: '#475569' }}>予定</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '14px', height: '8px', background: '#fcd6a8', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.05)' }} />
              <span style={{ fontSize: '12px', color: '#475569' }}>実績</span>
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `320px 140px 1fr`,
            alignItems: 'stretch',
            minHeight: hasTasks ? '420px' : '0px',
            columnGap: '16px',
          }}
            >
              <div style={{ borderRight: '1px solid #e5e7eb', background: 'white' }}>
                <div style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>タスク</div>
                {taskList.map((task, idx) => (
                  <div
                key={task.name}
                style={{
                  padding: '10px 12px',
                  height: '40px',
                  borderBottom: idx === taskList.length - 1 ? 'none' : '1px solid #f1f5f9',
                  background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                  fontSize: '13px',
                  color: '#0f172a',
                  paddingLeft: '12px',
                  display: 'flex',
                  alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      value={task.name}
                      onChange={(e) => updateTaskField(idx, 'name', e.target.value)}
                      style={{
                        width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: '#0f172a',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#fff',
                    outline: 'none',
                  }}
                  placeholder="タスク名を入力"
                />
              </div>
            ))}
          </div>

          <div style={{ borderRight: '1px solid #e5e7eb', background: 'white' }}>
            <div style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>担当者</div>
            {taskList.map((task, idx) => (
              <div
                key={task.name}
                style={{
                  padding: '10px 12px',
                  height: '40px',
                  borderBottom: idx === taskList.length - 1 ? 'none' : '1px solid #f1f5f9',
                  background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                  fontSize: '13px',
                  color: '#4b5563',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <input
                  value={task.owner}
                  onChange={(e) => updateTaskField(idx, 'owner', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: '#4b5563',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#fff',
                    outline: 'none',
                  }}
                  placeholder="担当者を入力"
                />
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto', background: 'white', paddingLeft: '0' }}>
            <div
              ref={headerGridRef}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${dayCount}, minmax(36px, 1fr))`,
                borderBottom: '1px solid #e5e7eb',
                background: '#ffffff',
                position: 'sticky',
                top: 0,
                zIndex: 1,
                height: '40px',
              }}
            >
              {days.map((d, idx) => (
                <div
                  key={d.iso}
                  style={{
                    padding: '0 4px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: '#475569',
                    borderLeft: idx === 0 ? 'none' : '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '40px',
                    background: isWeekend(d.iso) ? '#f5f6f8' : '#ffffff',
                  }}
                >
                  {d.label}
                </div>
              ))}
              </div>

              <div>
                {taskList.map((task, rowIdx) => {
                  const pStartIdx = dayIndex(task.plannedStart)
                  const pEndIdx = dayIndex(task.plannedEnd)
                  const aStartIdx = dayIndex(task.actualStart)
                  const aEndIdx = dayIndex(task.actualEnd)
                  return (
                    <div
                      key={`${task.name}-${rowIdx}`}
                      style={{
                        position: 'relative',
                        height: '44px',
                        borderBottom: rowIdx === taskList.length - 1 ? 'none' : '1px solid #f1f5f9',
                        background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${dayCount}, minmax(36px, 1fr))`,
                        }}
                      >
                        {days.map((d, idx) => (
                          <div
                            key={`${task.name}-${d.iso}`}
                            style={{
                              background: isWeekend(d.iso) ? '#f5f6f8' : '#ffffff',
                              borderLeft: idx === 0 ? 'none' : '1px solid #f5f5f5',
                            }}
                          />
                        ))}
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: `calc(${(pStartIdx / dayCount) * 100}%)`,
                          width: `calc(${((pEndIdx - pStartIdx + 1) / dayCount) * 100}%)`,
                          height: '10px',
                          background: '#cddffb',
                          borderRadius: '6px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                          border: '1px solid rgba(0,0,0,0.05)',
                          overflow: 'hidden',
                        }}
                        title={`予定 ${task.plannedStart} 〜 ${task.plannedEnd}`}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '22px',
                          left: `calc(${(aStartIdx / dayCount) * 100}%)`,
                          width: `calc(${((aEndIdx - aStartIdx + 1) / dayCount) * 100}%)`,
                          height: '12px',
                          background: '#fcd6a8',
                          borderRadius: '6px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                          border: '1px solid rgba(0,0,0,0.05)',
                          overflow: 'hidden',
                        }}
                        title={`実績 ${task.actualStart} 〜 ${task.actualEnd}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
      </div>
    </div>
  )
}

export default ProjectManagement

const navButton: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '12px',
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: '6px',
  cursor: 'pointer',
}

const ghostButton: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '12px',
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: '6px',
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '13px',
  color: '#111827',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#fff',
  outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
}

const inputStyleCompact: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: '12px',
}
