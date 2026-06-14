'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FixtureRow, StandingRow } from '@vismay/footshorts-viz/types'
import { themes } from '@footshorts/brand'
import type { ThemeName } from '@footshorts/brand'
import { ShareCardCanvas } from './ShareCardCanvas'
import { useCapture } from './useCapture'
import {
  ASPECT_RATIOS,
  CARD_TYPES,
  MATCH_STYLES,
  OUTPUT_SIZE,
  RENDER_SCALE,
  type AspectRatio,
  type CardContent,
  type CardType,
  type MatchStyle,
  type NewsItem,
} from './types'
import { SHARE_IMAGE_STYLES, type ShareImageModel } from '@/lib/footshortsShareStyles'

interface CompetitionOption {
  slug: string
  name: string
  season: string
  hasStandings: boolean
  hasFixtures: boolean
}

const THEME_NAMES: ThemeName[] = ['classic', 'pitch', 'terrace']
const PREVIEW_MAX_W = 360
const PREVIEW_MAX_H = 540

/** Rows that fit a ratio without clipping the standings table. */
function maxStandingsRows(ratio: AspectRatio): number {
  if (ratio === '9:16') return 14
  if (ratio === '3:4' || ratio === '4:5') return 12
  if (ratio === '1:1') return 9
  return 7 // 5:4, 4:3 landscape
}

