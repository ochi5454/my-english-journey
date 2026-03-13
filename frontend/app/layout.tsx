import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My English Journey',
  description: '英語学習進捗管理アプリ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
