import './globals.css'
import type { Metadata } from 'next'
import { Providers } from './providers'
import { AuthGuard } from './components/AuthGuard'

export const metadata: Metadata = {
  title: 'AI Mail Agent',
  description: 'AIメール送信エージェント',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="text-slate-900">
        <Providers>
          <AuthGuard>{children}</AuthGuard>
        </Providers>
      </body>
    </html>
  )
}
