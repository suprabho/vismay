'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function LogoutButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch('/api/admin/logout', { method: 'POST' })
          router.refresh()
        })
      }
      className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
    >
      {pending ? '…' : 'log out'}
    </button>
  )
}
