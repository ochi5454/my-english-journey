import { FileDef, LegendItem } from '../types/excel'

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000'

export const FILE_ORDER = ['schedule_input', 'punches', 'days_items', 'tim_daily', 'person_progress'] as const

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
}

export const LEGEND: LegendItem[] = [
  { label: '80h超', desc: '長時間労働', bg: '#6b4f00', color: '#f7f2e2' },
  { label: '〜80h', desc: '３６協定特別条項上限超過者', bg: '#d0a754', color: '#1a1200' },
  { label: '〜60h', desc: '３６協定特別条項上限', bg: '#e6a600', color: '#1a1200' },
  { label: '〜45h', desc: '労働基準法上の時間外労働上限', bg: '#c7b202', color: '#0f0f0f' },
  { label: '〜30h', desc: '社内ルールに基づく上限', bg: '#1f8a55', color: '#fdfdfd' },
  { label: '15h〜20h', desc: '', bg: '#5f86c6', color: '#fdfdfd' },
]

export const REPORT_HEADING = '実所定外時間 推計データ'
export const REPORT_PERIOD = '2025年12月度 （2025年12月15日現在）'
export const TABLE_TITLE = '2025年12月度 実所定外時間 推計データ（2025年12月15日現在）'
