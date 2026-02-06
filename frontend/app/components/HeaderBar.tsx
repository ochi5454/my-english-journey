'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Mail } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function HeaderBar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  if (!user) return null

  const initials = user.name?.slice(0, 2).toUpperCase() || 'US'

  const navItems = [
    { href: '/', label: 'データ管理', icon: Home },
    { href: '/notifications', label: 'メール送信', icon: Mail },
  ]

  return (
    <header className="dash-header">
      <div className="header-inner">
        <nav style={{ display: 'flex', gap: 4 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#2563eb' : '#64748b',
                  background: isActive ? '#eff6ff' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="header-right">
          <div className="user-chip minimal">
            <span className="user-name">{user.name}</span>
            <div className="avatar small">{initials}</div>
          </div>
          <button type="button" className="logout-btn-soft" onClick={logout}>
            ログアウト
          </button>
        </div>
      </div>
    </header>
  )
}
