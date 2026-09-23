'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DcDraftEdition } from '@vismay/content-source/dcEditions'
import {
  DC_LAYERS,
  DC_LAYER_KEYS,
  EDITION_CHART_SECTIONS,
  formatSigned,
  moodWord,
  type DcEditionSummary,
  type DcLayerKey,
  type EditionChart,
  type EditionChartSection,
  type EditionSource,
  type EditionText,
} from '@vismay/content-source/dcEditionTypes'
import { flattenText } from '@vismay/content-source/dcEditionAssembly'
import { Badge, timeAgo } from '@/components/vizmaya/pipeline/shared'

interface DraftResponse {
  draft: DcDraftEdition | null
  previewUrl: string | null
  recomposeConfigured: boolean
  composerLastRun: { status: string | null; conclusion: string | null; createdAt: string | null; url: string | null } | null
  now: string
}

interface ArchiveRow extends DcEditionSummary {
  model: string | null
  generatedAt: string | null
  publicUrl: string | null
}

type Patch = {
  headline: string
  sub: string
  notes: { metric: string; unit: string; label: string; text: string; sources: EditionSource[]; energy: boolean }[]
  layers: Record<DcLayerKey, { headline: string; sub: string; notes: { text: string; sources: EditionSource[] }[] }>
  research: { headline: string; sub: string }
}

function toPatch(d: DcDraftEdition): Patch {
  const layers = {} as Patch['layers']
  for (const k of DC_LAYER_KEYS) {
    layers[k] = { headline: d.layers[k].headline, sub: d.layers[k].sub, notes: d.layers[k].notes.map((n) => ({ text: n.text, sources: n.sources })) }
  }
  return {
    headline: d.headline,
    sub: d.sub,
    notes: d.notes.map((n) => ({ metric: n.metric ?? '', unit: n.unit ?? '', label: n.label, text: n.text, sources: n.sources, energy: n.energy })),
    layers,
    research: { headline: d.research.headline, sub: d.research.sub },
  }
}

function textOf(d: DcDraftEdition): EditionText {
  const layers = {} as EditionText['layers']
  for (const k of DC_LAYER_KEYS) layers[k] = { headline: d.layers[k].headline, sub: d.layers[k].sub, notes: d.layers[k].notes }
  return { headline: d.headline, sub: d.sub, notes: d.notes, layers, research: { headline: d.research.headline, sub: d.research.sub } }
}

const input = 'w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-white/30'

/** "chart: Bar Chart · 5 rows" or "template · <why the composer planned none>". */
function chartStatus(d: DcDraftEdition, section: EditionChartSection): string {
  const c = d.charts[section]
  if (c) return `chart ${c.spec.chartType} · ${c.spec.rows.length} rows · rung ${c.rung ?? 1} · ${c.model}`
  const skip = d.chartSkips.find((s) => s.section === section)
  const template = section === 'energy' ? 'engine vizzes' : section === 'research' ? 'scatter' : `viz ${d.layers[section].viz?.kind ?? 'none'}`
  return `template (${template})${skip ? ` — ${skip.reason}` : ''}`
}

/**
 * The planned chart as the composer rendered it (dark palette baked in — the
 * public page re-themes it; the admin is dark, so it reads as published).
 */
function ChartPreview({ chart }: { chart: EditionChart | undefined }) {
  if (!chart?.svg) return null
  return (
    <figure className="m-0 grid gap-1">
      <div className="text-xs text-neutral-300">{chart.title}</div>
      <div className="rounded-lg bg-[#161b22] p-2 [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: chart.svg }} />
      <figcaption className="text-xs text-neutral-500">
        {chart.caption} · {chart.sources.map((s) => s.name).join(', ')}
      </figcaption>
    </figure>
  )
}
// EDITION_CHART_SECTIONS is imported for parity with the composer's section order.
void EDITION_CHART_SECTIONS
const btn = 'text-sm px-3 py-1.5 rounded-lg border border-white/10 text-neutral-200 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed'
const btnPrimary = 'text-sm px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed'

