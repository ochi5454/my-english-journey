import './globals.css'
import type { Metadata, Viewport } from 'next'
import BottomNav from './components/BottomNav'

export const metadata: Metadata = {
  title: 'My English Journey',
  description: '英語学習進捗管理アプリ',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'English Journey',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen max-w-md mx-auto">
        <main className="pb-20 pt-[env(safe-area-inset-top)]">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
