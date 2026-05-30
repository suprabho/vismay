'use client'

import { useEffect, useState } from 'react'

type AppOption = { slug: string; name: string }

// Cache the apps list across instances so a page full of rows doesn't refetch.
let appsCache: AppOption[] | null = null
let appsInflight: Promise<AppOption[]> | null = null

async function loadApps(): Promise<AppOption[]> {
  if (appsCache) return appsCache
  if (!appsInflight) {
    appsInflight = fetch('/api/vizmaya/apps')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AppOption[]) => {
        appsCache = data
        return data
      })
      .catch(() => [])
  }
  return appsInflight
}

const UNASSIGNED = '' // select value standing in for null

/**
 * Inline "move to app" dropdown. Immediately PUTs the chosen app (or null to
 * unassign) to /api/vizmaya/stories/<slug>/app — app_slug is a column, not
 * frontmatter, so this is a dedicated write, not part of the editor's Save.
 */
export default function MoveStoryControl({
  slug,
  currentAppSlug,
  onMoved,
}: {
  slug: string
  currentAppSlug: string | null
  onMoved?: (appSlug: string | null) => void
}) {
  const [apps, setApps] = useState<AppOption[]>(appsCache ?? [])
  const [value, setValue] = useState<string>(currentAppSlug ?? UNASSIGNED)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    loadApps().then(setApps)
  }, [])

  async function onChange(next: string) {
    const prev = value
    setValue(next)
    setBusy(true)
    setErr(null)
    const appSlug = next === UNASSIGNED ? null : next
    try {
      const res = await fetch(`/api/vizmaya/stories/${slug}/app`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appSlug }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErr(body?.error ?? `HTTP ${res.status}`)
        setValue(prev)
        return
      }
      onMoved?.(appSlug)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'move failed')
      setValue(prev)
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={busy}
      title={err ?? 'Move to app'}
      className={`text-xs bg-neutral-900 border rounded px-2 py-1 text-neutral-300 cursor-pointer disabled:opacity-50 ${
        err ? 'border-red-500/60' : 'border-white/10'
      }`}
    >
      <option value={UNASSIGNED}>— Unassigned —</option>
      {apps.map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.name}
        </option>
      ))}
    </select>
  )
}
