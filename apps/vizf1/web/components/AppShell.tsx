'use client'

import { AppHeader } from '@/components/AppHeader'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AppHeader />
      {children}
    </div>
  )
}
