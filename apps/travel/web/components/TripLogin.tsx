'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TripLogin({ slug }: { slug: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${slug}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(res.status === 429 ? body?.error ?? 'too many attempts' : 'Wrong password — check the message you were sent.')
        return
      }
      router.replace(`/t/${slug}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Trip password"
        autoFocus
        className="block w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-center text-base"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="w-full rounded-xl bg-[#2b2419] text-[#fffdf8] px-4 py-3 text-base font-medium disabled:opacity-50"
      >
        {busy ? 'Opening…' : 'Open the trip'}
      </button>
    </form>
  )
}
