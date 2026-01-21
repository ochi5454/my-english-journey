'use client'

import { useSyncExternalStore } from 'react'

export type ImportPreview = { headers: string[]; rows: string[][]; fileName?: string | null; importedAt?: string | null }
type ImportStoreState = { data: Record<string, ImportPreview> }

const STORAGE_KEY = 'jikangai_import_data'

const loadState = (): ImportStoreState => {
  if (typeof window === 'undefined') return { data: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: {} }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.data) {
      return { data: parsed.data as Record<string, ImportPreview> }
    }
  } catch {
    // ignore
  }
  return { data: {} }
}

let state: ImportStoreState = loadState()
const subscribers = new Set<() => void>()

const persist = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const setState = (updater: (prev: ImportStoreState) => ImportStoreState) => {
  state = updater(state)
  persist()
  subscribers.forEach((cb) => cb())
}

const subscribe = (cb: () => void) => {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

const getSnapshot = () => state

export const useImportDataStore = () => useSyncExternalStore(subscribe, getSnapshot)

export const setImportData = (fileKey: string, payload: ImportPreview) => {
  setState((prev) => ({ data: { ...prev.data, [fileKey]: payload } }))
}

export const clearImportData = (fileKey: string) => {
  setState((prev) => {
    const next = { ...prev.data }
    delete next[fileKey]
    return { data: next }
  })
}

export const clearAllImportData = () => {
  setState(() => ({ data: {} }))
}
