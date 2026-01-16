export type FileDef = { display_name: string; expected_headers: string[] }

export type SheetPayload = {
  file_key: string
  file_name: string
  version: number
  sheets: { name: string; headers: string[]; rows: string[][]; grid?: string[][] }[]
  expected_headers: string[]
}

export type LegendItem = { label: string; desc: string; bg: string; color: string }
