'use client'

import { useEffect, useState } from 'react'
import type { FixtureRow } from '@vismay/footshorts-viz/types'
import { themes } from '@footshorts/brand'
import { registerPickerEditor, type PickerEditorProps } from '@vismay/viz-admin'
import { SHARE_IMAGE_STYLES } from '@/lib/footshortsShareStyles'
import { proxiedImage } from '../modules/shared'
import { compKeyOf, type FootshortsComposerCtx } from './ctx'

interface EntityResult {
  id: string
  type: string
  slug: string
  name: string
  crest_url: string | null
}
interface FlagOption {
  code: string
  name: string
}

const tabBtn = (on: boolean) =>
  `rounded px-2 py-1 text-[11px] ${on ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'}`

/**
 * Footshorts picker editors — the domain selectors behind the `{ kind: 'picker' }`
 * adminForm fields the `fscard:*` modules declare. Each reads options from the
 * composer `ctx` (competitions + the live data store) and the layer's sibling
 * config (e.g. a fixture picker reads `siblings.compKey`). Registered by id so
 * the shared `VizConfigForm` resolves them without any footshorts coupling.
 */

const selectCls =
  'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'
const inputCls = selectCls
const hintCls = 'text-[11px] text-neutral-600'

function asCtx(ctx: unknown): FootshortsComposerCtx | null {
  return ctx && typeof ctx === 'object' && 'competitions' in ctx ? (ctx as FootshortsComposerCtx) : null
}

function fixtureLabel(f: FixtureRow): string {
  const home = f.home?.name ?? f.home_team_name ?? 'TBD'
  const away = f.away?.name ?? f.away_team_name ?? 'TBD'
  const score =
    f.status === 'finished' && f.home_score != null && f.away_score != null
      ? ` ${f.home_score}–${f.away_score}`
      : ''
  return `${home} vs ${away}${score}`
}

function fixturesFor(ctx: FootshortsComposerCtx | null, compKey: unknown): FixtureRow[] {
  if (!ctx || typeof compKey !== 'string' || !compKey) return []
  return ctx.data.fixturesByComp[compKey] ?? []
}

