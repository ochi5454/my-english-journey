'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuthContext, AuthUser } from '../hooks/useAuth'
import { API_BASE } from '../constants/excel'

type Props = { children: React.ReactNode }

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    setLoading(true)
    try {
      // タイムアウト付きのfetch（5秒）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error('unauth')
      const data = await res.json()
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return <AuthContext.Provider value={{ user, loading, refresh: fetchMe, logout }}>{children}</AuthContext.Provider>
}
