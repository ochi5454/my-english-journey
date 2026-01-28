/**
 * ジョブ管理の型定義
 *
 * ナレッジリファレンスのTypeScript実装パターンに従う
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface JobProgress {
  total: number
  processed: number
  percent: number
  duration: number | null
}

export interface JobResponse {
  job_id: string
  status: JobStatus
  progress: JobProgress
  result?: any
  error?: string
}

export interface JobCreatedResponse {
  job_id: string
  status: string
  message: string
}