function CompetitionPicker({ value, onChange, ctx }: PickerEditorProps) {
  const c = asCtx(ctx)
  return (
    <select className={selectCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select competition…</option>
      {c?.competitions.map((comp) => {
        const key = compKeyOf(comp)
        return (
          <option key={key} value={key}>
            {comp.name} · {comp.season}
          </option>
        )
      })}
    </select>
  )
}

function FixturePicker({ value, onChange, siblings, ctx }: PickerEditorProps) {
  const fixtures = fixturesFor(asCtx(ctx), siblings.compKey)
  return (
    <select className={selectCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{siblings.compKey ? 'Select fixture…' : 'Pick a competition first'}</option>
      {fixtures.map((f) => (
        <option key={f.id} value={f.id}>
          {fixtureLabel(f)}
        </option>
      ))}
    </select>
  )
}

function FixtureMultiPicker({ value, onChange, siblings, ctx }: PickerEditorProps) {
  const fixtures = fixturesFor(asCtx(ctx), siblings.compKey)
  const picked = Array.isArray(value) ? (value as string[]) : []
  const toggle = (id: string) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  if (fixtures.length === 0) return <p className={hintCls}>Pick a competition first.</p>
  return (
    <div className="mt-1 max-h-48 overflow-auto rounded-md border border-white/10 bg-neutral-900 p-1">
      {fixtures.map((f) => {
        const on = picked.includes(f.id)
        return (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] ${
              on ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'
            }`}
          >
            <input type="checkbox" checked={on} onChange={() => toggle(f.id)} />
            <span className="truncate">{fixtureLabel(f)}</span>
          </label>
        )
      })}
    </div>
  )
}

function TeamPicker({ value, onChange, siblings, ctx }: PickerEditorProps) {
  const fixtures = fixturesFor(asCtx(ctx), siblings.compKey)
  const teams = new Map<string, string>()
  for (const f of fixtures) {
    if (f.home?.slug) teams.set(f.home.slug, f.home.name)
    if (f.away?.slug) teams.set(f.away.slug, f.away.name)
  }
  const options = Array.from(teams, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return (
    <select className={selectCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{siblings.compKey ? 'Select team…' : 'Pick a competition first'}</option>
      {options.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

function StandingsGroupPicker({ value, onChange, siblings, ctx }: PickerEditorProps) {
  const c = asCtx(ctx)
  const compKey = siblings.compKey
  const rows = c && typeof compKey === 'string' ? (c.data.standingsByComp[compKey] ?? []) : []
  const groups = Array.from(
    new Set(rows.map((r) => r.group_label).filter((g): g is string => !!g)),
  ).sort((a, b) => a.localeCompare(b))
  if (groups.length === 0) return <p className={hintCls}>No groups — league table.</p>
  return (
    <select className={selectCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">All / first group</option>
      {groups.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  )
}

function NewsPicker({ value, onChange, ctx }: PickerEditorProps) {
  const c = asCtx(ctx)
  const [q, setQ] = useState('')
  const news = c?.data.news ?? []
  const filtered = q
    ? news.filter((n) => n.headline.toLowerCase().includes(q.toLowerCase()))
    : news
  return (
    <div className="flex flex-col gap-1">
      <input
        className={inputCls}
        placeholder="Search articles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select className={selectCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{`Select an article… (${filtered.length})`}</option>
        {filtered.map((n) => (
          <option key={n.id} value={n.id}>
            {n.headline.slice(0, 70)}
          </option>
        ))}
      </select>
    </div>
  )
}

function BadgePicker({ value, onChange }: PickerEditorProps) {
  const [tab, setTab] = useState<'badges' | 'flags'>('badges')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EntityResult[]>([])
  const [flags, setFlags] = useState<FlagOption[] | null>(null)
  const [flagQ, setFlagQ] = useState('')
  const [loading, setLoading] = useState(false)
  const url = typeof value === 'string' ? value : ''

  const search = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/footshorts/data/entities?q=${encodeURIComponent(q.trim())}&limit=40`)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: EntityResult[] }
      setResults(body.items ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'flags' || flags !== null) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/data/flags')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: FlagOption[] }
        if (alive) setFlags(body.items ?? [])
      } catch {
        if (alive) setFlags([])
      }
    })()
    return () => {
      alive = false
    }
  }, [tab, flags])

  const filteredFlags = (() => {
    const ql = flagQ.trim().toLowerCase()
    const list = flags ?? []
    return (ql ? list.filter((f) => f.name.toLowerCase().includes(ql)) : list).slice(0, 60)
  })()

  return (
    <div className="mt-1 flex flex-col gap-2">
      {url ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxiedImage(url)} alt="" className="h-8 w-8 object-contain" />
          <button type="button" className="text-[11px] text-neutral-400 underline" onClick={() => onChange('')}>
            change
          </button>
        </div>
      ) : null}
      <div className="flex gap-1">
        <button type="button" className={tabBtn(tab === 'badges')} onClick={() => setTab('badges')}>
          Crests
        </button>
        <button type="button" className={tabBtn(tab === 'flags')} onClick={() => setTab('flags')}>
          Flags
        </button>
      </div>
      {tab === 'badges' ? (
        <>
          <div className="flex gap-1">
            <input
              className={inputCls}
              placeholder="Search teams / leagues…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void search()}
            />
            <button type="button" className="rounded-md border border-white/10 px-2 text-[11px] text-neutral-300" onClick={() => void search()}>
              {loading ? '…' : 'Go'}
            </button>
          </div>
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
            {results
              .filter((r) => r.crest_url)
              .map((r) => (
                <button
                  key={`${r.type}:${r.slug}`}
                  type="button"
                  title={r.name}
                  className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1 hover:border-white/30"
                  onClick={() => onChange(r.crest_url!)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxiedImage(r.crest_url!)} alt={r.name} className="max-h-full max-w-full object-contain" />
                </button>
              ))}
          </div>
        </>
      ) : (
        <>
          <input
            className={inputCls}
            placeholder={flags === null ? 'Loading countries…' : 'Search country…'}
            value={flagQ}
            onChange={(e) => setFlagQ(e.target.value)}
          />
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
            {filteredFlags.map((f) => {
              const furl = `https://flagcdn.com/w320/${f.code}.png`
              return (
                <button
                  key={f.code}
                  type="button"
                  title={f.name}
                  className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1 hover:border-white/30"
                  onClick={() => onChange(furl)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={furl} alt={f.name} className="max-h-full max-w-full rounded-sm object-contain" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function AiImagePicker({ value, onChange, ctx }: PickerEditorProps) {
  const c = asCtx(ctx)
  const [subject, setSubject] = useState('')
  const [styleId, setStyleId] = useState(SHARE_IMAGE_STYLES[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dataUrl = typeof value === 'string' ? value : ''

  const generate = async () => {
    const s = subject.trim()
    if (!s) {
      setError('Describe the image.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const frame = c?.frame
      const paletteHexes = [
        frame ? themes[frame.themeName].colors.accent : '',
        frame?.accentHex ?? '',
      ].filter(Boolean)
      const res = await fetch('/api/footshorts/share/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId,
          subject: s,
          ratio: frame?.ratio ?? '1:1',
          model: 'image.default',
          paletteHexes,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      onChange(body.dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      {dataUrl ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt="" className="h-12 w-12 rounded object-cover" />
          <button type="button" className="text-[11px] text-neutral-400 underline" onClick={() => onChange('')}>
            clear
          </button>
        </div>
      ) : null}
      <textarea
        className={inputCls}
        rows={2}
        placeholder="Describe the image…"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <select className={selectCls} value={styleId} onChange={(e) => setStyleId(e.target.value)}>
        {SHARE_IMAGE_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-neutral-200 hover:bg-white/5 disabled:opacity-40"
        disabled={busy}
        onClick={() => void generate()}
      >
        {busy ? 'Generating…' : dataUrl ? 'Regenerate' : 'Generate'}
      </button>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

/** Register every footshorts picker editor by id. Idempotent (the registry just
 *  overwrites), so it's safe to call on each composer mount. */
export function registerFootshortsPickers(): void {
  registerPickerEditor('footshorts:competition', CompetitionPicker)
  registerPickerEditor('footshorts:fixture', FixturePicker)
  registerPickerEditor('footshorts:fixture-multi', FixtureMultiPicker)
  registerPickerEditor('footshorts:team', TeamPicker)
  registerPickerEditor('footshorts:standings-group', StandingsGroupPicker)
  registerPickerEditor('footshorts:news', NewsPicker)
  registerPickerEditor('footshorts:badge', BadgePicker)
  registerPickerEditor('footshorts:ai-image', AiImagePicker)
}
