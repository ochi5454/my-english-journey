'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'

type Props = { children: React.ReactNode }

const PUBLIC_PATHS = ['/login', '/auth/callback']

export function AuthGuard({ children }: Props) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const [redirecting, setRedirecting] = useState(false)

  // 認証状態は AuthProvider の useEffect で1回だけ取得するため、
  // ルート変更ごとの再取得は不要（過剰なAPIコールを防ぐ）

  useEffect(() => {
    // Allow public pages without redirect
    if (isPublic) return
    if (loading) return
    if (!user && !redirecting) {
      setRedirecting(true)
      router.replace('/login')
    }
  }, [user, loading, router, pathname, isPublic, redirecting])

  // 公開ページは認証チェックせず即表示
  if (isPublic) {
    return <>{children}</>
  }

  // ローディング中
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#0f172a' }}>
        認証を確認しています…
      </div>
    )
  }

  // ユーザーがいない場合はリダイレクト中を表示
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#0f172a' }}>
        ログインページへ移動しています…
      </div>
    )
  }

  return <>{children}</>
}
