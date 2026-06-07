'use client'

import { useEffect, useRef, useState } from 'react'
import type { ComposeState, ComposeOutlineEntry } from '@vismay/content-source/composeState'
import type { StorySource } from '@vismay/content-source/storySources'

/**
 * The canvas-native compose flow, as an overlay on the canvas page (shown only
 * when the story has a compose_state). Walks the author through
 * sources → angles → outline → materialise, persisting each step to
 * compose_state via the canvas/compose routes. On materialise it reloads so the
 * Rete2 graph re-reads the freshly-created sections.
 */

interface Props {
  slug: string
  initialState: ComposeState
  initialSources: StorySource[]
}

const base = `/api/stories`

export function ComposeFlowPanel({ slug, initialState, initialSources }: Props) {
  const [st, setSt] = useState<ComposeState>(initialState)
  const [sources, setSources] = useState<StorySource[]>(initialSources)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [angleFeedback, setAngleFeedback] = useState('')
  const [outlineFeedback, setOutlineFeedback] = useState('')
  const [written, setWritten] = useState<Set<string>>(new Set())
  const [sectionFb, setSectionFb] = useState<Record<string, string>>({})
  const [imgDone, setImgDone] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const extracted = sources.filter((s) => s.status === 'extracted').length
  const pending = sources.filter((s) => s.status === 'pending').length

  // While a PDF is being extracted by the async Gemma worker its row stays
  // `pending`; poll the sources list until everything settles, so the statuses
  // (and the "Generate angles" gate) update without a manual reload.
  useEffect(() => {
    if (pending === 0) return
    let cancelled = false
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${base}/${slug}/canvas/compose/sources`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { sources?: StorySource[] }
        if (!cancelled && Array.isArray(data.sources)) setSources(data.sources)
      } catch {
        // transient — keep polling
      }
    }, 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pending, slug])

  async function call<T>(label: string, path: string, init: RequestInit): Promise<T | null> {
    setBusy(label)
    setError(null)
    try {
      const res = await fetch(`${base}/${slug}/canvas/compose/${path}`, init)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `${label} failed`)
        return null
      }
      return data as T
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(null)
    }
  }

  // ── Sources ────────────────────────────────────────────────────────────
  async function addUrl() {
    if (!url.trim()) return
    const data = await call<{ source: StorySource }>('add link', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    })
    if (data?.source) {
      setSources((s) => [...s, data.source])
      setUrl('')
    }
  }
  async function addText() {
    if (!text.trim()) return
    const data = await call<{ source: StorySource }>('add text', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
    if (data?.source) {
      setSources((s) => [...s, data.source])
      setText('')
    }
  }
  async function addFile(file: File) {
    const form = new FormData()
    form.append('file', file)
    const data = await call<{ source: StorySource }>('upload file', 'sources', {
      method: 'POST',
      body: form,
    })
    if (data?.source) setSources((s) => [...s, data.source])
    if (fileRef.current) fileRef.current.value = ''
  }
  async function removeSource(id: string) {
    const data = await call<{ ok: boolean }>('remove', `sources?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (data?.ok) setSources((s) => s.filter((x) => x.id !== id))
  }

  // ── Angles ─────────────────────────────────────────────────────────────
  async function genAngles() {
    const data = await call<{ angles: ComposeState['angles'] }>('angles', 'angles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        angleFeedback.trim() ? { feedback: angleFeedback.trim(), previous: st.angles } : {},
      ),
    })
    if (data?.angles) {
      setSt((s) => ({ ...s, phase: 'angles', angles: data.angles }))
      setAngleFeedback('')
    }
  }
  function pickAngle(id: string) {
    setSt((s) => ({ ...s, chosenAngleId: id }))
  }

  // ── Outline ────────────────────────────────────────────────────────────
  async function genOutline() {
    if (!st.chosenAngleId) {
      setError('pick an angle first')
      return
    }
    const data = await call<{ outline: ComposeOutlineEntry[] }>('outline', 'outline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chosenAngleId: st.chosenAngleId,
        ...(outlineFeedback.trim() ? { feedback: outlineFeedback.trim(), previous: st.outline } : {}),
      }),
    })
    if (data?.outline) {
      setSt((s) => ({ ...s, phase: 'outline', outline: data.outline }))
      setOutlineFeedback('')
    }
  }
  async function persistOutline(outline: ComposeOutlineEntry[]) {
    setSt((s) => ({ ...s, outline }))
    await call('save outline', 'outline', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outline }),
    })
  }
  function cycleStatus(id: string) {
    const order: ComposeOutlineEntry['status'][] = ['pending', 'accepted', 'rejected']
    persistOutline(
      st.outline.map((e) =>
        e.id === id ? { ...e, status: order[(order.indexOf(e.status) + 1) % 3]! } : e,
      ),
    )
  }
  function move(id: string, dir: -1 | 1) {
    const i = st.outline.findIndex((e) => e.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= st.outline.length) return
    const next = st.outline.slice()
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    persistOutline(next)
  }
  async function materialize() {
    const data = await call<{ ok: boolean }>('materialize', 'materialize', { method: 'POST' })
    if (data?.ok) window.location.reload()
  }

  async function finish() {
    const data = await call<{ ok: boolean }>('finish', 'finish', { method: 'POST' })
    if (data?.ok) window.location.reload()
  }

  // ── Sections (CONTENT + VISUAL passes) ───────────────────────────────────
  async function genSection(sectionId: string) {
    const fb = sectionFb[sectionId]?.trim()
    const data = await call<{ ok: boolean }>(`section:${sectionId}`, 'section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectionId, phase: 'combined', ...(fb ? { feedback: fb } : {}) }),
    })
    if (data?.ok) {
      setWritten((w) => new Set(w).add(sectionId))
      setSectionFb((f) => ({ ...f, [sectionId]: '' }))
    }
  }

  // ── Images: generate each imagePrompt into the story-assets bucket via the
  // existing assets route, so they're available to place in the canvas. ───────
  async function genImages() {
    const prompts = ((st.imagePrompts ?? []) as Array<{ section?: string; prompt?: string; aspectRatio?: string }>)
      .filter((p) => p.prompt)
    if (!prompts.length || busy) return
    setBusy('images')
    setError(null)
    setImgDone(0)
    let done = 0
    for (const p of prompts) {
      const slugPart =
        (p.section ?? 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'image'
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`${base}/${slug}/assets/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: p.prompt, aspectRatio: p.aspectRatio ?? '16:9', filename: `compose-${slugPart}-${done}.png` }),
        })
        if (res.ok) {
          done++
          setImgDone(done)
        } else {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? 'image generation failed')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    setBusy(null)
  }

  const phase = st.phase
  const acceptedCount = st.outline.filter((e) => e.status === 'accepted').length

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed right-3 top-3 z-50 rounded-md border border-sky-500/40 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-lg hover:border-sky-400"
      >
        Compose · {phase}
      </button>
    )
  }

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-white/10 bg-neutral-950/95 text-neutral-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Compose</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
            {phase}
          </span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-neutral-400 hover:text-neutral-200">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <ol className="flex gap-1 text-[10px] uppercase tracking-wider text-neutral-500">
          {(['sources', 'angles', 'outline', 'content'] as const).map((p) => (
            <li
              key={p}
              className={`flex-1 rounded px-1.5 py-1 text-center ${
                phase === p ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5'
              }`}
            >
              {p}
            </li>
          ))}
        </ol>

        {st.attached && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            Composing into an existing story — materialised sections are{' '}
            <span className="font-medium">appended</span>, leaving your current content untouched.
          </div>
        )}

        {/* ── Sources ── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-300">
            Sources ({extracted} ready{pending > 0 ? `, ${pending} extracting…` : ''})
          </h3>
          <ul className="space-y-1">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded border border-white/10 bg-neutral-900/50 px-2 py-1 text-xs"
              >
                <span className="min-w-0 flex-1 truncate" title={s.title ?? s.sourceUrl ?? s.filename ?? ''}>
                  {s.title ?? s.sourceUrl ?? s.filename ?? 'source'}
                </span>
                <span
                  className={
                    s.status === 'extracted'
                      ? 'text-emerald-400'
                      : s.status === 'failed'
                        ? 'text-red-400'
                        : 'text-neutral-500'
                  }
                >
                  {s.status === 'extracted' ? '✓' : s.status === 'failed' ? '✗' : '…'}
                </span>
                <button onClick={() => removeSource(s.id)} className="text-neutral-500 hover:text-red-300">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              placeholder="Paste a link…"
              className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-white/30"
            />
            <button onClick={addUrl} disabled={!!busy} className="rounded border border-white/10 px-2 py-1 text-xs hover:border-white/30 disabled:opacity-40">
              Add
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or paste text"
            rows={2}
            className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => text.trim() && addText()} disabled={!!busy} className="rounded border border-white/10 px-2 py-1 text-xs hover:border-white/30 disabled:opacity-40">
              Add text
            </button>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])}
              className="text-xs text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-neutral-200"
            />
          </div>
          <button
            onClick={genAngles}
            disabled={!!busy || extracted === 0}
            className="w-full rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-40"
          >
            {busy === 'angles' ? 'Generating angles…' : 'Generate angles →'}
          </button>
          {pending > 0 && (
            <p className="text-[11px] text-amber-300/80">
              Extracting {pending} PDF{pending > 1 ? 's' : ''} with Gemma — this runs in the
              background and can take a few minutes. Statuses update automatically.
            </p>
          )}
        </section>

        {/* ── Angles ── */}
        {st.angles.length > 0 && (
          <section className="space-y-2 border-t border-white/10 pt-3">
            <h3 className="text-xs font-medium text-neutral-300">Pick an angle</h3>
            {st.angles.map((a) => (
              <label
                key={a.id}
                className={`block cursor-pointer rounded border p-2 text-xs ${
                  st.chosenAngleId === a.id ? 'border-sky-500/60 bg-sky-500/10' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={st.chosenAngleId === a.id}
                    onChange={() => pickAngle(a.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-neutral-100">{a.title}</div>
                    <div className="mt-0.5 text-neutral-400">{a.thesis}</div>
                  </div>
                </div>
              </label>
            ))}
            <input
              value={angleFeedback}
              onChange={(e) => setAngleFeedback(e.target.value)}
              placeholder="Regenerate with a note (optional)…"
              className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-white/30"
            />
            <div className="flex gap-2">
              <button onClick={genAngles} disabled={!!busy} className="flex-1 rounded border border-white/10 px-2 py-1 text-xs hover:border-white/30 disabled:opacity-40">
                Regenerate
              </button>
              <button
                onClick={genOutline}
                disabled={!!busy || !st.chosenAngleId}
                className="flex-1 rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-40"
              >
                {busy === 'outline' ? 'Outlining…' : 'Generate outline →'}
              </button>
            </div>
          </section>
        )}

        {/* ── Outline ── */}
        {phase === 'outline' && st.outline.length > 0 && (
          <section className="space-y-2 border-t border-white/10 pt-3">
            <h3 className="text-xs font-medium text-neutral-300">
              Outline — click status to accept/reject
            </h3>
            <ul className="space-y-1">
              {st.outline.map((e, i) => (
                <li key={e.id} className="rounded border border-white/10 bg-neutral-900/50 p-2 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => cycleStatus(e.id)}
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        e.status === 'accepted'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : e.status === 'rejected'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-white/10 text-neutral-400'
                      }`}
                    >
                      {e.status}
                    </button>
                    <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">{e.heading}</span>
                    <span className="text-[10px] text-neutral-500">{e.kind}</span>
                    <button onClick={() => move(e.id, -1)} disabled={i === 0} className="text-neutral-500 hover:text-neutral-200 disabled:opacity-30">
                      ↑
                    </button>
                    <button onClick={() => move(e.id, 1)} disabled={i === st.outline.length - 1} className="text-neutral-500 hover:text-neutral-200 disabled:opacity-30">
                      ↓
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-neutral-400">{e.intent}</p>
                </li>
              ))}
            </ul>
            <input
              value={outlineFeedback}
              onChange={(e) => setOutlineFeedback(e.target.value)}
              placeholder="Regenerate outline with a note (optional)…"
              className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-white/30"
            />
            <div className="flex gap-2">
              <button onClick={genOutline} disabled={!!busy} className="flex-1 rounded border border-white/10 px-2 py-1 text-xs hover:border-white/30 disabled:opacity-40">
                Regenerate
              </button>
              <button
                onClick={materialize}
                disabled={!!busy || acceptedCount === 0}
                className="flex-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-400 disabled:opacity-40"
              >
                {busy === 'materialize'
                  ? 'Creating…'
                  : `${st.attached ? 'Append' : 'Materialize'} ${acceptedCount} →`}
              </button>
            </div>
          </section>
        )}

        {/* ── Sections: per-section CONTENT + VISUAL ── */}
        {(phase === 'content' || phase === 'visual' || phase === 'done') && (
          <section className="space-y-2 border-t border-white/10 pt-3">
            <h3 className="text-xs font-medium text-neutral-300">Write sections</h3>
            <ul className="space-y-2">
              {st.outline
                .filter((e) => e.sectionId)
                .map((e) => (
                  <li key={e.id} className="rounded border border-white/10 bg-neutral-900/50 p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">{e.heading}</span>
                      {written.has(e.sectionId!) && <span className="text-emerald-400">✓</span>}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <input
                        value={sectionFb[e.sectionId!] ?? ''}
                        onChange={(ev) => setSectionFb((f) => ({ ...f, [e.sectionId!]: ev.target.value }))}
                        placeholder={written.has(e.sectionId!) ? 'Refine note…' : 'Optional note…'}
                        className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-950 px-2 py-1 outline-none focus:border-white/30"
                      />
                      <button
                        onClick={() => genSection(e.sectionId!)}
                        disabled={!!busy}
                        className="rounded-md bg-sky-500 px-2 py-1 font-medium text-white hover:bg-sky-400 disabled:opacity-40"
                      >
                        {busy === `section:${e.sectionId}`
                          ? '…'
                          : written.has(e.sectionId!)
                            ? 'Rewrite'
                            : 'Write'}
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
            {(st.imagePrompts?.length ?? 0) > 0 && (
              <button
                onClick={genImages}
                disabled={!!busy}
                className="w-full rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/30 disabled:opacity-40"
              >
                {busy === 'images'
                  ? `Generating images… ${imgDone}/${st.imagePrompts!.length}`
                  : `Generate ${st.imagePrompts!.length} image(s) → Assets`}
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/30"
            >
              Reload canvas to view ↻
            </button>
            <button
              onClick={finish}
              disabled={!!busy}
              className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-400 disabled:opacity-40"
            >
              {busy === 'finish' ? 'Finishing…' : 'Finish — make it a normal story'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
