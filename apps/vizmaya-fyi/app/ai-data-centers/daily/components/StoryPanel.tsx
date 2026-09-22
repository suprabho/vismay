'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DcEditionStory, DcPaper, DcPaperArea, EditionGeo } from '@vismay/content-source/dcEditionTypes'
import {
  DC_COMPUTE_BUCKETS,
  DC_LAYERS,
  DC_PAPER_AREAS,
  DC_PAPER_KINDS,
  DC_REGIONS,
  DC_THEMES,
  type DcLayerKey,
  type DcRegionKey,
  type DcThemeKey,
} from '@vismay/content-source/dcEditionTypes'
import { arxivUrl, domainOf, paperGainDetail, timeHm } from '@vismay/content-source/dcEditionAssembly'
import { PANEL_EVENT, storyMinutes } from './editionUtils'

export interface PanelData {
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  papers: DcPaper[]
  geo: EditionGeo
  layers: Record<DcLayerKey, { headline: string; sub: string }>
  fieldBaseline: Record<DcPaperArea, number>
  energyCount: number
}

interface Spec {
  eyebrow: string
  title: string
  sub: string
  body: ReactNode
}

/**
 * The slide-over panel — the one place stories are read. Every summary
 * element on the page carries a `data-panel` key (`layer:semi`,
 * `place:abilene`, `region:eu`, `paper:2609.11902`, `mood:boom`, `energy`,
 * `area:infer`); one delegated handler opens the panel, and the key also
 * lives in the URL hash (`#p=layer:semi`) so a view can be shared. A
 * `dialog` with focus management and Escape; body scroll is locked while open.
 */
