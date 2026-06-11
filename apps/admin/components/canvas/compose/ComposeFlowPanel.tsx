'use client'

import { useEffect, useRef, useState } from 'react'
import type { ComposeState, ComposeOutlineEntry } from '@vismay/content-source/composeState'
import type { StorySource } from '@vismay/content-source/storySources'
import { composeImageFilename } from '@vismay/story-pipeline/cover'
import { canvasFrameId } from '../canvasOutputs'
import { LayoutLegend } from './LayoutPreview'
import { AngleCard } from './AngleCard'
import { ChartCard, type ChartRequirementView } from './ChartCard'
import { MaterializedSectionCard } from './MaterializedSectionCard'
import { OutlineEntryCard } from './OutlineEntryCard'
import { SourceRow } from './SourceRow'
import { Notice, SectionHeading, btnGhostCls, btnPrimaryCls, btnSuccessCls, inputCls } from './ui'

/**
 * The canvas-native compose flow. Walks the author through
 * sources → angles → outline → materialise, persisting each step to
 * compose_state via the canvas/compose routes. On materialise it reloads so the
 * Rete2 graph (or editor) re-reads the freshly-created sections.
 *
 * Two exports:
 *  - `ComposeFlow`        — the pipeline UI with no positioning of its own.
 *                           Embedded in both the canvas drawer and the editor's
 *                           "Research & outline" tab.
 *  - `ComposeFlowPanel`   — a controlled right-side drawer wrapper around it,
 *                           used on the canvas. It stays MOUNTED while open is
 *                           toggled (visibility only) so in-session research
 *                           survives close → reopen.
 */

interface ComposeFlowProps {
  slug: string
  initialState: ComposeState
  initialSources: StorySource[]
  /**
   * Toggled true by the parent when the surface is (re)shown. On a false→true
   * transition `ComposeFlow` re-pulls the sources list so async PDF extraction
   * that settled while the drawer was hidden shows up. Optional — the editor
   * tab leaves it unset (always visible).
   */
  active?: boolean
  /**
   * Signed canvas-frame iframe URLs keyed by `canvasFrameId(sectionId)` — the
   * SAME map the canvas signs. When present (canvas context) materialised
   * sections show their real render; absent (editor tab) they fall back to the
   * planned-layout schematic.
   */
  frameSrcById?: Record<string, string>
}

const base = `/api/stories`

/** How many section "Write"/"Rewrite" calls may materialise concurrently. */
const MAX_CONCURRENT_SECTIONS = 3

