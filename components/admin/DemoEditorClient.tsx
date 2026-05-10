'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type { DemoStatus } from '@/lib/demos'
import type { ShareCardEntry } from '@/lib/shareCardList'

interface ShareCardId {
  parentIndex: number
  subIndex: number
  sliceIndex?: number | null
  variant: string
  label: string
}

interface InitialState {
  client_slug: string
  client_name: string
  story_slug: string
  status: DemoStatus
  content_yaml: string
  share_card_ids: ShareCardId[]
}

interface Props {
  demoId: number
  initial: InitialState
  defaultContentYaml: string
}

type Tab = 'settings' | 'content' | 'share'

const TABS: { id: Tab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'content', label: 'Content' },
  { id: 'share', label: 'Share assets' },
]

const MAX_CURATED_CARDS = 6

export default function DemoEditorClient({ demoId, initial, defaultContentYaml }: Props) {
  const [tab, setTab] = useState<Tab>('settings')
  const [clientName, setClientName] = useState(initial.client_name)
  const [clientSlug, setClientSlug] = useState(initial.client_slug)
  const [storySlug, setStorySlug] = useState(initial.story_slug)
  const [status, setStatus] = useState<DemoStatus>(initial.status)
  const [password, setPassword] = useState('')
  const [contentYaml, setContentYaml] = useState(initial.content_yaml)
  const [pickedIds, setPickedIds] = useState<Set<string>>(
    () => new Set(initial.share_card_ids.map((c) => stableId(c)))
  )

  const [saving, start] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'idle'; msg?: string }>({
    kind: 'idle',
  })

  const dirty = useMemo(
    () =>
      clientName !== initial.client_name ||
      clientSlug !== initial.client_slug ||
      storySlug !== initial.story_slug ||
      status !== initial.status ||
      contentYaml !== initial.content_yaml ||
      password.length > 0 ||
      !sameSet(pickedIds, new Set(initial.share_card_ids.map((c) => stableId(c)))),
    [clientName, clientSlug, storySlug, status, contentYaml, password, pickedIds, initial]
  )

  function save() {
    start(async () => {
      setFeedback({ kind: 'idle' })
      const payload: Record<string, unknown> = {}
      if (clientName !== initial.client_name) payload.client_name = clientName
      if (clientSlug !== initial.client_slug) payload.client_slug = clientSlug
      if (storySlug !== initial.story_slug) payload.story_slug = storySlug
      if (status !== initial.status) payload.status = status
      if (contentYaml !== initial.content_yaml) {
        payload.content_yaml = contentYaml.length === 0 ? null : contentYaml
      }
      if (password.length > 0) payload.password = password
      if (!sameSet(pickedIds, new Set(initial.share_card_ids.map((c) => stableId(c))))) {
        // Walk the picked set against the available cards (server already
        // returned them, but we don't have them here for non-share tabs);
        // store the ids as opaque strings.
        payload.share_card_ids = Array.from(pickedIds).map((id) => parseId(id))
      }
      const res = await fetch(`/api/admin/demos/${demoId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback({ kind: 'err', msg: body.error ?? `HTTP ${res.status}` })
        return
      }
      setPassword('')
      setFeedback({ kind: 'ok', msg: 'Saved' })
      // Reload so server reflects the latest state on next nav.
      setTimeout(() => window.location.reload(), 200)
    })
  }

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving])

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin/demos" className="text-sm text-neutral-400 hover:text-white shrink-0">
            ← Demos
          </Link>
          <h1 className="text-base font-semibold truncate">{clientName}</h1>
          <code className="text-xs text-neutral-500 truncate">/demo/{clientSlug}</code>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/demo/${clientSlug}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-300 hover:text-white"
          >
            Open ↗
          </Link>
          {feedback.kind === 'ok' && <span className="text-xs text-emerald-400">{feedback.msg}</span>}
          {feedback.kind === 'err' && <span className="text-xs text-red-400">{feedback.msg}</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="bg-white text-neutral-950 rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <nav className="border-b border-white/10 px-6 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'settings' && (
          <SettingsTab
            clientName={clientName}
            setClientName={setClientName}
            clientSlug={clientSlug}
            setClientSlug={setClientSlug}
            storySlug={storySlug}
            setStorySlug={setStorySlug}
            status={status}
            setStatus={setStatus}
            password={password}
            setPassword={setPassword}
          />
        )}

        {tab === 'content' && (
          <ContentTab
            value={contentYaml}
            onChange={setContentYaml}
            defaultYaml={defaultContentYaml}
            clientSlug={clientSlug}
          />
        )}

        {tab === 'share' && (
          <ShareTab
            demoId={demoId}
            picked={pickedIds}
            setPicked={setPickedIds}
          />
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */

function SettingsTab(props: {
  clientName: string
  setClientName: (v: string) => void
  clientSlug: string
  setClientSlug: (v: string) => void
  storySlug: string
  setStorySlug: (v: string) => void
  status: DemoStatus
  setStatus: (v: DemoStatus) => void
  password: string
  setPassword: (v: string) => void
}) {
  return (
    <div className="grid gap-4 max-w-xl">
      <Field label="Client name">
        <input
          value={props.clientName}
          onChange={(e) => props.setClientName(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2"
        />
      </Field>
      <Field label="URL slug">
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-3">
          <span className="text-neutral-500 text-sm">/demo/</span>
          <input
            value={props.clientSlug}
            onChange={(e) => props.setClientSlug(e.target.value)}
            pattern="[a-z0-9][a-z0-9_-]{1,63}"
            className="flex-1 bg-transparent py-2 outline-none"
          />
        </div>
      </Field>
      <Field label="Story slug">
        <input
          value={props.storySlug}
          onChange={(e) => props.setStorySlug(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 font-mono"
        />
      </Field>
      <Field label="Status">
        <select
          value={props.status}
          onChange={(e) => props.setStatus(e.target.value as DemoStatus)}
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2"
        >
          <option value="draft">Draft (only admins can open)</option>
          <option value="live">Live (password gate active)</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <Field
        label="Rotate password"
        hint="Leave blank to keep current password. Rotating invalidates open sessions."
      >
        <input
          type="text"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          minLength={6}
          placeholder="At least 6 characters"
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 font-mono"
        />
      </Field>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */

function ContentTab({
  value,
  onChange,
  defaultYaml,
  clientSlug,
}: {
  value: string
  onChange: (v: string) => void
  defaultYaml: string
  clientSlug: string
}) {
  function downloadYaml() {
    // If the editor is empty, the page renders defaults — download those so
    // the file always matches what the demo route will actually serve.
    const body = value.trim().length > 0 ? value : defaultYaml
    // Ensure trailing newline so YAML pipes/heredoc consumers are happy.
    const normalized = body.endsWith('\n') ? body : body + '\n'
    const safeSlug = clientSlug.replace(/[^a-zA-Z0-9_-]/g, '_') || 'demo'
    const blob = new Blob([normalized], { type: 'text/yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeSlug}.demo.yaml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-neutral-400">
          YAML driving every section on the demo page. Any missing field falls back to the
          canonical default — sales can leave whole sections out if they want defaults.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadYaml}
            className="text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5"
            title="Download the current YAML (or defaults if the editor is empty) as a .yaml file"
          >
            ↓ Download YAML
          </button>
          <button
            type="button"
            onClick={() => {
              if (value.trim().length > 0 && !confirm('Replace current content with defaults?')) return
              onChange(defaultYaml)
            }}
            className="text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5"
          >
            Reset to default
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={defaultYaml}
        className="w-full min-h-[60vh] bg-neutral-900 border border-white/10 rounded-md p-4 font-mono text-xs leading-relaxed"
      />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */

function ShareTab({
  demoId,
  picked,
  setPicked,
}: {
  demoId: number
  picked: Set<string>
  setPicked: (s: Set<string>) => void
}) {
  const [cards, setCards] = useState<ShareCardEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/demos/${demoId}/cards`)
      .then((r) => r.json())
      .then((body: { cards?: ShareCardEntry[]; error?: string; reason?: string }) => {
        if (body.error) {
          setError(body.error)
          setCards([])
          return
        }
        setCards(body.cards ?? [])
        if (body.reason) setError(body.reason)
      })
      .catch((e) => setError(String(e)))
  }, [demoId])

  function toggle(id: string) {
    const next = new Set(picked)
    if (next.has(id)) {
      next.delete(id)
    } else {
      if (next.size >= MAX_CURATED_CARDS) return
      next.add(id)
    }
    setPicked(next)
  }

  async function triggerRender() {
    setRendering(true)
    try {
      const res = await fetch(`/api/admin/demos/${demoId}/render-share`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error ?? `HTTP ${res.status}`)
      } else {
        alert(body.mode === 'dispatched' ? 'Render dispatched' : 'Rendered locally')
      }
    } finally {
      setRendering(false)
    }
  }

  if (cards == null) return <div className="text-sm text-neutral-400">Loading cards…</div>

  return (
    <div className="space-y-4 max-w-5xl">
      {error && <p className="text-sm text-yellow-400">{error}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-neutral-400">
          Pick up to {MAX_CURATED_CARDS} cards. Each is rendered at 1:1, 3:4, and 4:3 (
          <strong>{picked.size * 3}</strong> PNGs total).
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">
            {picked.size} / {MAX_CURATED_CARDS} selected
          </span>
          <button
            onClick={triggerRender}
            disabled={rendering || picked.size === 0}
            className="bg-white/10 hover:bg-white/20 disabled:opacity-40 rounded-md px-3 py-1.5 text-xs"
          >
            {rendering ? 'Rendering…' : 'Render share assets'}
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="text-sm text-neutral-500">No cards available for this story.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c) => {
            const checked = picked.has(c.id)
            const disabled = !checked && picked.size >= MAX_CURATED_CARDS
            return (
              <label
                key={c.id}
                className={`block border rounded-lg p-3 cursor-pointer transition-colors ${
                  checked
                    ? 'border-white/40 bg-white/5'
                    : disabled
                      ? 'border-white/5 opacity-40 cursor-not-allowed'
                      : 'border-white/10 hover:border-white/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(c.id)}
                  className="sr-only"
                />
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {c.label}
                  </span>
                  <code className="text-[10px] text-neutral-600">{c.id}</code>
                </div>
                <div className="text-sm text-neutral-200 line-clamp-3">{c.preview}</div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function stableId(c: ShareCardId): string {
  const slice = c.sliceIndex ?? 0
  return `${c.parentIndex}-${c.subIndex}-${slice}-${c.variant}`
}

function parseId(id: string): ShareCardId {
  const parts = id.split('-')
  return {
    parentIndex: Number(parts[0]),
    subIndex: Number(parts[1]),
    sliceIndex: Number(parts[2]),
    variant: parts.slice(3).join('-'),
    label: parts.slice(3).join('-'),
  }
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
