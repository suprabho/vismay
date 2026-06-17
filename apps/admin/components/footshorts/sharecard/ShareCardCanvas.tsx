'use client'

import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import {
  MatchCard,
  MatchRow,
  MatchTile,
  StandingsTable,
  TeamFormStrip,
  type MatchCardConfig,
  type MatchCardLayout,
} from '@vismay/footshorts-viz/web'
import type { FixtureRow } from '@vismay/footshorts-viz/types'
import { themes, themeToVars } from '@footshorts/brand'
import { FootshortsLogo } from './FootshortsLogo'
import {
  OUTPUT_SIZE,
  RENDER_SCALE,
  type CardContent,
  type CardFrameConfig,
  type LogoSize,
  type LogoVariant,
  type MatchStyle,
  type Overlay,
} from './types'

/** Route a remote image through the same-origin proxy so html-to-image can
 *  rasterize it without a cross-origin taint. */
function proxiedImage(url: string): string {
  return `/api/footshorts/share/proxy-image?url=${encodeURIComponent(url)}`
}

function proxyCrest(url: string | null | undefined): string | null {
  return url ? proxiedImage(url) : (url ?? null)
}

/** Clone a fixture with its crest URLs proxied — the viz components (MatchTile /
 *  TeamFormStrip) read `crest_url` directly, so capture taints without this. */
function withProxiedFixtureCrests(f: FixtureRow): FixtureRow {
  return {
    ...f,
    home: f.home ? { ...f.home, crest_url: proxyCrest(f.home.crest_url) } : f.home,
    away: f.away ? { ...f.away, crest_url: proxyCrest(f.away.crest_url) } : f.away,
  }
}