export default function EditionsClient() {
  const [data, setData] = useState<DraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [patch, setPatch] = useState<Patch | null>(null)
  const [membership, setMembership] = useState<{ stories: Set<number>; papers: Set<string> } | null>(null)
  const [archive, setArchive] = useState<ArchiveRow[] | null>(null)
  const [tick, setTick] = useState(0)
  const [showDiff, setShowDiff] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const r = await fetch('/api/vizmaya/editions/draft', { cache: 'no-store' })
    const body = (await r.json().catch(() => null)) as DraftResponse | { error?: string } | null
    if (!r.ok || !body || !('draft' in body)) {
      setError((body as { error?: string } | null)?.error ?? `HTTP ${r.status}`)
      return
    }
    setData(body)
    if (body.draft) {
      setPatch(toPatch(body.draft))
      setMembership({ stories: new Set(body.draft.storyIds), papers: new Set(body.draft.paperIds) })
    } else {
      setPatch(null)
      setMembership(null)
    }
  }, [])

  const loadArchive = useCallback(async () => {
    const r = await fetch('/api/vizmaya/editions?limit=60', { cache: 'no-store' })
    const body = await r.json().catch(() => null)
    if (r.ok && body?.editions) setArchive(body.editions as ArchiveRow[])
  }, [])

  useEffect(() => {
    // Fetches resolve asynchronously; the state updates land in their callbacks.
    const t = window.setTimeout(() => {
      void load()
      void loadArchive()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load, loadArchive])

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const draft = data?.draft ?? null

  async function act(label: string, fn: () => Promise<Response>, after?: (body: Record<string, unknown>) => void) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      const r = await fn()
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!r.ok) {
        setError((body.error as string | undefined) ?? `HTTP ${r.status}`)
        return
      }
      after?.(body)
      await load()
      await loadArchive()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    patch &&
    act('save', () => fetch('/api/vizmaya/editions/draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }), () =>
      setNotice('Saved — the preview reflects the edit on refresh.'),
    )
  const publish = () =>
    confirm('Publish this draft now? A published edition can never be edited; corrections run in the next one.') &&
    act('publish', () => fetch('/api/vizmaya/editions/draft/publish', { method: 'POST' }), (b) =>
      setNotice(`Published — ${(b.publicUrl as string) ?? ''}${(b.revalidate as { ok?: boolean } | undefined)?.ok ? '' : ' (revalidate ping did not confirm; /daily refreshes within 15 minutes)'}`),
    )
  const hold = () => act('hold', () => fetch('/api/vizmaya/editions/draft/hold', { method: 'POST' }), () => setNotice('Held — auto-publish moved by 30 minutes.'))
  const regenerateCharts = () =>
    confirm('Re-plan the section charts? Prose, numbers and your edits stay; only the charts are replaced.') &&
    act('charts', () => fetch('/api/vizmaya/editions/draft/recompose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chartsOnly: true }) }), () =>
      setNotice('Chart planner dispatched — the workflow takes a minute or two; refresh to see the new charts.'),
    )
  const recompose = (clearEdits: boolean) =>
    confirm(clearEdits ? 'Recompose and DROP your edits?' : 'Recompose? Your edits are kept; the new run is appended for diffing.') &&
    act('recompose', () => fetch('/api/vizmaya/editions/draft/recompose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clearEdits }) }), () =>
      setNotice('Composer dispatched — the workflow takes a minute or two; refresh to see the new run.'),
    )
  const applyMembership = () =>
    membership &&
    act('membership', () =>
      fetch('/api/vizmaya/editions/draft/membership', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyIds: [...membership.stories], paperIds: [...membership.papers] }),
      }),
      () => setNotice('Membership applied — numbers re-derived.'),
    )

  const countdown = useMemo(() => {
    if (!draft?.autoPublishAt || tick === 0) return null
    const ms = Date.parse(draft.autoPublishAt) - tick
    if (ms <= 0) return 'due — the publish job runs at 09:00 / 09:30 UTC'
    const m = Math.floor(ms / 60_000)
    const s = Math.floor((ms % 60_000) / 1000)
    return `${m}m ${String(s).padStart(2, '0')}s`
  }, [draft?.autoPublishAt, tick])

  const sourceOptions = useMemo<EditionSource[]>(() => {
    if (!draft) return []
    const out: EditionSource[] = []
    const seen = new Set<string>()
    for (const s of [...draft.stories, ...draft.ieaStories]) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      out.push({ name: `${s.source ?? 'source'} — ${s.title.slice(0, 70)}`, url: s.url })
    }
    return out
  }, [draft])

  const diffRows = useMemo(() => {
    if (!draft) return []
    const runs = draft.composerRuns
    const prev = runs.length >= 2 ? runs[runs.length - 2] : runs.length === 1 && draft.editedFields.length > 0 ? runs[0] : null
    if (!prev) return []
    const a = flattenText(prev.text)
    const b = flattenText(textOf(draft))
    return Object.keys(b)
      .filter((k) => a[k] !== b[k])
      .map((k) => ({ path: k, before: a[k] ?? '', after: b[k] }))
  }, [draft])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Daily editions</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            The AI Data Centers daily snapshot. The composer writes a draft at 08:15 UTC; it goes public at 09:00 UTC whether or not
            anyone has looked — review is a window, not a gate. Published editions are immutable.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data?.previewUrl && (
            <a href={data.previewUrl} target="_blank" rel="noopener noreferrer" className={btn}>
              open preview ↗
            </a>
          )}
          <button type="button" onClick={() => load()} className={btnPrimary}>
            refresh
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">{error}</div>}
      {notice && <div className="px-4 py-2 text-xs border-b border-white/5 bg-emerald-950/20 text-emerald-300">{notice}</div>}

      {!data && !error && <div className="px-4 py-6 text-sm text-neutral-500">loading…</div>}

      {data && !draft && (
        <section className="px-4 py-6 border-b border-white/5">
          <p className="text-sm text-neutral-300">No draft right now — the last edition is published and the next composer run is at 08:15 UTC.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btn} disabled={!data.recomposeConfigured || busy !== null} onClick={() => recompose(false)}>
              compose now
            </button>
            {!data.recomposeConfigured && <span className="text-xs text-neutral-500 self-center">dispatch not configured on this host</span>}
          </div>
        </section>
      )}

      {data && draft && patch && membership && (
        <>
          {/* 1. Draft banner */}
          <section className="px-4 py-4 border-b border-white/5 bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium">Draft · {draft.date}</span>
              <Badge tone="accent">{draft.model ?? 'no model'}</Badge>
              <span className="text-neutral-400">
                window {draft.windowStart.slice(11, 16)} → {draft.windowEnd.slice(11, 16)} UTC
              </span>
              <span className="text-neutral-400" title={draft.generatedAt ?? ''}>
                generated {timeAgo(draft.generatedAt)} · run {draft.composerRuns.length}
              </span>
              <span className="text-neutral-400">
                {draft.counts.stories} stories · {draft.counts.papers} papers · mood {draft.moodScore == null ? '—' : `${moodWord(draft.moodScore)} ${formatSigned(draft.moodScore)}`}
              </span>
              {draft.editedFields.length > 0 && <Badge>{draft.editedFields.length} edited fields</Badge>}
              <span className={'font-mono text-xs ' + (countdown?.startsWith('due') ? 'text-amber-300' : 'text-neutral-300')}>
                auto-publish in {countdown ?? '—'}
              </span>
              {data.composerLastRun?.url && (
                <a href={data.composerLastRun.url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500 hover:text-white">
                  last workflow run: {data.composerLastRun.conclusion ?? data.composerLastRun.status} ↗
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={busy !== null} onClick={publish}>
                {busy === 'publish' ? 'publishing…' : 'Publish now'}
              </button>
              <button type="button" className={btn} disabled={busy !== null || !data.recomposeConfigured} onClick={() => recompose(false)} title={data.recomposeConfigured ? '' : 'GitHub dispatch not configured'}>
                Recompose
              </button>
              <button type="button" className={btn} disabled={busy !== null || !data.recomposeConfigured} onClick={() => recompose(true)}>
                Recompose, clear edits
              </button>
              <button type="button" className={btn} disabled={busy !== null || !data.recomposeConfigured} onClick={regenerateCharts} title="Re-plan only the section charts on this draft">
                {busy === 'charts' ? 'dispatching…' : 'Regenerate charts'}
              </button>
              <button type="button" className={btn} disabled={busy !== null || draft.holdCount >= 1} onClick={hold} title={draft.holdCount >= 1 ? 'Already held once' : 'Extend the window by 30 minutes, once'}>
                Hold 30 min{draft.holdCount >= 1 ? ' (used)' : ''}
              </button>
              {diffRows.length > 0 && (
                <button type="button" className={btn} onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? 'hide' : 'show'} diff to previous run ({diffRows.length})
                </button>
              )}
            </div>
          </section>

          {/* 4. Diff to previous run */}
          {showDiff && diffRows.length > 0 && (
            <section className="px-4 py-4 border-b border-white/5">
              <h2 className="font-medium mb-2">Diff · previous run → current text</h2>
              <div className="grid gap-2">
                {diffRows.map((r) => (
                  <div key={r.path} className="grid md:grid-cols-[180px_1fr_1fr] gap-2 text-xs border border-white/10 rounded-lg p-2">
                    <span className="font-mono text-neutral-400">{r.path}</span>
                    <span className="text-neutral-500 whitespace-pre-wrap">{r.before || '—'}</span>
                    <span className="text-neutral-100 whitespace-pre-wrap">{r.after || '—'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Preview */}
          {data.previewUrl && (
            <section className="px-4 py-4 border-b border-white/5">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-medium">Preview · as the public page will render it</h2>
                <span className="text-xs text-neutral-500">refresh after saving</span>
              </div>
              <iframe src={data.previewUrl} title="Draft preview" className="w-full h-[70vh] rounded-xl border border-white/10 bg-black" />
            </section>
          )}

          {/* 2. Editable text */}
          <section className="px-4 py-4 border-b border-white/5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">Text</h2>
              <button type="button" className={btnPrimary} disabled={busy !== null} onClick={save}>
                {busy === 'save' ? 'saving…' : 'Save edits'}
              </button>
            </div>
            <label className="block text-xs text-neutral-500">
              Headline
              <input className={input} value={patch.headline} onChange={(e) => setPatch({ ...patch, headline: e.target.value })} />
            </label>
            <label className="block text-xs text-neutral-500">
              Deck (wrap one clause in *asterisks* for emphasis)
              <textarea className={input} rows={3} value={patch.sub} onChange={(e) => setPatch({ ...patch, sub: e.target.value })} />
            </label>

            <h3 className="text-sm font-medium pt-2">Key notes</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {patch.notes.map((n, i) => (
                <div key={i} className="border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_80px_2fr] gap-2">
                    <input className={input} placeholder="metric" value={n.metric} onChange={(e) => updateNote(i, { metric: e.target.value })} />
                    <input className={input} placeholder="unit" value={n.unit} onChange={(e) => updateNote(i, { unit: e.target.value })} />
                    <input className={input} placeholder="label" value={n.label} onChange={(e) => updateNote(i, { label: e.target.value })} />
                  </div>
                  <textarea className={input} rows={4} value={n.text} onChange={(e) => updateNote(i, { text: e.target.value })} />
                  <SourcePicker options={sourceOptions} value={n.sources} onChange={(sources) => updateNote(i, { sources })} />
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
                    <input type="checkbox" checked={n.energy} onChange={(e) => updateNote(i, { energy: e.target.checked })} /> energy note
                  </label>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium pt-2">Energy chart</h3>
            <div className="border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs text-neutral-500">{chartStatus(draft, 'energy')}</div>
              <ChartPreview chart={draft.charts.energy} />
            </div>

            <h3 className="text-sm font-medium pt-2">Research chart</h3>
            <div className="border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs text-neutral-500">{chartStatus(draft, 'research')}</div>
              <ChartPreview chart={draft.charts.research} />
            </div>

            <h3 className="text-sm font-medium pt-2">Layers</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {DC_LAYER_KEYS.map((k) => (
                <div key={k} className="border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-xs text-neutral-500">
                    {DC_LAYERS[k].name} · {draft.layers[k].count} stories · {chartStatus(draft, k)}
                  </div>
                  <ChartPreview chart={draft.charts[k]} />
                  <input className={input} placeholder="headline" value={patch.layers[k].headline} onChange={(e) => updateLayer(k, { headline: e.target.value })} />
                  <textarea className={input} rows={2} placeholder="sub" value={patch.layers[k].sub} onChange={(e) => updateLayer(k, { sub: e.target.value })} />
                  {patch.layers[k].notes.map((n, i) => (
                    <div key={i} className="space-y-1">
                      <textarea className={input} rows={2} value={n.text} onChange={(e) => updateLayerNote(k, i, { text: e.target.value })} />
                      <SourcePicker
                        options={sourceOptions.filter((o) => draft.stories.some((s) => s.url === o.url && s.layer === k))}
                        value={n.sources}
                        onChange={(sources) => updateLayerNote(k, i, { sources })}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium pt-2">Research</h3>
            <input className={input} placeholder="headline" value={patch.research.headline} onChange={(e) => setPatch({ ...patch, research: { ...patch.research, headline: e.target.value } })} />
            <textarea className={input} rows={3} placeholder="sub" value={patch.research.sub} onChange={(e) => setPatch({ ...patch, research: { ...patch.research, sub: e.target.value } })} />
          </section>

          {/* 3. Membership */}
          <section className="px-4 py-4 border-b border-white/5">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <h2 className="font-medium">Membership</h2>
                <p className="text-xs text-neutral-500">Untick to drop an item from the edition (it stays in the feed). Applying re-derives every number.</p>
              </div>
              <button type="button" className={btn} disabled={busy !== null} onClick={applyMembership}>
                {busy === 'membership' ? 'applying…' : 'Apply membership'}
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ul className="divide-y divide-white/5 border border-white/10 rounded-xl max-h-[420px] overflow-y-auto">
                {draft.candidateStories.map((s) => (
                  <li key={s.id} className="px-3 py-2 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={membership.stories.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(membership.stories)
                        if (e.target.checked) next.add(s.id)
                        else next.delete(s.id)
                        setMembership({ ...membership, stories: next })
                      }}
                    />
                    <span className="min-w-0">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {s.title}
                      </a>
                      <span className="block text-xs text-neutral-500 mt-0.5">
                        {s.source ?? '—'} · {s.layer ?? 'untagged'} · {s.place ?? '—'} · {s.theme ?? '—'} · {s.mood === 1 ? 'boom' : s.mood === -1 ? 'doom' : 'neutral'}
                        {s.energy ? ' · energy' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="divide-y divide-white/5 border border-white/10 rounded-xl max-h-[420px] overflow-y-auto">
                {draft.candidatePapers.length === 0 && <li className="px-3 py-3 text-xs text-neutral-500">No papers passed the gate for this window.</li>}
                {draft.candidatePapers.map((p) => (
                  <li key={p.arxivId} className="px-3 py-2 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={membership.papers.has(p.arxivId)}
                      onChange={(e) => {
                        const next = new Set(membership.papers)
                        if (e.target.checked) next.add(p.arxivId)
                        else next.delete(p.arxivId)
                        setMembership({ ...membership, papers: next })
                      }}
                    />
                    <span className="min-w-0">
                      <a href={`https://arxiv.org/abs/${p.arxivId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {p.title}
                      </a>
                      <span className="block text-xs text-neutral-500 mt-0.5">
                        arXiv:{p.arxivId} · {p.area ?? '—'} · importance {p.importance ?? '—'} · {p.affiliations ?? p.authors ?? ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      {/* 5. Archive */}
      <section className="px-4 py-4">
        <h2 className="font-medium mb-2">Archive</h2>
        <ul className="divide-y divide-white/5">
          {(archive ?? []).map((e) => (
            <li key={e.id} className="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-mono text-xs text-neutral-500 w-24">{e.date}</span>
              <span className="font-mono text-xs text-neutral-500 w-12">{e.number != null ? `№ ${e.number}` : 'draft'}</span>
              <span className="font-medium min-w-0 flex-1 truncate" title={e.headline}>
                {e.headline || '(no headline)'}
              </span>
              <Badge tone={e.status === 'published' ? 'accent' : 'neutral'}>{e.status}</Badge>
              <span className="text-xs text-neutral-500">
                mood {e.moodScore == null ? '—' : formatSigned(e.moodScore)} · {e.counts.stories} stories · {e.counts.papers} papers
              </span>
              {e.model && <span className="font-mono text-xs text-neutral-500">{e.model}</span>}
              {e.publicUrl && (
                <a href={e.publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-400 hover:text-white">
                  open ↗
                </a>
              )}
            </li>
          ))}
          {archive && archive.length === 0 && <li className="py-6 text-sm text-neutral-500">No editions yet — apply migration 078 and run the composer.</li>}
        </ul>
      </section>
    </div>
  )

  function updateNote(i: number, part: Partial<Patch['notes'][number]>) {
    if (!patch) return
    const notes = patch.notes.map((n, j) => (j === i ? { ...n, ...part } : n))
    setPatch({ ...patch, notes })
  }
  function updateLayer(k: DcLayerKey, part: Partial<Patch['layers'][DcLayerKey]>) {
    if (!patch) return
    setPatch({ ...patch, layers: { ...patch.layers, [k]: { ...patch.layers[k], ...part } } })
  }
  function updateLayerNote(k: DcLayerKey, i: number, part: Partial<{ text: string; sources: EditionSource[] }>) {
    if (!patch) return
    const notes = patch.layers[k].notes.map((n, j) => (j === i ? { ...n, ...part } : n))
    setPatch({ ...patch, layers: { ...patch.layers, [k]: { ...patch.layers[k], notes } } })
  }
}

/** Sources are picked from the stories in the window, never typed. */
function SourcePicker({ options, value, onChange }: { options: EditionSource[]; value: EditionSource[]; onChange: (v: EditionSource[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((s) => (
        <span key={s.url} className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-sky-300 border-sky-300/20 bg-sky-300/5 flex items-center gap-1">
          {s.name}
          <button type="button" aria-label={`remove ${s.name}`} onClick={() => onChange(value.filter((v) => v.url !== s.url))} className="text-neutral-500 hover:text-white">
            ×
          </button>
        </span>
      ))}
      <select
        className="text-xs bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-neutral-300"
        value=""
        onChange={(e) => {
          const opt = options.find((o) => o.url === e.target.value)
          if (!opt || value.some((v) => v.url === opt.url)) return
          // Store the outlet name, not the picker label.
          onChange([...value, { name: opt.name.split(' — ')[0], url: opt.url }])
        }}
        aria-label="Add a source"
      >
        <option value="">+ source</option>
        {options.map((o) => (
          <option key={o.url} value={o.url}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  )
}
