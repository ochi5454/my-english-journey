'use client'

import { useAuth } from '../hooks/useAuth'

export function HeaderBar() {
  const { user, logout } = useAuth()

  if (!user) return null

  const initials = user.name?.slice(0, 2).toUpperCase() || 'US'

  return (
    <header className="dash-header">
      <div className="header-inner">
        <div className="header-right">
          <div className="user-chip minimal">
            <span className="user-name">Admin</span>
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
