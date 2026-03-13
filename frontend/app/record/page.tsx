'use client'

import { useState } from 'react'
import { api } from '../lib/api'

const CATEGORIES: Record<string, string[]> = {
  '基礎': ['発音', '単語', '文法'],
  '運用': ['スピーキング', 'リスニング', 'リーディング', 'ライティング'],
}

type ChatResult = {
  category?: string
  subcategory?: string
  minutes?: number
  date?: string | null
  note?: string
  needs_clarification?: boolean
  question?: string
}

type ConfirmData = {
  date: string
  category: string
  subcategory: string
  minutes: number
  note: string
}

export default function RecordPage() {
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [confirm, setConfirm] = useState<ConfirmData | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<ConfirmData>({
    date: '', category: '基礎', subcategory: '発音', minutes: 0, note: '',
  })
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualCategory, setManualCategory] = useState('基礎')
  const [manualSubcategory, setManualSubcategory] = useState('発音')
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const [manualNote, setManualNote] = useState('')
  const [manualMessage, setManualMessage] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const sendChat = async () => {
    if (!chatInput.trim()) return
    setChatLoading(true)
    setChatMessage('')
    setConfirm(null)
    setEditing(false)
    setSuccessMsg('')
    try {
      const result = await api<ChatResult>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: chatInput }),
      })
      if (result.needs_clarification) {
        setChatMessage(result.question || '詳しく教えてください')
      } else {
        const data: ConfirmData = {
          date: result.date || today,
          category: result.category || '基礎',
          subcategory: result.subcategory || '発音',
          minutes: result.minutes || 0,
          note: result.note || chatInput,
        }
        setConfirm(data)
        setEditData({ ...data })
      }
    } catch (e: unknown) {
      setChatMessage(e instanceof Error ? `エラー: ${e.message}` : 'エラーが発生しました')
    }
    setChatLoading(false)
  }

  const saveConfirm = async (data: ConfirmData) => {
    setSaving(true)
    try {
      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          date: data.date, category: data.category, subcategory: data.subcategory,
          minutes: data.minutes, note: data.note || null,
        }),
      })
      setConfirm(null)
      setEditing(false)
      setChatInput('')
      setSuccessMsg('記録しました!')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (e: unknown) {
      setChatMessage(e instanceof Error ? `保存エラー: ${e.message}` : '保存エラー')
    }
    setSaving(false)
  }

  const saveManual = async () => {
    const mins = parseInt(manualMinutes)
    if (!mins || mins <= 0) { setManualMessage('学習時間を入力してください'); return }
    setManualSaving(true)
    setManualMessage('')
    try {
      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          date: manualDate, category: manualCategory, subcategory: manualSubcategory,
          minutes: mins, note: manualNote || null,
        }),
      })
      setManualMessage('記録しました!')
      setManualMinutes('')
      setManualNote('')
      setTimeout(() => setManualMessage(''), 2000)
    } catch (e: unknown) {
      setManualMessage(e instanceof Error ? `エラー: ${e.message}` : 'エラーが発生しました')
    }
    setManualSaving(false)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-[#c9a84c] mb-4">学習記録</h1>

      {successMsg && (
        <div className="bg-green-900/30 text-green-300 rounded-lg p-3 mb-4 text-sm">{successMsg}</div>
      )}

      {/* チャット入力 */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
        <p className="text-sm text-gray-400 mb-2">チャットで記録</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            placeholder="例: リスニング1時間、英単語30分"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[#c9a84c]"
          />
          <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
            className="bg-[#c9a84c] text-gray-900 font-bold px-4 py-2 rounded-lg disabled:opacity-50">
            {chatLoading ? '...' : '送信'}
          </button>
        </div>

        {chatMessage && (
          <div className="mt-3 bg-gray-800 rounded-lg p-3 text-sm">{chatMessage}</div>
        )}

        {/* 確認カード */}
        {confirm && !editing && (
          <div className="mt-3 bg-gray-800 rounded-lg p-4 border border-[#c9a84c]/30">
            <p className="text-sm text-gray-400 mb-2">以下の内容で記録しますか？</p>
            <div className="space-y-1 text-sm mb-3">
              <div className="flex justify-between"><span className="text-gray-400">日付</span><span>{confirm.date}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">カテゴリ</span><span>{confirm.category} / {confirm.subcategory}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">時間</span><span>{confirm.minutes}分</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveConfirm(confirm)} disabled={saving}
                className="flex-1 bg-[#c9a84c] text-gray-900 font-bold py-2 rounded-lg disabled:opacity-50">
                {saving ? '保存中...' : '記録する'}
              </button>
              <button onClick={() => setEditing(true)}
                className="flex-1 bg-gray-700 text-gray-300 font-bold py-2 rounded-lg">
                修正する
              </button>
            </div>
          </div>
        )}

        {/* 修正フォーム */}
        {editing && (
          <div className="mt-3 bg-gray-800 rounded-lg p-4 border border-gray-600">
            <p className="text-sm text-gray-400 mb-3">記録内容を修正</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">日付</label>
                <input type="date" value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">カテゴリ</label>
                <div className="flex gap-2">
                  {Object.keys(CATEGORIES).map((cat) => (
                    <button key={cat}
                      onClick={() => setEditData({ ...editData, category: cat, subcategory: CATEGORIES[cat][0] })}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-bold border ${
                        editData.category === cat ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]' : 'bg-gray-700 text-gray-400 border-gray-600'
                      }`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">サブカテゴリ</label>
                <div className="flex flex-wrap gap-2">
                  {(CATEGORIES[editData.category] || []).map((sub) => (
                    <button key={sub}
                      onClick={() => setEditData({ ...editData, subcategory: sub })}
                      className={`px-3 py-1 rounded-full text-sm border ${
                        editData.subcategory === sub ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]' : 'bg-gray-700 text-gray-400 border-gray-600'
                      }`}>{sub}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">学習時間（分）</label>
                <input type="number" value={editData.minutes}
                  onChange={(e) => setEditData({ ...editData, minutes: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (editData.minutes > 0) saveConfirm(editData) }} disabled={saving}
                  className="flex-1 bg-[#c9a84c] text-gray-900 font-bold py-2 rounded-lg disabled:opacity-50">
                  {saving ? '保存中...' : '修正して記録'}
                </button>
                <button onClick={() => { setEditing(false); setConfirm(null) }}
                  className="px-4 bg-gray-700 text-gray-400 rounded-lg">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 手動入力（折りたたみ） */}
      <button onClick={() => setShowManual(!showManual)}
        className="w-full text-sm text-gray-500 mb-2 text-left">
        {showManual ? '▼ 手動入力を閉じる' : '▶ 手動で入力する'}
      </button>
      {showManual && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          {manualMessage && (
            <div className={`rounded-lg p-2 mb-3 text-sm ${manualMessage.startsWith('エラー') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
              {manualMessage}
            </div>
          )}
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">日付</label>
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">カテゴリ</label>
            <div className="flex gap-2">
              {Object.keys(CATEGORIES).map((cat) => (
                <button key={cat}
                  onClick={() => { setManualCategory(cat); setManualSubcategory(CATEGORIES[cat][0]) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border ${
                    manualCategory === cat ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]' : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>{cat}</button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">サブカテゴリ</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES[manualCategory].map((sub) => (
                <button key={sub} onClick={() => setManualSubcategory(sub)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    manualSubcategory === sub ? 'bg-[#c9a84c] text-gray-900 border-[#c9a84c]' : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>{sub}</button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">学習時間（分）</label>
            <input type="number" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)}
              placeholder="60" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-1">メモ（任意）</label>
            <input type="text" value={manualNote} onChange={(e) => setManualNote(e.target.value)}
              placeholder="例: TOEIC問題集 Part3"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500" />
          </div>
          <button onClick={saveManual} disabled={manualSaving}
            className="w-full bg-[#c9a84c] text-gray-900 font-bold py-3 rounded-lg disabled:opacity-50">
            {manualSaving ? '保存中...' : '記録する'}
          </button>
        </div>
      )}
    </div>
  )
}
