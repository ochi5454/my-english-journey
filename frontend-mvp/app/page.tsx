'use client'

import { useState } from 'react'

const LEGEND = [
  { label: '80h超', desc: '長時間労働', bg: '#6b4f00', color: '#f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', bg: '#d0a754', color: '#1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', bg: '#e6a600', color: '#1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', bg: '#c7b202', color: '#0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', bg: '#1f8a55', color: '#fdfdfd' },
  { label: '15h〜20h', desc: '', bg: '#5f86c6', color: '#fdfdfd' },
]

const HEADER = [
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

const SAMPLE_ROW = [
  '291218',
  '上田　聖也',
  '承認済み',
  '9:55',
  '9:55',
  '0:00',
  'G3',
  '一般',
  'IT責任者',
  '',
  '',
  '',
  'AI・データマネジメントグループ',
  '',
  '',
]

const SHEET_NAMES = ['A部', 'B部', 'C部', 'D部', 'E部', 'F部', 'G部', 'H部']

export default function Home() {
  const [activeSheet, setActiveSheet] = useState(0)

  return (
    <div className="jfa-app">
      <nav className="jfa-nav">
        <div className="jfa-nav-top">
          <div className="jfa-brand">
            <span>AEON delight</span>
          </div>
        </div>
      </nav>

      <main className="jfa-shell">
        <div className="flex gap-2 flex-wrap mb-3">
          {SHEET_NAMES.map((name, idx) => (
            <button
              key={name}
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
              {name}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-2xl font-bold text-[var(--jfa-navy)]">実所定外時間 推計データ</div>
          <div className="text-sm text-slate-600">
            2025年12月度 （2025年12月15日現在） | {SHEET_NAMES[activeSheet]}
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

        <section className="sheet-card">
          <div className="sheet-table-wrapper">
            <div className="sheet-table">
              <div className="sheet-row sheet-header-band">
                <div className="sheet-cell sheet-title" style={{ width: HEADER.length * 110 }}>
                  2025年12月度 実所定外時間 推計データ（2025年12月15日現在）
                </div>
              </div>
              <div className="sheet-row sheet-header">
                {HEADER.map((title, idx) => (
                  <div
                    key={title}
                    className="sheet-cell"
                    style={{
                      width: idx === 3 ? 120 : idx >= 12 ? 140 : 110,
                      background: idx >= 12 ? '#f6d7b5' : idx === 3 ? '#fef9c3' : '#fdfbf6',
                      color: idx >= 6 ? '#c00000' : undefined,
                      fontWeight: idx >= 6 ? 700 : 600,
                    }}
                  >
                    {title}
                  </div>
                ))}
              </div>
              <div className="sheet-row">
                {SAMPLE_ROW.map((cell, idx) => (
                  <div
                    key={`${activeSheet}-${idx}`}
                    className="sheet-cell sheet-body"
                    style={{
                      width: idx === 3 ? 120 : idx >= 12 ? 140 : 110,
                      background: idx === 3 ? '#fef9c3' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: '12px' }}>{cell}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
