const STORAGE_KEY = 'export_rows_per_sec'
const DEFAULT_SPEED = 1200 // rows/sec fallback

export type EtaTrackerState = {
  totalRows: number
  startAt: number
  processed: number
}

export const loadSpeed = (): number => {
  if (typeof localStorage === 'undefined') return DEFAULT_SPEED
  const raw = localStorage.getItem(STORAGE_KEY)
  const val = raw ? Number(raw) : NaN
  if (!Number.isFinite(val) || val <= 0) return DEFAULT_SPEED
  return val
}

export const saveSpeed = (value: number) => {
  if (typeof localStorage === 'undefined') return
  if (!Number.isFinite(value) || value <= 0) return
  localStorage.setItem(STORAGE_KEY, String(Math.round(value)))
}

export const updateSpeedEma = (oldSpeed: number, measured: number, alpha = 0.3): number => {
  if (!Number.isFinite(measured) || measured <= 0) return oldSpeed
  const base = Number.isFinite(oldSpeed) && oldSpeed > 0 ? oldSpeed : DEFAULT_SPEED
  return base * (1 - alpha) + measured * alpha
}

export const estimateEtaSeconds = (state: EtaTrackerState, speedRowsPerSec: number): number => {
  const { totalRows, startAt, processed } = state
  if (!totalRows || !startAt) return 0
  const now = performance.now()
  const elapsedSec = (now - startAt) / 1000
  const effectiveSpeed =
    processed > 0 && elapsedSec > 0 ? Math.max(1, processed / elapsedSec) : Math.max(1, speedRowsPerSec)
  const remaining = Math.max(0, totalRows - processed)
  return Math.ceil(remaining / effectiveSpeed)
}
