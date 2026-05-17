'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError('Wrong password')
        return
      }
      router.replace(next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-neutral-400">Shared admin password.</p>
      </div>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-white/30"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || !password}
        className="w-full bg-white text-neutral-950 rounded-lg px-4 py-3 font-medium disabled:opacity-50 active:bg-neutral-200"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
