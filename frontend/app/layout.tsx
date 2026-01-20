import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'データインポート',
  description: 'データインポート用ページ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="text-slate-900">{children}</body>
    </html>
  )
}
