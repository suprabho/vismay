'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clientSlug: string
  clientName: string
}

export default function DemoLoginForm({ clientSlug, clientName }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await fetch(`/api/demo/${clientSlug}/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(body.error ?? 'wrong password')
        return
      }
      router.replace(`/demo/${clientSlug}`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-6"
    >
      <div className="space-y-2">
        <div
          className="text-xs uppercase tracking-[0.3em]"
          style={{ color: 'var(--demo-fg-mute, rgba(244,236,216,0.5))' }}
        >
          Vizmaya · Private demo
        </div>
        <h1
          className="text-2xl"
          style={{
            fontFamily: "var(--demo-serif-font, 'Fraunces', Georgia, serif)",
            color: 'var(--demo-fg, #F4ECD8)',
          }}
        >
          For {clientName}
        </h1>
      </div>
      <input
        type="password"
        autoFocus
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full px-4 py-3 text-base focus:outline-none"
        style={{
          background: 'var(--demo-fg-line, rgba(244,236,216,0.05))',
          border: '1px solid var(--demo-fg-line, rgba(244,236,216,0.15))',
          color: 'var(--demo-fg, #F4ECD8)',
        }}
      />
      {error && (
        <p className="text-sm" style={{ color: 'var(--demo-accent, #E08A6E)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !password}
        className="w-full px-4 py-3 text-sm uppercase tracking-[0.2em] disabled:opacity-50 transition-opacity"
        style={{
          background: 'var(--demo-fg, #F4ECD8)',
          color: 'var(--demo-bg, #14120E)',
        }}
      >
        {pending ? 'Signing in…' : 'Enter demo'}
      </button>
    </form>
  )
}
