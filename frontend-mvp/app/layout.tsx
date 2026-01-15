import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '実所定外時間 推計データ',
  description: '実所定外時間 推計データビュー',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="text-slate-900">{children}</body>
    </html>
  )
}
