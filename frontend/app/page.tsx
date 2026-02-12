'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from './hooks/useAuth'
import { LogOut } from 'lucide-react'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const router = useRouter()

  // メイン機能
  const mainItem = {
    title: 'メール新規作成',
    description: 'メールを作成・送信',
    emoji: '✉️',
    href: '/compose',
    glowColor: 'blue',
  }

  // サブ機能
  const subItems = [
    {
      title: 'テンプレート管理',
      description: '頻繁に使う定型文を管理・作成',
      emoji: '📋',
      href: '/templates',
      glowColor: 'emerald',
    },
    {
      title: '宛先管理',
      description: '宛先を管理・作成',
      emoji: '👥',
      href: '/recipients',
      glowColor: 'purple',
    },
    {
      title: '予約送信',
      description: '予約した送信を管理',
      emoji: '📅',
      href: '/scheduled',
      glowColor: 'pink',
    },
    {
      title: '送信履歴',
      description: '送信ログを確認',
      emoji: '📤',
      href: '/history',
      glowColor: 'amber',
    },
  ]

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const getGlowStyle = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'hover:shadow-blue-500/30',
      emerald: 'hover:shadow-emerald-500/30',
      purple: 'hover:shadow-purple-500/30',
      amber: 'hover:shadow-amber-500/30',
      pink: 'hover:shadow-pink-500/30',
    }
    return colors[color] || colors.blue
  }

  const getAccentColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'from-blue-500/20 to-blue-600/10',
      emerald: 'from-emerald-500/20 to-emerald-600/10',
      purple: 'from-purple-500/20 to-purple-600/10',
      amber: 'from-amber-500/20 to-amber-600/10',
      pink: 'from-pink-500/20 to-pink-600/10',
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative overflow-hidden">
      {/* Animated Background Gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 -left-40 w-96 h-96 bg-blue-600/30 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-20 left-1/3 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header - Glassmorphism */}
      <header className="h-16 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between px-6 sticky top-0 z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          AI Mail Agent
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{user?.name || user?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-white/10 backdrop-blur-sm border border-transparent hover:border-red-500/30 transition-all duration-300"
          >
            <LogOut size={16} />
            ログアウト
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex items-center justify-center py-8" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="max-w-4xl w-full px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              ようこそ、{user?.name || user?.email || 'ユーザー'}さん
            </h2>
            <p className="text-slate-400">何をしますか？</p>
          </div>

          {/* Main Feature - Glass Card */}
          <button
            onClick={() => router.push(mainItem.href)}
            className={`
              w-full p-8 rounded-3xl mb-6
              backdrop-blur-xl bg-white/5
              border border-white/10 hover:border-white/20
              shadow-2xl ${getGlowStyle(mainItem.glowColor)} hover:shadow-2xl
              transform hover:scale-[1.01] transition-all duration-300
              flex flex-col items-center justify-center gap-4
              group cursor-pointer
              relative overflow-hidden
            `}
            style={{ minHeight: '42vh' }}
          >
            {/* Inner glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br ${getAccentColor(mainItem.glowColor)} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

            <span className="text-8xl group-hover:scale-110 transition-transform duration-300 relative z-10 drop-shadow-lg">
              {mainItem.emoji}
            </span>
            <div className="text-center relative z-10">
              <div className="text-3xl font-bold text-white drop-shadow-lg">{mainItem.title}</div>
              <div className="text-base text-white/60 mt-2">{mainItem.description}</div>
            </div>
          </button>

          {/* Sub Features - Glass Cards */}
          <div className="grid grid-cols-4 gap-4">
            {subItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`
                  p-5 rounded-2xl
                  backdrop-blur-xl bg-white/5
                  border border-white/10 hover:border-white/20
                  shadow-xl ${getGlowStyle(item.glowColor)} hover:shadow-xl
                  transform hover:scale-[1.03] transition-all duration-300
                  flex flex-col items-center justify-center gap-3
                  group cursor-pointer
                  relative overflow-hidden
                `}
                style={{ minHeight: '16vh' }}
              >
                {/* Inner glow effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${getAccentColor(item.glowColor)} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <span className="text-4xl group-hover:scale-110 transition-transform duration-300 relative z-10 drop-shadow-lg">
                  {item.emoji}
                </span>
                <div className="text-center relative z-10">
                  <div className="text-base font-semibold text-white">{item.title}</div>
                  <div className="text-xs text-white/50 mt-1">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
