'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from './providers/AuthProvider'

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