export function ShareCardCreator({
  initialCompetitions,
}: {
  initialCompetitions: CompetitionOption[]
}) {
  const [cardType, setCardType] = useState<CardType>('match')
  const [themeName, setThemeName] = useState<ThemeName>('classic')
  const [ratio, setRatio] = useState<AspectRatio>('1:1')
  const [accentHex, setAccentHex] = useState<string>('')
  const [handle, setHandle] = useState<string>('@footshorts')

  const competitions = initialCompetitions
  const [compKey, setCompKey] = useState<string>(
    initialCompetitions[0] ? `${initialCompetitions[0].slug}::${initialCompetitions[0].season}` : '',
  )
  const selectedComp = useMemo(
    () => competitions.find((c) => `${c.slug}::${c.season}` === compKey) ?? null,
    [competitions, compKey],
  )

  // ── data state ────────────────────────────────────────────────────────────
  const [standings, setStandings] = useState<StandingRow[] | null>(null)
  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null)
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pickedFixtureId, setPickedFixtureId] = useState<string>('')
  const [matchStyle, setMatchStyle] = useState<MatchStyle>('tile')
  const [pickedTeamSlug, setPickedTeamSlug] = useState<string>('')
  const [pickedNewsId, setPickedNewsId] = useState<string>('')

  // ── AI state ──────────────────────────────────────────────────────────────
  const [aiSubject, setAiSubject] = useState<string>('')
  const [aiStyleId, setAiStyleId] = useState<string>(SHARE_IMAGE_STYLES[0]!.id)
  const [aiModel, setAiModel] = useState<ShareImageModel>('image.default')
  const [aiCaption, setAiCaption] = useState<string>('')
  const [aiDataUrl, setAiDataUrl] = useState<string>('')
  const [aiRefImage, setAiRefImage] = useState<string>('') // reference image data URL
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const needsStandings = cardType === 'standings'
  const needsFixtures = cardType === 'match' || cardType === 'form'
  const needsNews = cardType === 'news-image' || cardType === 'news-article'

  // Fetch competition-scoped data when the type/competition changes.
  useEffect(() => {
    if (!selectedComp || (!needsStandings && !needsFixtures)) return
    let alive = true
    setLoading(true)
    setError(null)
    const qs = `competition=${encodeURIComponent(selectedComp.slug)}&season=${encodeURIComponent(selectedComp.season)}`
    void (async () => {
      try {
        if (needsStandings) {
          const res = await fetch(`/api/footshorts/data/standings?${qs}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: StandingRow[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (alive) setStandings(body.rows ?? [])
        } else {
          const res = await fetch(`/api/footshorts/data/fixtures?${qs}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: FixtureRow[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (alive) {
            setFixtures(body.rows ?? [])
            setPickedFixtureId('')
            setPickedTeamSlug('')
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedComp, needsStandings, needsFixtures])

  // Fetch recent news once it's needed.
  useEffect(() => {
    if (!needsNews || news !== null) return
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/data/news?limit=40')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: NewsItem[]; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (alive) setNews(body.items ?? [])
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load news')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [needsNews, news])

  // Teams available for the form picker, derived from the loaded fixtures.
  const teamOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of fixtures ?? []) {
      if (f.home?.slug) map.set(f.home.slug, f.home.name)
      if (f.away?.slug) map.set(f.away.slug, f.away.name)
    }
    return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [fixtures])

  // ── build the card content from the current selection ───────────────────────
  const content: CardContent | null = useMemo(() => {
    const compName = selectedComp?.name ?? ''
    if (cardType === 'match') {
      const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
      if (!fixture) return null
      return { type: 'match', fixture, competitionName: compName, style: matchStyle }
    }
    if (cardType === 'standings') {
      if (!standings || standings.length === 0) return null
      return {
        type: 'standings',
        rows: standings.slice(0, maxStandingsRows(ratio)),
        competitionName: compName,
        season: selectedComp?.season ?? '',
      }
    }
    if (cardType === 'form') {
      if (!pickedTeamSlug || !fixtures) return null
      const teamName = teamOptions.find((t) => t.slug === pickedTeamSlug)?.name ?? pickedTeamSlug
      const teamFixtures = fixtures
        .filter(
          (f) =>
            (f.home?.slug === pickedTeamSlug || f.away?.slug === pickedTeamSlug) &&
            f.status === 'finished',
        )
        .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
        .slice(-5)
      if (teamFixtures.length === 0) return null
      return { type: 'form', fixtures: teamFixtures, teamSlug: pickedTeamSlug, teamName }
    }
    if (cardType === 'news-image' || cardType === 'news-article') {
      const item = news?.find((n) => n.id === pickedNewsId)
      if (!item) return null
      return cardType === 'news-image'
        ? { type: 'news-image', item }
        : { type: 'news-article', item }
    }
    // ai-image
    if (!aiDataUrl) return null
    return { type: 'ai-image', dataUrl: aiDataUrl, caption: aiCaption }
  }, [
    cardType,
    fixtures,
    standings,
    news,
    pickedFixtureId,
    matchStyle,
    pickedTeamSlug,
    pickedNewsId,
    selectedComp,
    ratio,
    teamOptions,
    aiDataUrl,
    aiCaption,
  ])

  const eyebrow = useMemo(() => {
    if (cardType === 'news-image' || cardType === 'news-article') {
      const item = news?.find((n) => n.id === pickedNewsId)
      return item?.publisher ?? 'News'
    }
    return selectedComp?.name ?? null
  }, [cardType, news, pickedNewsId, selectedComp])

  // ── capture / preview ───────────────────────────────────────────────────────
  const captureRef = useRef<HTMLDivElement>(null)
  const out = OUTPUT_SIZE[ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)
  const pixelRatio = out.w / renderW
  const bgHex = themes[themeName].colors.bg
  const { download } = useCapture(captureRef, {
    width: renderW,
    height: renderH,
    pixelRatio,
    backgroundColor: bgHex,
  })

  const previewScale = Math.min(PREVIEW_MAX_W / renderW, PREVIEW_MAX_H / renderH, 1)

  const [downloading, setDownloading] = useState(false)
  const handleDownload = useCallback(async () => {
    if (!content) return
    setDownloading(true)
    try {
      await download(`footshorts-${cardType}-${ratio.replace(':', 'x')}.png`)
    } finally {
      setDownloading(false)
    }
  }, [content, download, cardType, ratio])

  // ── AI generation ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const subject = aiSubject.trim()
    if (!subject) {
      setAiError('Describe what to generate.')
      return
    }
    setAiBusy(true)
    setAiError(null)
    try {
      const paletteHexes = [themes[themeName].colors.accent, accentHex].filter(Boolean)
      const res = await fetch('/api/footshorts/share/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId: aiStyleId,
          subject,
          ratio,
          model: aiModel,
          paletteHexes,
          ...(aiRefImage ? { referenceImage: aiRefImage } : {}),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      setAiDataUrl(body.dataUrl)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setAiBusy(false)
    }
  }, [aiSubject, aiStyleId, aiModel, ratio, themeName, accentHex, aiRefImage])

  const onPickReference = useCallback((file: File | null) => {
    if (!file) {
      setAiRefImage('')
      return
    }
    if (!file.type.startsWith('image/')) {
      setAiError('Reference must be an image.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAiRefImage(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => setAiError('Could not read that image.')
    reader.readAsDataURL(file)
  }, [])

  const labelCls = 'block text-[11px] font-medium text-neutral-400'
  const selectCls =
    'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="w-full shrink-0 space-y-4 lg:w-80">
        {/* Card type */}
        <div>
          <span className={labelCls}>Card type</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {CARD_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setCardType(t.id)}
                className={`rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                  cardType === t.id
                    ? 'border-white/30 bg-white/10 text-neutral-100'
                    : 'border-white/10 text-neutral-400 hover:bg-white/5'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Competition (data cards) */}
        {(needsStandings || needsFixtures) && (
          <label className={labelCls}>
            Competition
            <select value={compKey} onChange={(e) => setCompKey(e.target.value)} className={selectCls}>
              {competitions.length === 0 && <option value="">No ingested data</option>}
              {competitions.map((c) => (
                <option key={`${c.slug}::${c.season}`} value={`${c.slug}::${c.season}`}>
                  {c.name} · {c.season}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
            {error}
          </p>
        )}
        {loading && <p className="text-[11px] text-neutral-500">Loading…</p>}

        {/* Match: fixture picker */}
        {cardType === 'match' && fixtures && (
          <label className={labelCls}>
            Fixture
            <select
              value={pickedFixtureId}
              onChange={(e) => setPickedFixtureId(e.target.value)}
              className={selectCls}
            >
              <option value="">Select a fixture…</option>
              {fixtures.map((f) => {
                const home = f.home?.name ?? f.home_team_name ?? 'TBD'
                const away = f.away?.name ?? f.away_team_name ?? 'TBD'
                const score =
                  f.status === 'finished' && f.home_score != null
                    ? ` (${f.home_score}–${f.away_score})`
                    : ''
                return (
                  <option key={f.id} value={f.id}>
                    {home} vs {away}
                    {score}
                  </option>
                )
              })}
            </select>
          </label>
        )}

        {/* Match: tile vs editorial card layout */}
        {cardType === 'match' && (
          <label className={labelCls}>
            Style
            <select
              value={matchStyle}
              onChange={(e) => setMatchStyle(e.target.value as MatchStyle)}
              className={selectCls}
            >
              {MATCH_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Form: team picker */}
        {cardType === 'form' && (
          <label className={labelCls}>
            Team
            <select
              value={pickedTeamSlug}
              onChange={(e) => setPickedTeamSlug(e.target.value)}
              className={selectCls}
            >
              <option value="">Select a team…</option>
              {teamOptions.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* News picker */}
        {needsNews && news && (
          <label className={labelCls}>
            Article
            <select value={pickedNewsId} onChange={(e) => setPickedNewsId(e.target.value)} className={selectCls}>
              <option value="">Select an article…</option>
              {news.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.headline.slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* AI controls */}
        {cardType === 'ai-image' && (
          <div className="space-y-2.5 rounded-lg border border-white/10 bg-neutral-950/60 p-3">
            <textarea
              value={aiSubject}
              onChange={(e) => setAiSubject(e.target.value)}
              rows={3}
              placeholder="e.g. a lone striker celebrating under floodlights"
              className="w-full resize-vertical rounded border border-white/10 bg-neutral-950 p-2 text-[12px] text-neutral-100 outline-none focus:border-white/30"
            />
            <div>
              <span className={labelCls}>Style</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {SHARE_IMAGE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setAiStyleId(s.id)}
                    title={s.hint}
                    className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      aiStyleId === s.id
                        ? 'border-white/30 bg-white/10 text-neutral-100'
                        : 'border-white/10 text-neutral-400 hover:bg-white/5'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <label className={labelCls}>
              Model
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as ShareImageModel)}
                className={selectCls}
              >
                <option value="image.default">Default (Gemini 3 Pro Image)</option>
                <option value="image.seedream">Seedream (cheap)</option>
              </select>
            </label>
            {/* Reference image (image-to-image, default model only) */}
            <div>
              <span className={labelCls}>Reference image (optional)</span>
              {aiRefImage ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-white/10 bg-neutral-950 p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={aiRefImage} alt="" className="h-12 w-12 rounded object-cover" />
                  <span className="flex-1 text-[11px] text-neutral-400">
                    Guides the generation. Uses the default model.
                  </span>
                  <button
                    onClick={() => setAiRefImage('')}
                    className="rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickReference(e.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-neutral-100 hover:file:bg-white/20"
                />
              )}
            </div>
            <input
              value={aiCaption}
              onChange={(e) => setAiCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
            />
            <button
              onClick={() => void handleGenerate()}
              disabled={aiBusy || !aiSubject.trim()}
              className="w-full rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
            >
              {aiBusy ? 'Generating…' : aiDataUrl ? 'Regenerate' : 'Generate'}
            </button>
            {aiError && <p className="text-[11px] text-red-400">{aiError}</p>}
          </div>
        )}

        <hr className="border-white/10" />

        {/* Theme + ratio + accent */}
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Theme
            <select
              value={themeName}
              onChange={(e) => setThemeName(e.target.value as ThemeName)}
              className={selectCls}
            >
              {THEME_NAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Format
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as AspectRatio)}
              className={selectCls}
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Accent (hex)
            <input
              value={accentHex}
              onChange={(e) => setAccentHex(e.target.value)}
              placeholder="#00D26A"
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
            />
          </label>
          <label className={labelCls}>
            Handle
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
            />
          </label>
        </div>

        <button
          onClick={() => void handleDownload()}
          disabled={!content || downloading}
          className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {downloading ? 'Rendering…' : 'Download PNG'}
        </button>
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 items-start justify-center rounded-xl border border-white/10 bg-neutral-950/40 p-6">
        {content ? (
          <div
            style={{
              width: renderW * previewScale,
              height: renderH * previewScale,
            }}
          >
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <ShareCardCanvas
                ref={captureRef}
                content={content}
                frame={{ themeName, ratio, accentHex: accentHex || null, eyebrow, handle }}
              />
            </div>
          </div>
        ) : (
          <p className="py-20 text-center text-xs text-neutral-600">
            Pick a {CARD_TYPES.find((t) => t.id === cardType)?.label.toLowerCase()} to preview a card.
          </p>
        )}
      </div>
    </div>
  )
}
