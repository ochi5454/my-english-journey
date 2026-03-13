'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Target, MessageSquare, History } from 'lucide-react'

const tabs = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/define', label: '定義', icon: Target },
  { href: '/record', label: '記録', icon: MessageSquare },
  { href: '/history', label: '履歴', icon: History },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 z-50">
      <div className="flex justify-around max-w-md mx-auto pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-2.5 px-3 text-xs transition-colors ${
                active ? 'text-[#c9a84c]' : 'text-gray-500'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className="mt-1 font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
