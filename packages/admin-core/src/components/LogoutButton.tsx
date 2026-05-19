'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

interface Props {
  logoutEndpoint?: string
  label?: string
  pendingLabel?: string
  className?: string
}

export function LogoutButton({
  logoutEndpoint = '/api/admin/logout',
  label = 'log out',
  pendingLabel = '…',
  className = 'text-neutral-400 hover:text-white transition-colors disabled:opacity-50',
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch(logoutEndpoint, { method: 'POST' })
          router.refresh()
        })
      }
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

export default LogoutButton
