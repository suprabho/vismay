'use client'

import { useEffect, useState } from 'react'
import type {
  ComposeOutlineEntry,
  ComposePhase,
  ComposeState,
} from '@vismay/content-source/composeState'
import type {
  StorySource,
  SourceListItem as LibrarySource,
} from '@vismay/content-source/storySources'
import { composeImageFilename } from '@vismay/story-pipeline/cover'
import type { LibraryAsset } from './SourceLibraryModal'
import { canvasFrameId } from '../canvasOutputs'
import type { ChartRequirementView } from './ChartCard'

/**
 * All compose-flow DATA state + server interactions, shared by the canvas
 * drawer and the editor's "Research & outline" tab. Stage components own their
 * FORM state (inputs, accordions, per-section feedback) — they stay mounted
 * across tab switches, so nothing typed is lost — and call back into the
 * actions here, which persist through the canvas/compose routes.
 */

const base = `/api/stories`

/** How many section "Write"/"Rewrite" calls may materialise concurrently. */
export const MAX_CONCURRENT_SECTIONS = 3

/** The four author-facing stages — also the tab ids. The visual/done phases
 *  collapse into the content stage. */
export type ComposeStage = 'sources' | 'angles' | 'outline' | 'content'

export function stageForPhase(phase: ComposePhase): ComposeStage {
  if (phase === 'content' || phase === 'visual' || phase === 'done') return 'content'
  if (phase === 'outline') return 'outline'
  if (phase === 'angles') return 'angles'
  return 'sources'
}

export interface UseComposeFlowArgs {
  slug: string
  initialState: ComposeState
  initialSources: StorySource[]
  /** Toggled true when the surface is (re)shown — triggers a sources refresh. */
  active?: boolean
  /** Signed canvas-frame iframe URLs keyed by `canvasFrameId(sectionId)`. */
  frameSrcById?: Record<string, string>
}

export function useComposeFlow({
  slug,
  initialState,
  initialSources,
  active,
  frameSrcById,
}: UseComposeFlowArgs) {
  const [st, setSt] = useState<ComposeState>(initialState)
  const [sources, setSources] = useState<StorySource[]>(initialSources)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Active stage tab — starts at the draft's current phase, advances when a
  // generate step succeeds, and is freely navigable to any unlocked stage.
  const [tab, setTab] = useState<ComposeStage>(() => stageForPhase(initialState.phase))
  const [written, setWritten] = useState<Set<string>>(new Set())
  // Section writes run in their own concurrency lane (up to
  // MAX_CONCURRENT_SECTIONS at once) — the set of section ids with a write
  // in flight. The rest of the pipeline (sources/angles/outline/images)
  // stays single-flight via `busy`.
  const [writing, setWriting] = useState<Set<string>>(new Set())
  // Bumped per section on a successful write so its frame thumbnail reloads
  // (the page isn't reloaded between writes, so the signed URL is cache-busted).
  const [frameNonce, setFrameNonce] = useState<Record<string, number>>({})
  const [imgDone, setImgDone] = useState(0)
  // Per-chart generation outcome (id → ok), set by the batch "Generate charts"
  // step so each chart shows ✓ / ✗ after a run.
  const [chartResults, setChartResults] = useState<Record<string, boolean>>({})

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
  async function addUrl(url: string): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add link', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  async function addText(text: string): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add text', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  async function addFile(file: File): Promise<boolean> {
    const form = new FormData()
    form.append('file', file)
    const data = await call<{ source: StorySource }>('upload file', 'sources', {
      method: 'POST',
      body: form,
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  // Attach an existing extracted source from another draft — the server copies
  // its text into a fresh row for this draft (snapshot, no live link).
  async function addFromSource(id: string): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add from library', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromSourceId: id }),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  // Attach a document asset from the story-assets bucket — extracted server-side
  // into a new source row (PDFs may land `pending` and settle via polling).
  async function addAsset(key: string): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add asset', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetKey: key }),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  // Pull the "from library" picker contents — prior extracted sources + doc
  // assets. Not single-flight (`call`): the modal owns its own loading state.
  async function loadLibrary(): Promise<{ sources: LibrarySource[]; assets: LibraryAsset[] }> {
    try {
      const res = await fetch(`${base}/${slug}/canvas/compose/library`, { cache: 'no-store' })
      if (!res.ok) return { sources: [], assets: [] }
      const data = (await res.json()) as { sources?: LibrarySource[]; assets?: LibraryAsset[] }
      return { sources: data.sources ?? [], assets: data.assets ?? [] }
    } catch {
      return { sources: [], assets: [] }
    }
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
  async function genAngles(feedback?: string): Promise<boolean> {
    const data = await call<{ angles: ComposeState['angles'] }>('angles', 'angles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(feedback ? { feedback, previous: st.angles } : {}),
    })
    if (data?.angles) {
      setSt((s) => ({ ...s, phase: 'angles', angles: data.angles }))
      setTab('angles')
    }
    return !!data?.angles
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
  async function genOutline(feedback?: string): Promise<boolean> {
    if (!st.chosenAngleId) {
      setError('pick an angle first')
      return false
    }
    const data = await call<{ outline: ComposeOutlineEntry[]; storyOutline?: unknown }>(
      'outline',
      'outline',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chosenAngleId: st.chosenAngleId,
          ...(feedback ? { feedback, previous: st.outline } : {}),
        }),
      },
    )
    if (data?.outline) {
      // Capture storyOutline too so the Charts panel (which reads its chart
      // requirements) appears immediately, without waiting for a reload.
      setSt((s) => ({
        ...s,
        phase: 'outline',
        outline: data.outline,
        storyOutline: data.storyOutline ?? s.storyOutline,
      }))
      setTab('outline')
    }
    return !!data?.outline
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

  // ── Sections (CONTENT + VISUAL passes) ───────────────────────────────────
  // Section writes don't go through `call`/`busy`: several may be in flight at
  // once (capped at MAX_CONCURRENT_SECTIONS), tracked by id in `writing`.
  async function genSection(sectionId: string, feedback?: string): Promise<boolean> {
    // Already writing this one, or at the concurrency cap — ignore (the button
    // disabled state is the primary guard; this backstops rapid clicks).
    if (writing.has(sectionId) || writing.size >= MAX_CONCURRENT_SECTIONS) return false
    setWriting((w) => new Set(w).add(sectionId))
    setError(null)
    try {
      const res = await fetch(`${base}/${slug}/canvas/compose/section`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sectionId,
          phase: 'combined',
          ...(feedback ? { feedback } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `section:${sectionId} failed`)
        return false
      }
      if (data?.ok) {
        setWritten((w) => new Set(w).add(sectionId))
        setFrameNonce((n) => ({ ...n, [sectionId]: (n[sectionId] ?? 0) + 1 }))
        return true
      }
      return false
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
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

  return {
    st,
    sources,
    busy,
    error,
    tab,
    setTab,
    charts,
    chartResults,
    extracted,
    pending,
    written,
    writing,
    imgDone,
    addUrl,
    addText,
    addFile,
    addFromSource,
    addAsset,
    loadLibrary,
    removeSource,
    reextract,
    genAngles,
    pickAngle,
    genOutline,
    cycleStatus,
    move,
    materialize,
    genSection,
    frameSrcFor,
    genImages,
    genCharts,
    phase,
    newAcceptedCount,
    outlineEditable,
    statusEditable,
    showOutline,
  }
}
