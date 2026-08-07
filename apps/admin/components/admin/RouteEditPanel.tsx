'use client'

import { useRouter } from 'next/navigation'
import { AdminEditPanel } from './AdminEditPanel'

export function RouteEditPanel({
  children,
  size,
  label,
}: {
  children: React.ReactNode
  size?: 'standard' | 'wide'
  label?: string
}) {
  const router = useRouter()
  return (
    <AdminEditPanel onClose={() => router.back()} size={size} label={label}>
      {children}
    </AdminEditPanel>
  )
}
