/**
 * ジョブ管理APIクライアント
 *
 * ナレッジリファレンスの実装パターンに従う
 */

import { JobResponse, JobCreatedResponse } from '../types/jobs'
import { API_BASE } from '../constants/excel'

export class JobClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl
  }

  /**
   * ファイルアップロード（非同期版）
   */
  async uploadFileAsync(file: File, fileKey: string): Promise<JobCreatedResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${this.baseUrl}/excel/${fileKey}/upload-async`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Upload failed: ${response.statusText} - ${errorText}`)
    }

    return response.json()
  }

  /**
   * ジョブ状態取得
   */
  async getJobStatus(jobId: string): Promise<JobResponse> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, { credentials: 'include' })

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * ポーリング実行（完了まで）
   *
   * @param jobId ジョブID
   * @param onProgress 進捗コールバック
   * @param interval ポーリング間隔（ミリ秒）
   * @returns 最終結果
   */
  async pollUntilComplete(
    jobId: string,
    onProgress?: (status: JobResponse) => void,
    interval: number = 2000
  ): Promise<JobResponse> {
    while (true) {
      const status = await this.getJobStatus(jobId)

      // 進捗コールバック
      if (onProgress) {
        onProgress(status)
      }

      // 完了判定
      if (status.status === 'completed') {
        return status
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Job failed')
      }

      // 待機
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  /**
   * ジョブキャンセル
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`Cancel failed: ${response.statusText}`)
    }
  }
}

// デフォルトインスタンス
export const jobClient = new JobClient()
