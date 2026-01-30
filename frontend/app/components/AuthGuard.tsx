'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'

type Props = { children: React.ReactNode }

const PUBLIC_PATHS = ['/login', '/auth/callback']

export function AuthGuard({ children }: Props) {
  const { user, loading, refresh } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  useEffect(() => {
    // Refresh when route changes to keep session fresh
    refresh()
  }, [pathname, refresh])

  useEffect(() => {
    // Allow public pages without redirect
    if (isPublic) return
    if (loading) return
    if (!user) {
      router.replace('/login')
    }
  }, [user, loading, router, pathname, isPublic])

  // 公開ページは認証チェックせず即表示
  if (isPublic) {
    return <>{children}</>
  }

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#0f172a' }}>
        認証を確認しています…
      </div>
    )
  }

  return <>{children}</>
}
