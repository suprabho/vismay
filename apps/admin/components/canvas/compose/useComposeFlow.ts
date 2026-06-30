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
import type { LibraryAsset, LibraryGroup } from './SourceLibraryModal'
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

/** A driver in an ingested telemetry session (for the "Add telemetry session" picker). */
export interface TelemetryDriver {
  number: number
  abbr: string
  name: string
  team: string
  teamId: string
  teamColour: string
}
/** A constructor derived from a session's driver roster. */
export interface TelemetryConstructor {
  name: string
  id: string
  colour: string
}
/** One ingested telemetry session, with its roster + constructors. */
export interface TelemetrySession {
  sessionKey: string
  label: string
  season: number
  round: number | null
  sessionType: string
  ready: boolean
  drivers: TelemetryDriver[]
  constructors: TelemetryConstructor[]
}

/** How many section "Write"/"Rewrite" calls may materialise concurrently. */
export const MAX_CONCURRENT_SECTIONS = 3

/**
 * Files larger than this go straight to storage via a signed URL instead of the
 * multipart route — Vercel rejects proxied request bodies over ~4.5 MB (413).
 * 4 MB leaves headroom under that cap.
 */
const DIRECT_UPLOAD_OVER_BYTES = 4 * 1024 * 1024
/** Hard client-side ceiling for a source file (the bucket allows up to 100 MB). */
const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024

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
      // Tolerate non-JSON bodies: a too-large upload trips Vercel's ~4.5 MB
      // request cap, which replies with plain-text "Request Entity Too Large"
      // (HTTP 413) — calling res.json() on that throws an opaque
      // "Unexpected token 'R'…". Parse defensively and surface a real message.
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          data?.error ??
            (res.status === 413
              ? `${label} failed: file too large to send through the server`
              : `${label} failed (HTTP ${res.status})`),
        )
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
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError(
        `"${file.name}" is too large (max ${Math.round(MAX_SOURCE_FILE_BYTES / 1024 / 1024)} MB)`,
      )
      return false
    }
    // Files over Vercel's ~4.5 MB request cap can't be proxied through the
    // multipart route (they 413 before the handler runs). Upload those straight
    // to storage via a signed URL; small files keep the simple multipart path.
    if (file.size > DIRECT_UPLOAD_OVER_BYTES) return addFileDirect(file)
    const form = new FormData()
    form.append('file', file)
    const data = await call<{ source: StorySource }>('upload file', 'sources', {
      method: 'POST',
      body: form,
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  // Large-file path: ask for a signed URL (creates a pending row), PUT the file
  // straight to the story-sources bucket, then trigger extraction via PATCH.
  async function addFileDirect(file: File): Promise<boolean> {
    setBusy('upload file')
    setError(null)
    try {
      const signRes = await fetch(`${base}/${slug}/canvas/compose/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signUpload: { filename: file.name, mime: file.type || 'application/octet-stream' },
        }),
      })
      const signData = await signRes.json().catch(() => null)
      if (!signRes.ok || !signData?.source || !signData?.upload?.signedUrl) {
        setError(signData?.error ?? `upload file failed (HTTP ${signRes.status})`)
        return false
      }
      const row = signData.source as StorySource
      const { signedUrl, contentType } = signData.upload as {
        signedUrl: string
        contentType: string
      }
      // Show the pending row immediately so the author sees progress.
      setSources((s) => [...s, row])

      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
        body: file,
      })
      if (!putRes.ok) {
        const pb = await putRes.json().catch(() => null)
        const error = pb?.message ?? pb?.error ?? `upload failed (HTTP ${putRes.status})`
        setError(error)
        setSources((s) => s.map((x) => (x.id === row.id ? { ...x, status: 'failed', error } : x)))
        return false
      }

      // Trigger extraction from the stored original (same path as re-extract):
      // resolves to `extracted` (LiteParse) or `pending` (vision worker; the
      // polling effect then watches it settle).
      const exRes = await fetch(`${base}/${slug}/canvas/compose/sources`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      const exData = await exRes.json().catch(() => null)
      if (exRes.ok && exData?.source) {
        setSources((s) => s.map((x) => (x.id === row.id ? (exData.source as StorySource) : x)))
        return true
      }
      setError(exData?.error ?? `extraction failed (HTTP ${exRes.status})`)
      return false
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(null)
    }
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
  // Attach a provider library item (published story, epic, …) — the server
  // extracts it to text and snapshots it as a new source row.
  async function addFromProvider(providerKey: string, itemId: string): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add from library', 'sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerKey, itemId }),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
  }
  // AI dataset research — runs a tool-using agent over the same datasets and
  // attaches a synthesised brief as a new source. Returns a result/message so
  // the modal can report "added" vs "nothing found".
  async function addEnrich(focus: string): Promise<{ ok: boolean; message?: string }> {
    const data = await call<{ ok?: boolean; source?: StorySource; message?: string }>('enrich', 'enrich', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(focus ? { focus } : {}),
    })
    if (data?.source) {
      setSources((s) => [...s, data.source!])
      return { ok: true }
    }
    return { ok: false, message: data?.message ?? 'No dataset material found.' }
  }
  // Dynamic dataset search — the large corpora (IEA/Epstein/Coke Studio) are
  // queried on demand rather than listed. Returns matching provider groups.
  async function searchDatasets(query: string): Promise<LibraryGroup[]> {
    try {
      const res = await fetch(
        `${base}/${slug}/canvas/compose/library/search?q=${encodeURIComponent(query)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return []
      const data = (await res.json()) as { groups?: LibraryGroup[] }
      return data.groups ?? []
    } catch {
      return []
    }
  }
  // Pull the "from library" picker contents — prior extracted sources, doc
  // assets, and provider groups (stories/epics). Not single-flight (`call`):
  // the modal owns its own loading state.
  async function loadLibrary(): Promise<{
    sources: LibrarySource[]
    assets: LibraryAsset[]
    groups: LibraryGroup[]
  }> {
    try {
      const res = await fetch(`${base}/${slug}/canvas/compose/library`, { cache: 'no-store' })
      if (!res.ok) return { sources: [], assets: [], groups: [] }
      const data = (await res.json()) as {
        sources?: LibrarySource[]
        assets?: LibraryAsset[]
        groups?: LibraryGroup[]
      }
      return { sources: data.sources ?? [], assets: data.assets ?? [], groups: data.groups ?? [] }
    } catch {
      return { sources: [], assets: [], groups: [] }
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
  async function genAngles(feedback?: string, focus?: 'recap'): Promise<boolean> {
    const data = await call<{ angles: ComposeState['angles'] }>('angles', 'angles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(feedback ? { feedback, previous: st.angles } : {}),
        ...(focus ? { focus } : {}),
      }),
    })
    if (data?.angles) {
      setSt((s) => ({ ...s, phase: 'angles', angles: data.angles }))
      setTab('angles')
    }
    return !!data?.angles
  }
  // "Create recap": the recap sources are already attached from the library
  // (recap-only picker); this just runs angle generation with the recap steer.
  async function createRecap(): Promise<boolean> {
    return genAngles(undefined, 'recap')
  }

  // ── F1 telemetry source (vizf1 only) ─────────────────────────────────────
  // List the ingested telemetry sessions (+ their drivers/constructors) for the
  // "Add telemetry session" picker. This route lives outside the per-story
  // compose namespace, so it's a direct fetch rather than `call`.
  async function loadTelemetrySessions(): Promise<TelemetrySession[]> {
    try {
      const res = await fetch('/api/vizf1/telemetry/sessions', { cache: 'no-store' })
      if (!res.ok) return []
      const data = (await res.json()) as { sessions?: TelemetrySession[] }
      return data.sessions ?? []
    } catch {
      return []
    }
  }
  // Build a focused telemetry brief server-side and attach it as a text source.
  async function createTelemetrySource(opts: {
    sessionKey: string
    driverNumbers?: number[]
    constructors?: string[]
    prompt?: string
  }): Promise<boolean> {
    const data = await call<{ source: StorySource }>('add telemetry', 'telemetry-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
    })
    if (data?.source) setSources((s) => [...s, data.source])
    return !!data?.source
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

  // Re-plan ONE chart's REQUIREMENT (its prompt), optionally with a note. The
  // server regenerates the chartType/title/axes + "what to plot" and persists it
  // into storyOutline.charts; mirror the new requirement into local state so the
  // card updates without a reload. This re-plans the chart — its DATA is then
  // regenerated via "Generate charts" (or the canvas node).
  async function regenChartPrompt(id: string, feedback?: string): Promise<boolean> {
    const data = await call<{ chart: ChartRequirementView }>(`chart:${id}`, 'charts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...(feedback ? { feedback } : {}) }),
    })
    if (!data?.chart) return false
    setSt((s) => {
      const outline = (s.storyOutline ?? null) as { charts?: ChartRequirementView[] } | null
      if (!outline?.charts) return s
      return {
        ...s,
        storyOutline: {
          ...outline,
          charts: outline.charts.map((c) => (c.id === id ? data.chart : c)),
        },
      }
    })
    // The persisted data (if any) is now stale relative to the new plan — clear
    // its ✓/✗ so the author knows to regenerate it.
    setChartResults((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    return true
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
    addFromProvider,
    loadLibrary,
    searchDatasets,
    addEnrich,
    removeSource,
    reextract,
    genAngles,
    createRecap,
    loadTelemetrySessions,
    createTelemetrySource,
    pickAngle,
    genOutline,
    cycleStatus,
    move,
    materialize,
    genSection,
    frameSrcFor,
    genImages,
    genCharts,
    regenChartPrompt,
    phase,
    newAcceptedCount,
    outlineEditable,
    statusEditable,
    showOutline,
  }
}
