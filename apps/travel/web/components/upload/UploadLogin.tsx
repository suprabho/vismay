'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UploadLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/upload/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null
        setError(b?.error ?? 'login failed')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <label className="block">
        <span className="text-sm font-medium">Admin password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="rounded-full bg-[#2b2419] text-[#fffdf8] px-5 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  )
}