export default function StoryPanel({ data }: { data: PanelData }) {
  const [spec, setSpec] = useState<Spec | null>(null)
  const [shown, setShown] = useState(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const build = useCallback((key: string): Spec | null => buildSpec(key, data), [data])

  const open = useCallback(
    (key: string, trigger?: HTMLElement | null) => {
      const next = build(key)
      if (!next) return
      lastFocus.current = trigger ?? (document.activeElement as HTMLElement | null)
      setSpec(next)
      try {
        history.replaceState(null, '', `#p=${key}`)
      } catch {
        /* ignore */
      }
    },
    [build],
  )

  const close = useCallback(() => {
    setShown(false)
    setTimeout(() => setSpec(null), 220)
    if (location.hash.startsWith('#p=')) {
      try {
        history.replaceState(null, '', location.pathname + location.search)
      } catch {
        /* ignore */
      }
    }
    lastFocus.current?.focus?.()
  }, [])

  useEffect(() => {
    if (!spec) return
    const raf = requestAnimationFrame(() => setShown(true))
    document.body.classList.add('dcd-panel-open')
    closeRef.current?.focus()
    return () => {
      cancelAnimationFrame(raf)
      document.body.classList.remove('dcd-panel-open')
    }
  }, [spec])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const link = target.closest('a[href]') as HTMLAnchorElement | null
      if (link && !link.dataset.panel) return
      const el = target.closest('[data-panel]') as HTMLElement | null
      if (!el) return
      e.preventDefault()
      open(el.dataset.panel!, el)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panelRef.current && !panelRef.current.hidden) close()
        return
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLElement) {
        const el = e.target
        if (el.matches('[role="button"][data-panel]')) {
          e.preventDefault()
          open(el.dataset.panel!, el)
        }
      }
      // Rudimentary focus trap: keep Tab inside the dialog while it is open.
      if (e.key === 'Tab' && panelRef.current && !panelRef.current.hidden) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    const onCustom = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail?.key
      if (key) open(key)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener(PANEL_EVENT, onCustom)
    // Deep link: #p=layer:semi — on load (next tick, so the first render
    // commits before the panel state changes) and on any later hash change.
    const fromHash = () => {
      const m = location.hash.match(/^#p=([\w:./-]+)$/)
      if (m) open(decodeURIComponent(m[1]))
    }
    const deep = window.setTimeout(fromHash, 0)
    window.addEventListener('hashchange', fromHash)
    return () => {
      window.clearTimeout(deep)
      window.removeEventListener('hashchange', fromHash)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(PANEL_EVENT, onCustom)
    }
  }, [open, close])

  return (
    <>
      <div className={`panel-backdrop${shown ? ' in' : ''}`} id="panel-backdrop" hidden={!spec} onClick={close} />
      <aside
        ref={panelRef}
        className={`panel${shown ? ' in' : ''}`}
        id="panel"
        hidden={!spec}
        aria-modal="true"
        role="dialog"
        aria-labelledby="panel-title"
      >
        <div className="panel-head">
          <div>
            <div className="eyebrow" id="panel-eyebrow">
              {spec?.eyebrow}
            </div>
            <h2 id="panel-title">{spec?.title}</h2>
            <p className="panel-sub" id="panel-sub">
              {spec?.sub}
            </p>
          </div>
          <button type="button" className="panel-close" id="panel-close" aria-label="Close" onClick={close} ref={closeRef}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3 3 13" />
            </svg>
          </button>
        </div>
        <div className="panel-body" id="panel-body">
          {spec?.body}
        </div>
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// Panel content

function StoryRow({ s }: { s: DcEditionStory }) {
  return (
    <div className="story">
      <div className="t">
        <a href={s.url} target="_blank" rel="noopener">
          {s.title}
        </a>
      </div>
      <span className="when">{timeHm(s.publishedAt)}</span>
      <div className="by">
        <span className="outlet">{s.source ?? domainOf(s.url)}</span>
        <span>
          {s.layer ? DC_LAYERS[s.layer].name : s.kind === 'iea' ? 'IEA' : '—'}
          {s.energy ? ' · Energy' : ''}
        </span>
        {s.tickers.map((t) => (
          <span className="tk" key={t}>
            {t}
          </span>
        ))}
        <span className="src-mini">{domainOf(s.url)} ↗</span>
      </div>
    </div>
  )
}

function listPanel(eyebrow: string, title: string, stories: DcEditionStory[], sub?: string): Spec {
  const byLayer = new Map<DcLayerKey, number>()
  for (const s of stories) if (s.layer) byLayer.set(s.layer, (byLayer.get(s.layer) ?? 0) + 1)
  const sorted = [...stories].sort((a, b) => storyMinutes(b) - storyMinutes(a))
  return {
    eyebrow,
    title,
    sub: sub ?? `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} in the 24-hour window`,
    body: (
      <>
        {byLayer.size > 1 && (
          <div className="chips panel-chips">
            {[...byLayer].map(([k, n]) => (
              <span className="chip" key={k}>
                {DC_LAYERS[k].name} {n}
              </span>
            ))}
          </div>
        )}
        {sorted.length === 0 && <p className="notice">No stories match this view.</p>}
        {sorted.map((s) => (
          <StoryRow s={s} key={`${s.kind}-${s.id}`} />
        ))}
      </>
    ),
  }
}

function paperJump(p: DcPaper) {
  return (
    <button type="button" className="paper-jump" data-panel={`paper:${p.arxivId}`} key={p.arxivId}>
      <span className="mono">{p.category ?? 'arXiv'}</span>
      {p.title}
    </button>
  )
}

function buildSpec(key: string, data: PanelData): Spec | null {
  const [kind, ...rest] = key.split(':')
  const val = rest.join(':')
  const { stories, ieaStories, papers, geo } = data
  switch (kind) {
    case 'region': {
      const r = val as DcRegionKey
      if (!DC_REGIONS[r]) return null
      return listPanel('By geography · region', DC_REGIONS[r], stories.filter((s) => s.region === r))
    }
    case 'place': {
      const p = geo.places.find((x) => x.slug === val)
      if (!p) return null
      return listPanel(`By geography · ${DC_REGIONS[p.region]}`, p.name, stories.filter((s) => s.place === val))
    }
    case 'layer': {
      const l = val as DcLayerKey
      if (!DC_LAYERS[l]) return null
      return listPanel(`By AI layer · ${DC_LAYERS[l].name}`, data.layers[l]?.headline || DC_LAYERS[l].name, stories.filter((s) => s.layer === l), data.layers[l]?.sub || undefined)
    }
    case 'mood': {
      const v = val === 'boom' ? 1 : -1
      return listPanel(
        `Doom v Boom · ${v > 0 ? 'boom side' : 'doom side'}`,
        v > 0 ? 'What pushed the needle toward Boom' : 'What pushed the needle toward Doom',
        stories.filter((s) => s.mood === v),
        v > 0 ? 'Expansion, demand, deals and capacity — scored +1 by the classifier' : 'Freezes, pauses, warnings and grid strain — scored −1 by the classifier',
      )
    }
    case 'theme': {
      const t = val as DcThemeKey
      if (!DC_THEMES[t]) return null
      return listPanel('Theme', DC_THEMES[t].name, stories.filter((s) => s.theme === t), DC_THEMES[t].so)
    }
    case 'cell': {
      const [l, r] = val.split('/') as [DcLayerKey, DcRegionKey]
      if (!DC_LAYERS[l] || !DC_REGIONS[r]) return null
      return listPanel(`${DC_LAYERS[l].name}`, DC_REGIONS[r], stories.filter((s) => s.layer === l && s.region === r), `${DC_LAYERS[l].name} stories tagged ${DC_REGIONS[r]}`)
    }
    case 'hour': {
      const h = Number(val)
      if (!Number.isInteger(h)) return null
      return listPanel('Hour', `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00 UTC`, stories.filter((s) => new Date(s.publishedAt).getUTCHours() === h))
    }
    case 'energy':
      return listPanel(
        'AI + Energy & Sustainability',
        'Energy-tagged stories',
        [...stories.filter((s) => s.energy), ...ieaStories],
        `${data.energyCount} stories · joined with iea_news from the Energy Profile epic`,
      )
    case 'paper': {
      const p = papers.find((x) => x.arxivId === val)
      if (!p) return null
      return {
        eyebrow: `New research · ${p.area ? DC_PAPER_AREAS[p.area] : 'Uncategorised'} · arXiv:${p.arxivId} · ${p.category ?? ''} · ${p.publishedAt.slice(0, 10)}`,
        title: p.title,
        sub: [p.authors, p.affiliations].filter(Boolean).join(' — '),
        body: (
          <>
            <div className="pfacts">
              <div>
                <span className="k">Headline result</span>
                <b>{paperGainDetail(p)}</b>
                <small>{p.bench ?? 'no benchmark stated'}</small>
              </div>
              <div>
                <span className="k">Scale</span>
                <b>{p.scale ?? '—'}</b>
                <small>{p.computeBucket != null ? `${DC_COMPUTE_BUCKETS[p.computeBucket]} est.` : 'compute not stated'}</small>
              </div>
              <div>
                <span className="k">Released</span>
                <b>{p.weightsReleased ? 'Weights + code' : p.codeReleased ? 'Code only' : 'Nothing yet'}</b>
                <small>{p.kind ? DC_PAPER_KINDS[p.kind] : 'affiliation not stated'}</small>
              </div>
            </div>
            {p.why && (
              <p className="paper-why">
                <b>Why it matters.</b> {p.why}
              </p>
            )}
            {p.tags.length > 0 && (
              <div className="chips panel-chips">
                {p.tags.map((t) => (
                  <span className="chip" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            <a className="src paper" href={arxivUrl(p.arxivId)} target="_blank" rel="noopener">
              arxiv.org/abs/{p.arxivId}
            </a>
            {papers.length > 1 && (
              <>
                <h3 className="panel-h3">Other papers in this edition</h3>
                {papers.filter((q) => q.arxivId !== p.arxivId).map(paperJump)}
              </>
            )}
          </>
        ),
      }
    }
    case 'area': {
      const a = val as DcPaperArea
      if (!DC_PAPER_AREAS[a]) return null
      const inArea = papers.filter((p) => p.area === a)
      return {
        eyebrow: 'New research · field',
        title: DC_PAPER_AREAS[a],
        sub: `${inArea.length} paper${inArea.length === 1 ? '' : 's'} today · ${data.fieldBaseline[a] ?? 0} per edition on average`,
        body: inArea.length ? inArea.map(paperJump) : <p className="notice">No papers in this field today.</p>,
      }
    }
    default:
      return null
  }
}
