import { FileDef, LegendItem } from '../types/excel'

// Use proxy path to avoid cross-origin cookie issues
// The proxy is configured in next.config.js to forward to the backend
export const API_BASE = '/api/proxy'

export const FILE_ORDER = [
  'person_progress', // 進捗状況を優先して取り込む
  'schedule_input',
  'punches',
  'days_items',
  'tim_daily',
  'org_info',
] as const

export const FALLBACK_DEFS: Record<string, FileDef> = {
  schedule_input: {
    display_name: '勤務予定入力',
    expected_headers: [
      '従業員番号',
      '勤務予定日',
      '出勤休日区分',
      '出勤休日区分名',
      '就業時間パターンコード',
      '就業時間パターン名',
      '就業開始時刻',
      '就業終了時刻',
      '休憩時間',
    ],
  },
  punches: {
    display_name: '出退社時刻',
    expected_headers: ['従業員番号', '勤務日付', '出社時刻', '退社時刻'],
  },
  days_items: {
    display_name: '日数項目',
    expected_headers: ['従業員番号', '勤務日', '出社時刻', '退社時刻', '日数項目', '日数項目名'],
  },
  tim_daily: {
    display_name: '日次実績',
    expected_headers: [
      '従業員番号',
      '勤務日付',
      '(時間)定時開始時刻',
      '(時間)定時終了時刻',
      '(時間)呼出出勤',
      '(時間)呼出退勤',
      '(時間)呼出勤務',
      '(時間)実所定外時間',
      '(時間)出社日数',
      '(時間)在宅勤務時間',
      '(時間)在宅勤務日数',
      '(時間)終日在宅フラグ',
      '(時間)実労働時間',
      '(時間)休憩Ｈ',
      '(時間)休憩勤務開始',
      '(時間)休憩勤務終了',
      '(時間)休憩1開始時刻',
      '(時間)休憩1終了時刻',
      '(時間)休憩2開始時刻',
      '(時間)休憩2終了時刻',
      '(時間)休憩3開始時刻',
      '(時間)休憩3終了時刻',
      '(時間)休憩4開始時刻',
      '(時間)休憩4終了時刻',
    ],
  },
  person_progress: {
    display_name: '勤務予定進捗一覧',
    expected_headers: ['社員番号', '氏名', 'カナ氏名', '勤怠年月', '勤務開始日', '進捗状況', '打刻実績', '勤務実績登録', '所属名称', 'メールアドレス'],
  },
  org_info: {
    display_name: '所属情報',
    expected_headers: [
      '従業員番号',
      '氏名',
      '所属コード',
      '所属名称１',
      '所属名称２',
      '所属名称３',
      '所属名称４',
      '所属名称５',
      '所属名称６',
      '所属名称７',
      '所属名称８',
      '従業員区分(ｺｰﾄﾞ)',
      '従業員区分',
      '職制(ｺｰﾄﾞ)',
      '職制',
      '損益管理コード(ｺｰﾄﾞ)',
      '損益管理コード',
      'アドレス1',
      '入社年月日',
    ],
  },
}

export const LEGEND: LegendItem[] = [
  { label: '80h超', desc: '長時間労働', bg: '#6b4f00', color: '#f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', bg: '#d0a754', color: '#1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', bg: '#e6a600', color: '#1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', bg: '#c7b202', color: '#0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', bg: '#1f8a55', color: '#fdfdfd' },
  { label: '15h〜20h', desc: '', bg: '#5f86c6', color: '#fdfdfd' },
]

export const REPORT_HEADING = 'データエクスポート'
export const TABLE_TITLE = ''
