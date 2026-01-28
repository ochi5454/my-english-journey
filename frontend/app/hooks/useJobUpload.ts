/**
 * ジョブベースのファイルアップロードReact Hook
 *
 * ナレッジリファレンスの実装パターンに従う
 */

import { useState, useCallback } from 'react'
import { JobResponse } from '../types/jobs'
import { jobClient } from '../api/jobClient'

export interface UseJobUploadResult {
  uploading: boolean
  progress: number
  status: JobResponse | null
  error: string | null
  upload: (file: File, fileKey: string) => Promise<void>
  reset: () => void
}

export function useJobUpload(): UseJobUploadResult {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<JobResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(async (file: File, fileKey: string) => {
    setUploading(true)
    setError(null)
    setProgress(0)
    setStatus(null)

    try {
      // アップロード
      const response = await jobClient.uploadFileAsync(file, fileKey)

      console.log('[JobUpload] Job created:', response.job_id)

      // ポーリング
      await jobClient.pollUntilComplete(
        response.job_id,
        (jobStatus) => {
          setStatus(jobStatus)
          setProgress(jobStatus.progress.percent)

          console.log(
            `[JobUpload] Progress: ${jobStatus.progress.percent}% ` +
              `(${jobStatus.progress.processed}/${jobStatus.progress.total})`
          )
        },
        2000 // 2秒間隔でポーリング
      )

      console.log('[JobUpload] Job completed successfully')
    } catch (err) {
      console.error('[JobUpload] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setUploading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setUploading(false)
    setProgress(0)
    setStatus(null)
    setError(null)
  }, [])

  return { uploading, progress, status, error, upload, reset }
}