/** Deterministic UTC kickoff label (no locale dependence) — "Sat · 17:30". */
function kickoffLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} · ${hh}:${mm}`
}

const CARD_LAYOUT: Record<Exclude<MatchStyle, 'tile'>, MatchCardLayout> = {
  'card-horizontal': 'horizontal',
  'card-portrait': 'portrait',
  'card-score': 'score',
}

/** Build an `fs:match-card` config from a fixture, carrying real crests (proxied
 *  for clean capture) and brand colors so the editorial card themes itself. */
function fixtureToMatchCardConfig(
  fixture: FixtureRow,
  layout: MatchCardLayout,
  competition: string,
): MatchCardConfig {
  const finished =
    fixture.status === 'finished' && fixture.home_score != null && fixture.away_score != null
  return {
    type: 'fs:match-card',
    layout,
    home: fixture.home?.name ?? fixture.home_team_name ?? 'TBD',
    away: fixture.away?.name ?? fixture.away_team_name ?? 'TBD',
    score: finished ? `${fixture.home_score}–${fixture.away_score}` : undefined,
    kickoff: finished ? 'FT' : kickoffLabel(fixture.kickoff_at),
    competition,
    competitionSlug: fixture.competition_slug,
    homeColor: fixture.home?.primary_color ?? undefined,
    awayColor: fixture.away?.primary_color ?? undefined,
    homeCrestUrl: fixture.home?.crest_url ? proxiedImage(fixture.home.crest_url) : undefined,
    awayCrestUrl: fixture.away?.crest_url ? proxiedImage(fixture.away.crest_url) : undefined,
  }
}

/** "#RRGGBB" / "#RGB" → "R G B" channels for the `--sf-color-*` runtime vars. */
function hexToChannels(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return null
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

const LOGO_PX: Record<LogoSize, number> = { sm: 22, md: 30, lg: 42 }

/** Wordmark color treatment for the brand mark. The badge itself keeps its real
 *  brand colors; only the "Footshorts" wordmark recolors per variant. */
function wordmarkColor(variant: LogoVariant): string {
  switch (variant) {
    case 'light':
      return '#FFFFFF'
    case 'dark':
      return '#0B0B0F'
    case 'mark':
    case 'accent':
    default:
      return 'var(--sf-color-text)'
  }
}

/** The real Footshorts brand mark (the coral badge + green ball) plus the
 *  wordmark — sized per the frame config; wordmark recolored per variant. */
function BrandMark({ size, variant }: { size: LogoSize; variant: LogoVariant }) {
  const px = LOGO_PX[size]
  return (
    <span className="flex items-center gap-1.5">
      <FootshortsLogo size={px} knockout={variant === 'light'} />
      {variant !== 'mark' && (
        <span
          className="font-bold tracking-tight"
          style={{ color: wordmarkColor(variant), fontSize: px * 0.46 }}
        >
          Footshorts
        </span>
      )}
    </span>
  )
}

function Header({
  eyebrow,
  logoSize,
  logoVariant,
}: {
  eyebrow?: string | null
  logoSize: LogoSize
  logoVariant: LogoVariant
}) {
  return (
    <div className="flex shrink-0 items-center justify-between px-5 pt-5">
      <span className="truncate text-[13px] font-bold uppercase tracking-[1.6px] text-muted">
        {eyebrow ?? ' '}
      </span>
      <BrandMark size={logoSize} variant={logoVariant} />
    </div>
  )
}

function Footer({ handle }: { handle: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-5 pb-5 pt-2">
      <span className="text-[12px] font-medium text-muted">{handle}</span>
      <span className="h-1.5 w-10 rounded-full bg-accent" />
    </div>
  )
}

// ── card bodies ───────────────────────────────────────────────────────────────

function MatchBody({ content }: { content: Extract<CardContent, { type: 'match' }> }) {
  const caption = (
    <div className="text-center text-[15px] font-semibold uppercase tracking-wide text-muted">
      {content.competitionName}
    </div>
  )
  if (content.style === 'tile') {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-4">
        {caption}
        <div className="w-full">
          <MatchTile fixture={withProxiedFixtureCrests(content.fixture)} />
        </div>
      </div>
    )
  }
  const config = fixtureToMatchCardConfig(
    content.fixture,
    CARD_LAYOUT[content.style],
    content.competitionName,
  )
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-3 py-2">
      <MatchCard config={config} />
    </div>
  )
}

function FixturesBody({ content }: { content: Extract<CardContent, { type: 'fixtures' }> }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3">
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">
        {content.competitionName}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {content.fixtures.map((f) => (
          <MatchRow key={f.id} fixture={withProxiedFixtureCrests(f)} variant={content.variant} />
        ))}
      </div>
    </div>
  )
}

function StandingsBody({ content }: { content: Extract<CardContent, { type: 'standings' }> }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3">
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">
        {content.competitionName} · {content.groupLabel || content.season}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <StandingsTable
          rows={content.rows.map((r) =>
            r.team ? { ...r, team: { ...r.team, crest_url: proxyCrest(r.team.crest_url) } } : r,
          )}
        />
      </div>
    </div>
  )
}

function FormBody({ content }: { content: Extract<CardContent, { type: 'form' }> }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center px-4">
      <TeamFormStrip
        fixtures={content.fixtures.map(withProxiedFixtureCrests)}
        teamId={content.teamSlug}
        label={`${content.teamName} · last 5`}
        layout="grid"
        columns={5}
        rows={1}
      />
    </div>
  )
}

function NewsImageBody({ content }: { content: Extract<CardContent, { type: 'news-image' }> }) {
  const { item } = content
  return item.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxiedImage(item.image_url)}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  ) : (
    <div className="absolute inset-0 bg-surface" />
  )
}

/**
 * Caption shown at the bottom of a bleed card — sits ABOVE the footer (rendered
 * in the same gradient group) so the headline never collides with the branding.
 */
function BleedCaption({ content, color }: { content: CardContent; color: string }) {
  if (content.type === 'news-image') {
    const { item } = content
    return (
      <div className="px-4 pb-1 pt-3">
        {item.publisher ? (
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide" style={{ color, opacity: 0.7 }}>
            {item.publisher}
          </div>
        ) : null}
        <div className="text-[19px] font-bold leading-tight" style={{ color }}>
          {item.headline}
        </div>
      </div>
    )
  }
  if (content.type === 'ai-image' && content.caption) {
    return (
      <div className="px-4 pb-1 pt-3">
        <div className="text-[20px] font-bold leading-tight" style={{ color }}>
          {content.caption}
        </div>
      </div>
    )
  }
  return null
}

function NewsArticleBody({ content }: { content: Extract<CardContent, { type: 'news-article' }> }) {
  const { item } = content
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3 px-5">
      {item.publisher ? (
        <div className="text-[13px] font-bold uppercase tracking-[1.4px] text-accent">
          {item.publisher}
        </div>
      ) : null}
      <div className="text-[26px] font-extrabold leading-[1.15] text-text">{item.headline}</div>
      {item.summary ? (
        <p className="line-clamp-6 text-[15px] leading-relaxed text-muted">{item.summary}</p>
      ) : null}
    </div>
  )
}

function AiImageBody({ content }: { content: Extract<CardContent, { type: 'ai-image' }> }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={content.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
  )
}

function CardBody({ content }: { content: CardContent }) {
  switch (content.type) {
    case 'match':
      return <MatchBody content={content} />
    case 'fixtures':
      return <FixturesBody content={content} />
    case 'standings':
      return <StandingsBody content={content} />
    case 'form':
      return <FormBody content={content} />
    case 'news-image':
      return <NewsImageBody content={content} />
    case 'news-article':
      return <NewsArticleBody content={content} />
    case 'ai-image':
      return <AiImageBody content={content} />
  }
}

/** Badge overlays placed on the card (crests / logos / flags). Display-only and
 *  proxied for capture; drag/resize is handled by the editor over the preview. */
function OverlayLayer({ overlays }: { overlays: Overlay[] }) {
  if (overlays.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {overlays.map((o) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={o.id}
          src={proxiedImage(o.url)}
          alt=""
          className="absolute object-contain"
          style={{
            left: `${o.xPct}%`,
            top: `${o.yPct}%`,
            width: `${o.widthPct}%`,
            transform: 'translate(-50%, -50%)',
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
          }}
        />
      ))}
    </div>
  )
}

interface Props {
  content: CardContent
  frame: CardFrameConfig
  overlays?: Overlay[]
}

/**
 * The on-brand card surface. Sets the footshorts theme via `themeToVars` (so the
 * brand color utilities the viz components use resolve), sizes itself to the
 * chosen ratio's render dimensions, and exposes the capture node via ref. News-
 * image / AI bodies bleed to the frame edges; data bodies sit inside the
 * header/footer chrome.
 */
export const ShareCardCanvas = forwardRef<HTMLDivElement, Props>(function ShareCardCanvas(
  { content, frame, overlays },
  ref,
) {
  const out = OUTPUT_SIZE[frame.ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)

  const vars = themeToVars(themes[frame.themeName]) as Record<string, string>
  const accentChannels = frame.accentHex ? hexToChannels(frame.accentHex) : null
  if (accentChannels) vars['--sf-color-accent'] = accentChannels

  const style: CSSProperties = {
    ...vars,
    width: renderW,
    height: renderH,
    fontFamily: 'var(--sf-font-sans)',
  }

  // Image-led cards bleed edge-to-edge; the chrome overlays on top so it never
  // eats the photo.
  const bleed = content.type === 'news-image' || content.type === 'ai-image'

  return (
    <div ref={ref} className="relative flex flex-col overflow-hidden bg-bg text-text" style={style}>
      {bleed ? (
        <>
          <div className="absolute inset-0">
            <CardBody content={content} />
          </div>
          <div className="relative z-10 flex h-full flex-col justify-between">
            <Header eyebrow={frame.eyebrow} logoSize={frame.logoSize} logoVariant={frame.logoVariant} />
            {/* Caption + footer share one gradient so the headline sits above
                the branding instead of colliding with it. */}
            <div
              style={{
                background: `linear-gradient(to top, rgba(0,0,0,${frame.gradientStrength}), rgba(0,0,0,0))`,
              }}
            >
              <BleedCaption content={content} color={frame.captionColor} />
              <Footer handle={frame.handle} />
            </div>
          </div>
        </>
      ) : (
        <>
          <Header eyebrow={frame.eyebrow} logoSize={frame.logoSize} logoVariant={frame.logoVariant} />
          <div className="min-h-0 flex-1 py-2">
            <CardBody content={content} />
          </div>
          <Footer handle={frame.handle} />
        </>
      )}
      <OverlayLayer overlays={overlays ?? []} />
    </div>
  )
})