export function ComposeFlow({
  slug,
  initialState,
  initialSources,
  active,
  frameSrcById,
}: ComposeFlowProps) {
  const [st, setSt] = useState<ComposeState>(initialState)
  const [sources, setSources] = useState<StorySource[]>(initialSources)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [angleFeedback, setAngleFeedback] = useState('')
  const [outlineFeedback, setOutlineFeedback] = useState('')
  const [openOutline, setOpenOutline] = useState<Set<string>>(new Set())
  const [written, setWritten] = useState<Set<string>>(new Set())
  // Section writes run in their own concurrency lane (up to
  // MAX_CONCURRENT_SECTIONS at once) — the set of section ids with a write
  // in flight. The rest of the pipeline (sources/angles/outline/finish/images)
  // stays single-flight via `busy`.
  const [writing, setWriting] = useState<Set<string>>(new Set())
  const [sectionFb, setSectionFb] = useState<Record<string, string>>({})
  // Bumped per section on a successful write so its frame thumbnail reloads
  // (the page isn't reloaded between writes, so the signed URL is cache-busted).
  const [frameNonce, setFrameNonce] = useState<Record<string, number>>({})
  const [imgDone, setImgDone] = useState(0)
  // Per-chart generation outcome (id → ok), set by the batch "Generate charts"
  // step so each chart shows ✓ / ✗ after a run.
  const [chartResults, setChartResults] = useState<Record<string, boolean>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  // Chart REQUIREMENTS the outline planned (no data yet) — the batch step turns
  // these into chart_data via the source-grounded generateChart pass.
  const charts =
    ((st.storyOutline as { charts?: ChartRequirementView[] } | undefined)?.charts) ?? []

  const extracted = sources.filter((s) => s.status === 'extracted').length
  const pending = sources.filter((s) => s.status === 'pending').length

  // While a PDF is being extracted by the async vision worker its row stays
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

  // Refresh-on-reopen backstop: when the drawer is re-shown, re-pull sources so
  // anything that changed while it was hidden (e.g. a worker finishing) is in
  // sync even if polling had already stopped.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${base}/${slug}/canvas/compose/sources`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { sources?: StorySource[] }
        if (!cancelled && Array.isArray(data.sources)) setSources(data.sources)
      } catch {
        // ignore — the poll/interval covers the live case
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, slug])

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
  // Re-run extraction for a source that previously failed (or to refresh it).
  // The original file/link is retained server-side, so this re-reads it.
  async function reextract(id: string) {
    const data = await call<{ source: StorySource }>('reextract', 'sources', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (data?.source) setSources((s) => s.map((x) => (x.id === id ? data.source : x)))
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
    // Persist immediately (fire-and-forget) so the choice survives a reload
    // before the outline stage writes it through.
    fetch(`${base}/${slug}/canvas/compose/angles`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chosenAngleId: id }),
    }).catch(() => {})
  }

  // ── Outline ────────────────────────────────────────────────────────────
  async function genOutline() {
    if (!st.chosenAngleId) {
      setError('pick an angle first')
      return
    }
    const data = await call<{ outline: ComposeOutlineEntry[]; storyOutline?: unknown }>(
      'outline',
      'outline',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chosenAngleId: st.chosenAngleId,
          ...(outlineFeedback.trim() ? { feedback: outlineFeedback.trim(), previous: st.outline } : {}),
        }),
      },
    )
    if (data?.outline) {
      // Capture storyOutline too so the Charts subsection (which reads its chart
      // requirements) appears immediately, without waiting for a reload.
      setSt((s) => ({
        ...s,
        phase: 'outline',
        outline: data.outline,
        storyOutline: data.storyOutline ?? s.storyOutline,
      }))
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
  function toggleOutline(id: string) {
    setOpenOutline((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
  // Section writes don't go through `call`/`busy`: several may be in flight at
  // once (capped at MAX_CONCURRENT_SECTIONS), tracked by id in `writing`.
  async function genSection(sectionId: string) {
    // Already writing this one, or at the concurrency cap — ignore (the button
    // disabled state is the primary guard; this backstops rapid clicks).
    if (writing.has(sectionId) || writing.size >= MAX_CONCURRENT_SECTIONS) return
    const fb = sectionFb[sectionId]?.trim()
    setWriting((w) => new Set(w).add(sectionId))
    setError(null)
    try {
      const res = await fetch(`${base}/${slug}/canvas/compose/section`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sectionId, phase: 'combined', ...(fb ? { feedback: fb } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `section:${sectionId} failed`)
        return
      }
      if (data?.ok) {
        setWritten((w) => new Set(w).add(sectionId))
        setSectionFb((f) => ({ ...f, [sectionId]: '' }))
        setFrameNonce((n) => ({ ...n, [sectionId]: (n[sectionId] ?? 0) + 1 }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWriting((w) => {
        const next = new Set(w)
        next.delete(sectionId)
        return next
      })
    }
  }

  /** Signed canvas-frame URL for a materialised section, cache-busted on write. */
  function frameSrcFor(sectionId: string): string | null {
    const url = frameSrcById?.[canvasFrameId(sectionId)]
    if (!url) return null
    const v = frameNonce[sectionId]
    return v ? `${url}${url.includes('?') ? '&' : '?'}_v=${v}` : url
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
    for (const [i, p] of prompts.entries()) {
      try {
        // The filename is deterministic on the prompt's INDEX (not the success
        // count) so the cover's pre-attached `assets://` ref — computed with the
        // same helper in the pipeline — lands on this exact key.
        const res = await fetch(`${base}/${slug}/assets/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: p.prompt, aspectRatio: p.aspectRatio ?? '16:9', filename: composeImageFilename(p.section, i) }),
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

  // ── Charts: turn the outline's chart requirements into source-grounded
  // chart_data in one batch (per-chart regenerate also lives on the canvas). ──
  async function genCharts() {
    if (!charts.length || busy) return
    const data = await call<{ charts: Array<{ id: string; ok: boolean }> }>('charts', 'charts', {
      method: 'POST',
    })
    if (data?.charts) {
      setChartResults((prev) => {
        const next = { ...prev }
        for (const c of data.charts) next[c.id] = c.ok
        return next
      })
    }
  }

  const phase = st.phase
  // Accepted entries not yet materialised — what the Materialize button creates.
  const newAcceptedCount = st.outline.filter((e) => e.status === 'accepted' && !e.sectionId).length
  // STRUCTURE edits (reorder, regenerate) are only offered during the outline
  // stage of a live draft — regenerating after materialise would orphan the
  // created sections. STATUS stays togglable on not-yet-materialised entries
  // through content/visual too: materialise is incremental (it only appends
  // entries without a sectionId), so stragglers can be accepted + appended
  // later. Archived (finished) drafts are fully read-only.
  const outlineEditable = phase === 'outline' && !st.archived
  const statusEditable =
    !st.archived && (phase === 'outline' || phase === 'content' || phase === 'visual')
  const showOutline =
    st.outline.length > 0 &&
    (phase === 'outline' || phase === 'content' || phase === 'visual' || phase === 'done')

  // Which step pill lights up — visual/done are sub-states of the content stage.
  const STEPS = ['sources', 'angles', 'outline', 'content'] as const
  const stepIdx =
    phase === 'visual' || phase === 'done'
      ? STEPS.length - 1
      : STEPS.indexOf(phase as (typeof STEPS)[number])

  return (
    <div className="space-y-5">
      {error && <Notice tone="red">{error}</Notice>}

      {/* Step indicator — past steps dim to "done", the current one is sky. */}
      <ol className="flex items-center gap-1">
        {STEPS.map((p, i) => (
          <li
            key={p}
            className={`flex-1 rounded-md px-1 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider ${
              phase === 'done'
                ? 'bg-emerald-500/10 text-emerald-300/80'
                : i === stepIdx
                  ? 'bg-sky-500/20 text-sky-300'
                  : i < stepIdx
                    ? 'bg-white/10 text-neutral-400'
                    : 'bg-white/5 text-neutral-600'
            }`}
          >
            {p}
          </li>
        ))}
      </ol>

      {st.archived ? (
        <Notice tone="emerald">
          Finished — this is now a normal story. Its sources and outline are{' '}
          <span className="font-medium">retained</span> here for reference and stay
          reopenable.
        </Notice>
      ) : (
        st.attached && (
          <Notice tone="amber">
            Composing into an existing story — materialised sections are{' '}
            <span className="font-medium">appended</span>, leaving your current content untouched.
          </Notice>
        )
      )}

      {/* ── Sources ── */}
      <section className="space-y-3">
        <SectionHeading
          title="Sources"
          count={`${extracted} ready${pending > 0 ? ` · ${pending} extracting` : ''}`}
        />
        {sources.length > 0 && (
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                busy={!!busy}
                reextracting={busy === 'reextract'}
                onReextract={() => reextract(s.id)}
                onRemove={() => removeSource(s.id)}
              />
            ))}
          </ul>
        )}
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              placeholder="Paste a link…"
              className={`min-w-0 flex-1 ${inputCls}`}
            />
            <button onClick={addUrl} disabled={!!busy} className={`shrink-0 ${btnGhostCls}`}>
              Add
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or paste text"
            rows={2}
            className={`w-full resize-y ${inputCls}`}
          />
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => text.trim() && addText()} disabled={!!busy} className={`shrink-0 ${btnGhostCls}`}>
              Add text
            </button>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])}
              className="min-w-0 text-xs text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1.5 file:text-xs file:text-neutral-200 file:transition-colors hover:file:bg-white/15"
            />
          </div>
        </div>
        <button
          onClick={genAngles}
          disabled={!!busy || extracted === 0}
          className={`w-full ${btnPrimaryCls} py-2`}
        >
          {busy === 'angles' ? 'Generating angles…' : 'Generate angles →'}
        </button>
        {pending > 0 && (
          <p className="text-[11px] leading-relaxed text-amber-300/80">
            Extracting {pending} PDF{pending > 1 ? 's' : ''} with Claude — this runs in the
            background and can take a few minutes. Statuses update automatically.
          </p>
        )}
      </section>

      {/* ── Angles ── */}
      {st.angles.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <SectionHeading title="Angle" count={st.angles.length} hint="pick one to outline" />
          <div className="space-y-2">
            {st.angles.map((a) => (
              <AngleCard
                key={a.id}
                angle={a}
                selected={st.chosenAngleId === a.id}
                onPick={() => pickAngle(a.id)}
              />
            ))}
          </div>
          <input
            value={angleFeedback}
            onChange={(e) => setAngleFeedback(e.target.value)}
            placeholder="Regenerate with a note (optional)…"
            className={`w-full ${inputCls}`}
          />
          <div className="flex gap-2">
            <button onClick={genAngles} disabled={!!busy} className={`flex-1 ${btnGhostCls}`}>
              Regenerate
            </button>
            <button
              onClick={genOutline}
              disabled={!!busy || !st.chosenAngleId}
              className={`flex-1 ${btnPrimaryCls}`}
            >
              {busy === 'outline' ? 'Outlining…' : 'Generate outline →'}
            </button>
          </div>
        </section>
      )}

      {/* ── Outline ── (structure edits at the outline stage; statuses stay
          togglable on unmaterialised entries until the draft is finished, so
          stragglers can be accepted + appended later. Archived = read-only.) */}
      {showOutline && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <SectionHeading
            title="Outline"
            count={st.outline.length}
            hint={statusEditable ? 'click a status chip to accept / reject' : undefined}
          />
          {outlineEditable && (
            <LayoutLegend layouts={st.outline.map((e) => e.layout)} format={st.format} />
          )}
          <ul className="space-y-2">
            {st.outline.map((e, i) => (
              <OutlineEntryCard
                key={e.id}
                entry={e}
                index={i}
                total={st.outline.length}
                open={openOutline.has(e.id)}
                format={st.format}
                statusEditable={statusEditable}
                outlineEditable={outlineEditable}
                onCycleStatus={() => cycleStatus(e.id)}
                onToggle={() => toggleOutline(e.id)}
                onMove={(dir) => move(e.id, dir)}
              />
            ))}
          </ul>
          {outlineEditable && (
            <>
              <input
                value={outlineFeedback}
                onChange={(e) => setOutlineFeedback(e.target.value)}
                placeholder="Regenerate outline with a note (optional)…"
                className={`w-full ${inputCls}`}
              />
              <div className="flex gap-2">
                <button onClick={genOutline} disabled={!!busy} className={`flex-1 ${btnGhostCls}`}>
                  Regenerate
                </button>
                <button
                  onClick={materialize}
                  disabled={!!busy || newAcceptedCount === 0}
                  className={`flex-1 ${btnSuccessCls}`}
                >
                  {busy === 'materialize'
                    ? 'Creating…'
                    : `${st.attached ? 'Append' : 'Materialize'} ${newAcceptedCount} →`}
                </button>
              </div>
            </>
          )}
          {/* Post-materialise: stragglers accepted later get appended after the
              existing sections — materialise is incremental, nothing written is
              touched. */}
          {!outlineEditable && statusEditable && newAcceptedCount > 0 && (
            <button onClick={materialize} disabled={!!busy} className={`w-full ${btnSuccessCls}`}>
              {busy === 'materialize'
                ? 'Creating…'
                : `Append ${newAcceptedCount} new section${newAcceptedCount > 1 ? 's' : ''} →`}
            </button>
          )}
        </section>
      )}

      {/* ── Charts ── (the outline plans chart REQUIREMENTS; this generates the
          actual data, grounded in the sources. Per-chart regenerate lives on the
          canvas chart node.) */}
      {showOutline && charts.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <SectionHeading title="Charts" count={charts.length} hint="tap a chart for its full requirement" />
          <ul className="space-y-1.5">
            {charts.map((c) => (
              <ChartCard key={c.id} chart={c} result={chartResults[c.id]} />
            ))}
          </ul>
          <button onClick={genCharts} disabled={!!busy} className={`w-full ${btnGhostCls} py-2`}>
            {busy === 'charts'
              ? `Generating charts… (${charts.length})`
              : `Generate ${charts.length} chart${charts.length > 1 ? 's' : ''} → data`}
          </button>
        </section>
      )}

      {/* ── Sections: per-section CONTENT + VISUAL ── */}
      {(phase === 'content' || phase === 'visual' || phase === 'done') && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <SectionHeading
            title="Materialized sections"
            count={st.outline.filter((e) => e.sectionId).length}
            hint="what got created"
          />
          <ul className="space-y-2">
            {st.outline
              .filter((e) => e.sectionId)
              .map((e) => (
                <MaterializedSectionCard
                  key={e.id}
                  entry={e}
                  frameSrc={frameSrcFor(e.sectionId!)}
                  format={st.format}
                  written={written.has(e.sectionId!)}
                  isWriting={writing.has(e.sectionId!)}
                  atCap={writing.size >= MAX_CONCURRENT_SECTIONS}
                  busy={!!busy}
                  maxConcurrent={MAX_CONCURRENT_SECTIONS}
                  feedback={sectionFb[e.sectionId!] ?? ''}
                  onFeedbackChange={(v) => setSectionFb((f) => ({ ...f, [e.sectionId!]: v }))}
                  onWrite={() => genSection(e.sectionId!)}
                />
              ))}
          </ul>
          <div className="space-y-1.5 pt-1">
            {(st.imagePrompts?.length ?? 0) > 0 && (
              <button
                onClick={genImages}
                disabled={!!busy || writing.size > 0}
                className={`w-full ${btnGhostCls} py-2`}
              >
                {busy === 'images'
                  ? `Generating images… ${imgDone}/${st.imagePrompts!.length}`
                  : `Generate ${st.imagePrompts!.length} image(s) → Assets`}
              </button>
            )}
            <button onClick={() => window.location.reload()} className={`w-full ${btnGhostCls} py-2`}>
              Reload to view ↻
            </button>
            <button
              onClick={finish}
              disabled={!!busy || writing.size > 0}
              className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40"
            >
              {busy === 'finish' ? 'Finishing…' : 'Finish — make it a normal story'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

interface PanelProps {
  slug: string
  initialState: ComposeState
  initialSources: StorySource[]
  /** Controlled visibility. The drawer stays mounted while this toggles so the
   *  research inside survives close → reopen. */
  open: boolean
  onClose: () => void
  /** Signed canvas-frame URLs (keyed by `canvasFrameId`) so materialised
   *  sections show their real render. Passed straight through to `ComposeFlow`. */
  frameSrcById?: Record<string, string>
}

/**
 * Canvas drawer wrapper. Renders the fixed right-side panel; visibility is
 * controlled by `open` (display toggle — NOT conditional mount) so the
 * `ComposeFlow` inside keeps its state when dismissed and reopened.
 */
export function ComposeFlowPanel({
  slug,
  initialState,
  initialSources,
  open,
  onClose,
  frameSrcById,
}: PanelProps) {
  return (
    <div
      className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-white/10 bg-neutral-950/95 text-neutral-100 shadow-2xl backdrop-blur"
      style={{ display: open ? 'flex' : 'none' }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">Research &amp; outline</h2>
          <p className="truncate text-[11px] text-neutral-500">{slug}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ComposeFlow
          slug={slug}
          initialState={initialState}
          initialSources={initialSources}
          active={open}
          frameSrcById={frameSrcById}
        />
      </div>
    </div>
  )
}

export default ComposeFlowPanel
