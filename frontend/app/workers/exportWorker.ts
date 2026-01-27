/* eslint-disable no-restricted-globals */
// Web Worker for heavy export mapping & aggregation

export type GridPayload = { headers: string[]; rows: string[][] }
export type ExportWorkerRequest = { grids: GridPayload[] }
export type ExportWorkerResponse =
  | { type?: 'done'; exportRows: string[][] }
  | { type: 'progress'; processed: number; total: number }

const normalizeHeader = (h: string) =>
  (h || '')
    .replace(/[\s　]/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/^時間/, '')
    .replace(/\//g, '')
    .toLowerCase()

const COLUMN_MAP_ALIASES: Record<string, string[]> = {
  emp_no: ['従業員番号', '社員番号', '社員No', '(基本)従業員番号'],
  name: ['氏名', '名前', 'カナ氏名', '(基本)氏名', '(基本)カナ氏名'],
  status: ['勤務予定', '勤務予定日', '勤務予定区分', '勤務状況', '進捗状況'],
  overtime: ['実所定外時間', '残業時間', '残業', '(時間)実所定外時間'],
  overtime_detail: ['残業時間', '実所定外時間', '(時間)残業時間'],
  call_time: ['呼出出勤時間', '呼出出勤', '(時間)呼出出勤'],
  org_code: ['所属コード', '(人事所属本務(基準日))所属コード'],
  org1: ['所属名称1', '所属名称１', '所属1', '(人事所属本務(基準日))所属名称１'],
  org2: ['所属名称2', '所属名称２', '所属2', '(人事所属本務(基準日))所属名称２'],
  org3: ['所属名称3', '所属名称３', '所属3', '(人事所属本務(基準日))所属名称３'],
  org4: ['所属名称4', '所属名称４', '所属4', '(人事所属本務(基準日))所属名称４'],
  org5: ['所属名称5', '所属名称５', '所属5', '(人事所属本務(基準日))所属名称５'],
  org6: ['所属名称6', '所属名称６', '所属6', '(人事所属本務(基準日))所属名称６'],
  org7: ['所属名称7', '所属名称７', '所属7', '(人事所属本務(基準日))所属名称７'],
  org8: ['所属名称8', '所属名称８', '所属8', '(人事所属本務(基準日))所属名称８'],
  grade_code: ['従業員区分(ｺｰﾄﾞ)', '(従業員区分(基準日))従業員区分(ｺｰﾄﾞ)'],
  grade: ['従業員区分', 'グレード', '(従業員区分(基準日))従業員区分'],
  role_code: ['職制(ｺｰﾄﾞ)', '(職制(基準日))職制(ｺｰﾄﾞ)'],
  role: ['職制', '役職', '(職制(基準日))職制'],
  profit_code: ['損益管理コード(ｺｰﾄﾞ)', '(人事所属本務(基準日))損益管理コード(ｺｰﾄﾞ)'],
  profit: ['損益管理コード', '(人事所属本務(基準日))損益管理コード'],
  email: ['アドレス1', 'メールアドレス', '(メールアドレス情報)アドレス1'],
  hire_date: ['入社年月日', '(基本)入社年月日'],
}

const NUMERIC_TIME_INDEXES = [3, 4, 5]

const minutesToDisplay = (minutes: number | string | undefined | null) => {
  if (minutes == null) return ''
  const num = Number(minutes)
  if (!Number.isFinite(num)) return ''
  const safe = Math.max(0, Math.round(num))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

const buildColumnMap = (headers: string[]) => {
  const normalized: Record<string, number> = {}
  headers.forEach((h, idx) => {
    normalized[normalizeHeader(h)] = idx
  })
  const resolved: Record<string, number> = {}
  Object.entries(COLUMN_MAP_ALIASES).forEach(([key, aliases]) => {
    for (const name of aliases) {
      const idx = normalized[normalizeHeader(name)]
      if (idx !== undefined) {
        resolved[key] = idx
        break
      }
    }
  })
  return resolved
}

const asString = (value: unknown) => (value == null ? '' : String(value))

const mapRowsToExport = (headers: string[], rows: string[][]) => {
  const colMap = buildColumnMap(headers)
  const pick = (row: string[], key: string, fallback = '') => {
    const idx = colMap[key]
    if (idx === undefined) return fallback
    return asString(row[idx])
  }

  const EXCLUDED_ORG_VALUES = ['AI-DATA_GROUP', 'イオンディライト']

  return rows.map((r) => {
    const orgValues = [
      pick(r, 'org1', ''),
      pick(r, 'org2', ''),
      pick(r, 'org3', ''),
      pick(r, 'org4', ''),
      pick(r, 'org5', ''),
      pick(r, 'org6', ''),
      pick(r, 'org7', ''),
      pick(r, 'org8', ''),
    ]

    const filteredOrgs = orgValues
      .map((v) => v.trim())
      .filter((v) => v && !EXCLUDED_ORG_VALUES.includes(v))

    const org2to8 = Array(7).fill('')
    filteredOrgs.forEach((val, idx) => {
      if (idx < 7) {
        org2to8[idx] = val
      }
    })

    return [
      pick(r, 'emp_no', ''),
      pick(r, 'name', ''),
      pick(r, 'status', ''),
      pick(r, 'overtime', ''),
      pick(r, 'overtime_detail', pick(r, 'overtime', '')),
      pick(r, 'call_time', ''),
      pick(r, 'grade', ''),
      pick(r, 'role', ''),
      ...org2to8,
    ]
  })
}

const parseMinutes = (value: string | number | undefined | null) => {
  if (value == null) return 0
  const str = String(value).trim()
  if (!str) return 0
  if (str.includes(':')) {
    const [h, m] = str.split(':').map((v) => Number(v) || 0)
    return h * 60 + m
  }
  const num = Number(str)
  if (!Number.isFinite(num)) return 0
  return Math.round(num)
}

const formatMinutes = (total: number | undefined) => {
  if (total == null) return ''
  const minutes = Math.max(0, Math.round(total))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

const mergeByEmployee = (rows: string[][], overrides: Record<string, { actual?: number; overtime?: number }> = {}) => {
  const grouped = new Map<string, { base: string[]; sums: Record<number, number> }>()
  const orphanRows: string[][] = []
  rows.forEach((row) => {
    const empNo = (row?.[0] ?? '').trim()
    if (!empNo) {
      orphanRows.push(row)
      return
    }
    const existing = grouped.get(empNo)
    if (!existing) {
      const sums: Record<number, number> = {}
      NUMERIC_TIME_INDEXES.forEach((i) => {
        sums[i] = parseMinutes(row[i])
      })
      grouped.set(empNo, { base: [...row], sums })
      return
    }
    const nextBase = [...existing.base]
    NUMERIC_TIME_INDEXES.forEach((i) => {
      existing.sums[i] = (existing.sums[i] ?? 0) + parseMinutes(row[i])
    })
    nextBase.forEach((cell, i) => {
      if (NUMERIC_TIME_INDEXES.includes(i)) return
      const candidate = row[i]
      if ((!cell || cell.toString().trim() === '') && candidate && candidate.toString().trim() !== '') {
        nextBase[i] = candidate
      }
    })
    grouped.set(empNo, { base: nextBase, sums: existing.sums })
  })

  const mergedRows: string[][] = []
  grouped.forEach(({ base, sums }, empNo) => {
    const out = [...base]
    const override = overrides[empNo]
    const actual = override?.actual
    const overtime = override?.overtime
    out[3] = minutesToDisplay(actual ?? sums[3])
    out[4] = minutesToDisplay(overtime ?? sums[4])
    out[5] = minutesToDisplay(sums[5])
    mergedRows.push(out)
  })
  return [...mergedRows, ...orphanRows]
}

self.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  const { grids } = e.data
  const allRows: string[][] = []
  const totalRows = grids.reduce((sum, g) => sum + (g.rows?.length || 0), 0)
  let processed = 0
  const CHUNK = 5000 // 1000 → 5000に変更（プログレス更新を減らす）

  grids.forEach((g) => {
    if (!g || !g.headers || !g.rows || !g.rows.length) return
    const mapped = mapRowsToExport(g.headers, g.rows)
    // まとめて追加（ループを減らす）
    allRows.push(...mapped)
    processed += mapped.length
    if (processed % CHUNK === 0 || processed === totalRows) {
      const progress: ExportWorkerResponse = { type: 'progress', processed, total: totalRows }
      ;(self as any).postMessage(progress)
    }
  })

  const meaningful = allRows.filter((row) => row.some((cell) => (cell ?? '').toString().trim() !== ''))
  const exportRows = mergeByEmployee(meaningful)
  const resp: ExportWorkerResponse = { type: 'done', exportRows }
  ;(self as any).postMessage(resp)
}
