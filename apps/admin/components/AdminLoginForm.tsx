'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  next: string
  loginEndpoint?: string
  title?: string
  subtitle?: string
}

/**
 * Admin sign-in: email + password against Supabase Auth. Local to `apps/admin`
 * (the shared `@vismay/admin-core` LoginForm stays password-only for the other
 * apps that still use the shared-password gate). POSTs `{ email, password }` to
 * `/api/login`; the route sets the Supabase session cookies.
 */
export default function AdminLoginForm({
  next,
  loginEndpoint = '/api/login',
  title = 'Sign in',
  subtitle = 'Use your admin email and password.',
}: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        setError('Wrong email or password')
        return
      }
      router.replace(next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-neutral-400">{subtitle}</p>
      </div>
      <input
        type="email"
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-white/30"
      />
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-white/30"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full bg-white text-neutral-950 rounded-lg px-4 py-3 font-medium disabled:opacity-50 active:bg-neutral-200"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
