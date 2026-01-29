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
          <span className="user-name">{user.name || user.email}</span>
          {user.is_admin && <span className="badge-admin">ADMIN</span>}
          <div className="avatar">{initials}</div>
          <button
            type="button"
            onClick={logout}
            style={{
              background: '#ef4444',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  )
}
