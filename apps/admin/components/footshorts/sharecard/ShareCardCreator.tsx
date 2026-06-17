'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FixtureRow, StandingRow, FixtureEvent, EventTypeFilter } from '@vismay/footshorts-viz/types'
import { themes } from '@footshorts/brand'
import type { ThemeName } from '@footshorts/brand'
import { ShareCardCanvas } from './ShareCardCanvas'
import { useCapture } from './useCapture'
import {
  ASPECT_RATIOS,
  BACKGROUND_KINDS,
  CARD_TYPES,
  LOGO_SIZES,
  LOGO_VARIANTS,
  MATCH_ROW_VARIANTS,
  MATCH_STYLES,
  OUTPUT_SIZE,
  RENDER_SCALE,
  type AspectRatio,
  type CardBackground,
  type CardContent,
  type CardType,
  type LogoSize,
  type LogoVariant,
  type MatchRowVariant,
  type MatchStyle,
  type NewsItem,
  type Overlay,
} from './types'
import { SHARE_IMAGE_STYLES, type ShareImageModel } from '@/lib/footshortsShareStyles'

interface CompetitionOption {
  slug: string
  name: string
  season: string
  hasStandings: boolean
  hasFixtures: boolean
}

interface EntityResult {
  id: string
  type: 'team' | 'league'
  slug: string
  name: string
  crest_url: string | null
}

interface FlagOption {
  code: string
  name: string
}

/** A serializable snapshot of every creator control — enough to reconstruct a
 *  card in the editor. Data cards reference fixtures/news by id and re-fetch on
 *  load; AI cards embed the generated image as a data URL. Stored as the `config`
 *  JSON of a `footshorts_share_cards` row. */
interface ShareCardSnapshot {
  version: 1
  cardType: CardType
  themeName: ThemeName
  ratio: AspectRatio
  accentHex: string
  handle: string
  logoSize: LogoSize
  logoVariant: LogoVariant
  captionColor: string
  gradientStrength: number
  eyebrowOverride: string
  showEyebrow: boolean
  compKey: string
  pickedFixtureId: string
  pickedFixtureIds: string[]
  pickedGroup: string
  matchStyle: MatchStyle
  /** Event-type filter for the match-timeline card. Events themselves aren't
   *  snapshotted — re-fetched from pickedFixtureId on load. */
  pickedEventFilter?: EventTypeFilter
  matchRowVariant: MatchRowVariant
  pickedTeamSlug: string
  pickedNewsId: string
  aiCaption: string
  aiDataUrl: string
  aiSubject: string
  aiStyleId: string
  aiModel: ShareImageModel
  /** Decorative backdrop behind data-card content (news / AI / aura). */
  background?: CardBackground
  backgroundScrim?: number
  overlays: Overlay[]
}

interface SavedCardEntityTag {
  id: string
  type: 'league' | 'team' | 'player'
  slug: string
  name: string
  crestUrl: string | null
}

interface SavedCard {
  id: string
  name: string
  cardType: string
  config: ShareCardSnapshot
  status?: 'draft' | 'published'
  imageUrl?: string | null
  ratio?: string | null
  publishedAt?: string | null
  entities?: SavedCardEntityTag[]
  createdAt: string
}

const DEFAULT_OVERLAY_WIDTH = 18 // % of card width

const THEME_NAMES: ThemeName[] = ['classic', 'pitch', 'terrace']
const PREVIEW_MAX_W = 360
const PREVIEW_MAX_H = 540

// Article picker paging: start with one page, grow by a page each "Load more",
// up to the server-side cap in fetchFootshortsNews.
const NEWS_LIMIT_STEP = 40
const NEWS_LIMIT_MAX = 200

/** Rows that fit a ratio without clipping the standings table. */
function maxStandingsRows(ratio: AspectRatio): number {
  if (ratio === '9:16') return 14
  if (ratio === '3:4' || ratio === '4:5') return 12
  if (ratio === '1:1') return 9
  return 7 // 5:4, 4:3 landscape
}

// Approx render-px height of one MatchRow per density (padding + crest/score).
const FIXTURE_ROW_PX: Record<MatchRowVariant, number> = { compact: 44, expanded: 104 }

/** Match rows that fit a ratio without overflowing the card body. Derived from
 *  the card's render height (output × RENDER_SCALE) minus the header/footer
 *  chrome, divided by the per-row height for the chosen density. */
function maxFixtureRows(ratio: AspectRatio, variant: MatchRowVariant): number {
  const bodyPx = OUTPUT_SIZE[ratio].h * RENDER_SCALE - 100 // header + footer + caption
  return Math.max(1, Math.floor(bodyPx / FIXTURE_ROW_PX[variant]))
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
  const [logoSize, setLogoSize] = useState<LogoSize>('md')
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('accent')
  const [captionColor, setCaptionColor] = useState<string>('#FFFFFF')
  const [gradientStrength, setGradientStrength] = useState<number>(0.85)
  const [eyebrowOverride, setEyebrowOverride] = useState<string>('')
  const [showEyebrow, setShowEyebrow] = useState<boolean>(true)

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
  // Multi-select for the Fixtures (match-row list) card. Toggle order is kept but
  // the card renders in the fixtures' natural (kickoff) order; see `content`.
  const [pickedFixtureIds, setPickedFixtureIds] = useState<string[]>([])
  const [pickedGroup, setPickedGroup] = useState<string>('') // standings group_label, for group-stage cups
  const [matchStyle, setMatchStyle] = useState<MatchStyle>('tile')
  const [matchRowVariant, setMatchRowVariant] = useState<MatchRowVariant>('compact')
  // Match-timeline card: events for the picked fixture (re-fetched, not snapshotted)
  // + the render-time event filter.
  const [events, setEvents] = useState<FixtureEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventFilter, setEventFilter] = useState<EventTypeFilter>('all')
  const [pickedTeamSlug, setPickedTeamSlug] = useState<string>('')
  const [pickedNewsId, setPickedNewsId] = useState<string>('')
  const [newsSearch, setNewsSearch] = useState<string>('') // article picker filter
  // How many recent articles the picker pulls. Bumped by the "Load more" control
  // so a deeper back-catalogue is available on demand rather than a fixed page.
  const [newsLimit, setNewsLimit] = useState<number>(NEWS_LIMIT_STEP)
  // Last limit we actually fetched, so the effect re-fetches when it grows
  // without clobbering the list on unrelated re-renders.
  const fetchedNewsLimitRef = useRef<number | null>(null)

  // ── AI state ──────────────────────────────────────────────────────────────
  const [aiSubject, setAiSubject] = useState<string>('')
  const [aiStyleId, setAiStyleId] = useState<string>(SHARE_IMAGE_STYLES[0]!.id)
  const [aiModel, setAiModel] = useState<ShareImageModel>('image.default')
  const [aiCaption, setAiCaption] = useState<string>('')
  const [aiDataUrl, setAiDataUrl] = useState<string>('')
  const [aiRefImage, setAiRefImage] = useState<string>('') // reference image data URL
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRefPickerOpen, setAiRefPickerOpen] = useState(false) // pick a news thumbnail as reference
  const [aiRefBusy, setAiRefBusy] = useState(false)

  // ── card background ─────────────────────────────────────────────────────────
  // A decorative backdrop painted behind data-card content: a news thumbnail, an
  // AI-generated image, or an animated aura embed. `background` is the source of
  // truth the canvas reads; `bgTab` only picks which picker is shown.
  const [background, setBackground] = useState<CardBackground>({ type: 'none' })
  const [backgroundScrim, setBackgroundScrim] = useState<number>(0.5)
  const [bgTab, setBgTab] = useState<'news' | 'ai' | 'aura'>('news')
  const [bgAiSubject, setBgAiSubject] = useState<string>('')
  const [bgAuraSlug, setBgAuraSlug] = useState<string>('')
  const [bgBusy, setBgBusy] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)

  // ── badge / flag overlays ───────────────────────────────────────────────────
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [badgeTab, setBadgeTab] = useState<'badges' | 'flags'>('badges')
  const [badgeQuery, setBadgeQuery] = useState('')
  const [badgeResults, setBadgeResults] = useState<EntityResult[]>([])
  const [badgeLoading, setBadgeLoading] = useState(false)
  const [flagList, setFlagList] = useState<FlagOption[] | null>(null)
  const [flagQuery, setFlagQuery] = useState('')
  const overlaySeq = useRef(0)

  // ── saved cards ─────────────────────────────────────────────────────────────
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The card row currently being edited (set when a saved card is loaded, or
  // after a save/ship). Lets Save/Ship update that row in place rather than
  // forking a new one each time. Cleared when the card type changes (= new card).
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [currentCardName, setCurrentCardName] = useState<string>('')

  // ── publish-to-product tags ─────────────────────────────────────────────────
  // Entity tags (teams / leagues) a shipped card is filed under, so the consumer
  // app can surface it on the feed, in For You, and on those entity pages.
  const [tags, setTags] = useState<EntityResult[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<EntityResult[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [shipError, setShipError] = useState<string | null>(null)
  // Tags to restore when a saved card is loaded — checked by the re-seed effect
  // so loading a card keeps its saved tags instead of resetting to suggestions.
  const pendingTagsRef = useRef<EntityResult[] | null>(null)
  // Picks to restore once a competition's fixtures finish loading (set when a
  // saved card is loaded, so the fetch effect doesn't clear them to '').
  const pendingPicksRef = useRef<{
    compKey: string
    fixtureId: string
    fixtureIds: string[]
    teamSlug: string
    group: string
  } | null>(null)

  const needsStandings = cardType === 'standings'
  const needsFixtures =
    cardType === 'match' ||
    cardType === 'form' ||
    cardType === 'match-timeline' ||
    cardType === 'fixtures'
  const needsNews = cardType === 'news-image' || cardType === 'news-article'
  // Backgrounds apply to data cards only — bleed cards already are an image.
  const bgEnabled = cardType !== 'news-image' && cardType !== 'ai-image'
  // The background News picker pulls from the same news feed as the article cards.
  const wantBgNews = bgEnabled && bgTab === 'news'

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
          if (alive) {
            const rows = body.rows ?? []
            setStandings(rows)
            // Group-stage cups (World Cup, Euros) carry a group_label per row.
            // Default to the first group, or restore the saved group when this
            // load came from loading a saved card for this competition.
            const groups = Array.from(
              new Set(rows.map((r) => r.group_label).filter((g): g is string => !!g)),
            ).sort((a, b) => a.localeCompare(b))
            const pending = pendingPicksRef.current
            const compKey = `${selectedComp.slug}::${selectedComp.season}`
            const restored =
              pending && pending.compKey === compKey && groups.includes(pending.group)
                ? pending.group
                : ''
            setPickedGroup(restored || groups[0] || '')
            if (pending && pending.compKey === compKey) pendingPicksRef.current = null
          }
        } else {
          const res = await fetch(`/api/footshorts/data/fixtures?${qs}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: FixtureRow[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (alive) {
            setFixtures(body.rows ?? [])
            // Restore the saved picks if this load was triggered by loading a
            // saved card for this competition; otherwise clear the stale picks.
            const pending = pendingPicksRef.current
            const compKey = `${selectedComp.slug}::${selectedComp.season}`
            if (pending && pending.compKey === compKey) {
              setPickedFixtureId(pending.fixtureId)
              setPickedFixtureIds(pending.fixtureIds)
              setPickedTeamSlug(pending.teamSlug)
            } else {
              setPickedFixtureId('')
              setPickedFixtureIds([])
              setPickedTeamSlug('')
            }
            pendingPicksRef.current = null
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

  // Match-timeline card: fetch the picked fixture's events. Kept separate from the
  // competition fetch above because it keys off the fixture, not the competition —
  // the studio had no events data path before this card type.
  useEffect(() => {
    if (cardType !== 'match-timeline' || !pickedFixtureId) {
      setEvents(null)
      return
    }
    let alive = true
    // Drop the previous fixture's events immediately so the content gate can't
    // build a card from stale events while the new fetch is in flight.
    setEvents(null)
    setEventsLoading(true)
    void (async () => {
      try {
        const res = await fetch(
          `/api/footshorts/data/events?fixtureId=${encodeURIComponent(pickedFixtureId)}`,
        )
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          rows?: FixtureEvent[]
          error?: string
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (alive) setEvents(body.rows ?? [])
      } catch (e) {
        if (alive) {
          setEvents([])
          setError(e instanceof Error ? e.message : 'Failed to load events')
        }
      } finally {
        if (alive) setEventsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [cardType, pickedFixtureId])

  // Fetch recent news when a news card needs it, when the AI reference picker is
  // open, or when the background News picker is active — all pull thumbnails from
  // the same feed.
  useEffect(() => {
    if (!needsNews && !aiRefPickerOpen && !wantBgNews) return
    // Already have this page (or a deeper one) — nothing to fetch.
    if (fetchedNewsLimitRef.current !== null && fetchedNewsLimitRef.current >= newsLimit) return
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`/api/footshorts/data/news?limit=${newsLimit}`)
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: NewsItem[]; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (alive) {
          setNews(body.items ?? [])
          fetchedNewsLimitRef.current = newsLimit
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load news')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [needsNews, aiRefPickerOpen, wantBgNews, newsLimit])

  // Articles filtered by the picker search box (and, for the image card, those
  // that actually have a thumbnail).
  const filteredNews = useMemo(() => {
    const q = newsSearch.trim().toLowerCase()
    let list = news ?? []
    if (cardType === 'news-image') list = list.filter((n) => n.image_url)
    if (q) list = list.filter((n) => n.headline.toLowerCase().includes(q))
    return list
  }, [news, newsSearch, cardType])

  // News articles that have a thumbnail — the source for the AI reference picker.
  const newsWithImage = useMemo(() => {
    const q = newsSearch.trim().toLowerCase()
    const list = (news ?? []).filter((n) => n.image_url)
    return q ? list.filter((n) => n.headline.toLowerCase().includes(q)) : list
  }, [news, newsSearch])

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

  // Distinct group labels for group-stage competitions (World Cup, Euros…).
  // Empty for plain league tables, which carry no group_label.
  const standingGroups = useMemo(() => {
    const labels = new Set<string>()
    for (const r of standings ?? []) if (r.group_label) labels.add(r.group_label)
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [standings])

  // ── build the card content from the current selection ───────────────────────
  const content: CardContent | null = useMemo(() => {
    const compName = selectedComp?.name ?? ''
    if (cardType === 'match') {
      const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
      if (!fixture) return null
      return { type: 'match', fixture, competitionName: compName, style: matchStyle }
    }
    if (cardType === 'match-timeline') {
      // The timeline always rides above a match-type card, so it needs the
      // fixture too — bail if we can't resolve it (same gating as the match card).
      const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
      if (!fixture) return null
      if (!events || events.length === 0) return null
      // Mirror MatchTimeline's render predicate so a filter that hides everything
      // yields a null card (Download/Save disabled) rather than an empty export.
      const RENDERED = new Set(['goal', 'card', 'subst'])
      const visible = events.filter(
        (e) => RENDERED.has(e.type) && (eventFilter === 'all' || e.type === eventFilter),
      )
      if (visible.length === 0) return null
      return {
        type: 'match-timeline',
        fixture,
        style: matchStyle,
        events,
        competitionName: compName,
        filter: eventFilter,
      }
    }
    if (cardType === 'fixtures') {
      if (!fixtures || pickedFixtureIds.length === 0) return null
      // Render in the fixtures' natural (kickoff) order, not pick order, and cap
      // to what fits the current ratio/density.
      const picked = fixtures.filter((f) => pickedFixtureIds.includes(f.id))
      if (picked.length === 0) return null
      return {
        type: 'fixtures',
        fixtures: picked.slice(0, maxFixtureRows(ratio, matchRowVariant)),
        competitionName: compName,
        variant: matchRowVariant,
      }
    }
    if (cardType === 'standings') {
      if (!standings || standings.length === 0) return null
      // Group-stage cups carry a group_label per row — a single card shows one
      // group's table. League tables have no groups, so render the whole list.
      const hasGroups = standingGroups.length > 0
      const rows = hasGroups
        ? standings.filter((r) => (r.group_label ?? '') === pickedGroup)
        : standings
      if (rows.length === 0) return null
      return {
        type: 'standings',
        rows: rows.slice(0, maxStandingsRows(ratio)),
        competitionName: compName,
        season: selectedComp?.season ?? '',
        groupLabel: hasGroups ? pickedGroup : null,
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
    events,
    eventFilter,
    pickedFixtureId,
    pickedFixtureIds,
    matchStyle,
    matchRowVariant,
    pickedTeamSlug,
    pickedNewsId,
    pickedGroup,
    standingGroups,
    selectedComp,
    ratio,
    teamOptions,
    aiDataUrl,
    aiCaption,
  ])

  const eyebrow = useMemo(() => {
    if (!showEyebrow) return null
    if (eyebrowOverride.trim()) return eyebrowOverride.trim()
    if (cardType === 'news-image' || cardType === 'news-article') {
      const item = news?.find((n) => n.id === pickedNewsId)
      return item?.publisher ?? 'News'
    }
    return selectedComp?.name ?? null
  }, [showEyebrow, eyebrowOverride, cardType, news, pickedNewsId, selectedComp])

  // Entity tags suggested by the current card content — the teams in a match,
  // the team of a form grid, the competition of a table, the entities a news
  // item is about. Pre-fills the publish tags; the user can edit before shipping.
  const suggestedTags = useMemo<EntityResult[]>(() => {
    const out: EntityResult[] = []
    const push = (t: EntityResult | null) => {
      if (t && t.slug && !out.some((o) => o.type === t.type && o.slug === t.slug)) out.push(t)
    }
    const leagueTag: EntityResult | null = selectedComp
      ? { id: '', type: 'league', slug: selectedComp.slug, name: selectedComp.name, crest_url: null }
      : null
    if (!content) return out
    if (content.type === 'match' || content.type === 'match-timeline') {
      const f = content.fixture
      if (f.home) push({ id: f.home.id, type: 'team', slug: f.home.slug, name: f.home.name, crest_url: f.home.crest_url })
      if (f.away) push({ id: f.away.id, type: 'team', slug: f.away.slug, name: f.away.name, crest_url: f.away.crest_url })
      push(leagueTag)
    } else if (content.type === 'form') {
      push({ id: '', type: 'team', slug: content.teamSlug, name: content.teamName, crest_url: null })
      push(leagueTag)
    } else if (content.type === 'standings') {
      push(leagueTag)
    } else if (content.type === 'news-image' || content.type === 'news-article') {
      for (const e of content.item.entities) {
        if (e.type === 'team' || e.type === 'league') {
          push({ id: e.id, type: e.type, slug: e.slug, name: e.name, crest_url: e.crest_url })
        }
      }
    }
    return out
  }, [content, selectedComp])

  // Re-seed the publish tags whenever the card's *content* changes (a new
  // fixture/team/article/competition), not on style tweaks. Loading a saved card
  // restores its own tags via pendingTagsRef instead.
  const contentKey = `${cardType}|${compKey}|${pickedFixtureId}|${pickedTeamSlug}|${pickedNewsId}|${pickedGroup}|${aiDataUrl ? 'ai' : ''}`
  useEffect(() => {
    if (pendingTagsRef.current) {
      setTags(pendingTagsRef.current)
      pendingTagsRef.current = null
    } else {
      setTags(suggestedTags)
    }
    // Keyed on contentKey only: re-seed on content change, persist manual edits
    // across unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey])

  // ── capture / preview ───────────────────────────────────────────────────────
  const captureRef = useRef<HTMLDivElement>(null)
  const out = OUTPUT_SIZE[ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)
  const pixelRatio = out.w / renderW
  const bgHex = themes[themeName].colors.bg
  const { capture, download } = useCapture(captureRef, {
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

  // ── save / load to the card library ─────────────────────────────────────────
  // Load the saved-card list once on mount.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/share/cards')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: SavedCard[] }
        if (alive && body.ok) setSavedCards(body.cards ?? [])
      } catch {
        /* non-fatal — the library just stays empty */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const buildSnapshot = useCallback(
    (): ShareCardSnapshot => ({
      version: 1,
      cardType,
      themeName,
      ratio,
      accentHex,
      handle,
      logoSize,
      logoVariant,
      captionColor,
      gradientStrength,
      eyebrowOverride,
      showEyebrow,
      compKey,
      pickedFixtureId,
      pickedFixtureIds,
      pickedGroup,
      matchStyle,
      matchRowVariant,
      pickedEventFilter: eventFilter,
      pickedTeamSlug,
      pickedNewsId,
      aiCaption,
      aiDataUrl,
      aiSubject,
      aiStyleId,
      aiModel,
      background,
      backgroundScrim,
      overlays,
    }),
    [
      cardType, themeName, ratio, accentHex, handle, logoSize, logoVariant, captionColor,
      gradientStrength, eyebrowOverride, showEyebrow, compKey, pickedFixtureId, pickedFixtureIds, pickedGroup,
      matchStyle, matchRowVariant, eventFilter, pickedTeamSlug, pickedNewsId, aiCaption, aiDataUrl, aiSubject,
      aiStyleId, aiModel, background, backgroundScrim, overlays,
    ],
  )

  const handleSave = useCallback(async () => {
    if (!content) return
    const fallback = `${CARD_TYPES.find((t) => t.id === cardType)?.label ?? cardType}${
      selectedComp ? ` · ${selectedComp.name}` : ''
    }`
    const name = window.prompt('Name this card', fallback)?.trim()
    if (!name) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/footshorts/share/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cardType, config: buildSnapshot() }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
      if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
      setSavedCards((prev) => [body.card!, ...prev])
      setCurrentCardId(body.card.id)
      setCurrentCardName(body.card.name)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [content, cardType, selectedComp, buildSnapshot])

  // Restore every control from a saved snapshot. Data-card picks (fixture/team)
  // are stashed so the competition fetch effect restores rather than clears them.
  const applySnapshot = useCallback((snap: ShareCardSnapshot) => {
    pendingPicksRef.current = {
      compKey: snap.compKey,
      fixtureId: snap.pickedFixtureId,
      fixtureIds: snap.pickedFixtureIds ?? [],
      teamSlug: snap.pickedTeamSlug,
      group: snap.pickedGroup ?? '',
    }
    setCardType(snap.cardType)
    setThemeName(snap.themeName)
    setRatio(snap.ratio)
    setAccentHex(snap.accentHex)
    setHandle(snap.handle)
    setLogoSize(snap.logoSize)
    setLogoVariant(snap.logoVariant)
    setCaptionColor(snap.captionColor)
    setGradientStrength(snap.gradientStrength)
    setEyebrowOverride(snap.eyebrowOverride)
    setShowEyebrow(snap.showEyebrow)
    setCompKey(snap.compKey)
    setPickedFixtureId(snap.pickedFixtureId)
    setPickedFixtureIds(snap.pickedFixtureIds ?? [])
    setMatchStyle(snap.matchStyle)
    setMatchRowVariant(snap.matchRowVariant ?? 'compact')
    setEventFilter(snap.pickedEventFilter ?? 'all')
    setPickedTeamSlug(snap.pickedTeamSlug)
    setPickedNewsId(snap.pickedNewsId)
    setAiCaption(snap.aiCaption)
    setAiDataUrl(snap.aiDataUrl)
    setAiSubject(snap.aiSubject)
    setAiStyleId(snap.aiStyleId)
    setAiModel(snap.aiModel)
    const bg = snap.background ?? { type: 'none' }
    setBackground(bg)
    setBackgroundScrim(snap.backgroundScrim ?? 0.5)
    if (bg.type === 'aura') setBgAuraSlug(bg.slug)
    if (bg.type !== 'none') setBgTab(bg.type)
    setOverlays(snap.overlays.map((o) => ({ ...o, id: `ov-${overlaySeq.current++}` })))
    setSelectedOverlayId(null)
    setSaveError(null)
  }, [])

  const handleDeleteSaved = useCallback(async (id: string) => {
    setSavedCards((prev) => prev.filter((c) => c.id !== id))
    setCurrentCardId((cur) => (cur === id ? null : cur))
    try {
      await fetch(`/api/footshorts/share/cards/${id}`, { method: 'DELETE' })
    } catch {
      /* optimistic — the row reappears on next reload if the delete failed */
    }
  }, [])

  // Load a saved card back into the editor — restoring its snapshot AND its tags,
  // and pinning it as the current card so Save/Ship update it in place.
  const loadCard = useCallback(
    (card: SavedCard) => {
      const restored: EntityResult[] = (card.entities ?? [])
        .filter((e) => e.type === 'team' || e.type === 'league')
        .map((e) => ({
          id: e.id,
          type: e.type as 'team' | 'league',
          slug: e.slug,
          name: e.name,
          crest_url: e.crestUrl,
        }))
      // Set now (covers loading a card whose content matches the current one, so
      // the re-seed effect won't fire) AND stash for the effect (covers the
      // common case where applySnapshot changes the content key).
      setTags(restored)
      pendingTagsRef.current = restored
      applySnapshot(card.config)
      setCurrentCardId(card.id)
      setCurrentCardName(card.name)
    },
    [applySnapshot],
  )

  // Switching card type starts a fresh card (so Save/Ship don't overwrite the
  // one that happened to be loaded).
  const selectCardType = useCallback((t: CardType) => {
    setCardType(t)
    setCurrentCardId(null)
    setCurrentCardName('')
  }, [])

  // ── publish-to-product tag handlers ─────────────────────────────────────────
  const searchTags = useCallback(async () => {
    setTagLoading(true)
    try {
      const res = await fetch(
        `/api/footshorts/data/entities?q=${encodeURIComponent(tagQuery.trim())}&limit=20`,
      )
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: EntityResult[] }
      setTagResults(body.items ?? [])
    } catch {
      setTagResults([])
    } finally {
      setTagLoading(false)
    }
  }, [tagQuery])

  const addTag = useCallback((t: EntityResult) => {
    setTags((prev) =>
      prev.some((p) => p.type === t.type && p.slug === t.slug) ? prev : [...prev, t],
    )
  }, [])

  const removeTag = useCallback((type: string, slug: string) => {
    setTags((prev) => prev.filter((p) => !(p.type === type && p.slug === slug)))
  }, [])

  // Ship the card into the consumer product: render the PNG, then publish + tag.
  const handleShip = useCallback(async () => {
    if (!content) return
    const fallback =
      currentCardName ||
      `${CARD_TYPES.find((t) => t.id === cardType)?.label ?? cardType}${
        selectedComp ? ` · ${selectedComp.name}` : ''
      }`
    const name = window.prompt('Name this card (shown in the product)', fallback)?.trim()
    if (!name) return
    setShipping(true)
    setShipError(null)
    try {
      const dataUrl = await capture()
      if (!dataUrl) throw new Error('Could not render the card image.')
      const res = await fetch('/api/footshorts/share/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentCardId ?? undefined,
          name,
          cardType,
          config: buildSnapshot(),
          ratio,
          imageDataUrl: dataUrl,
          entities: tags.map((t) => ({ type: t.type, slug: t.slug })),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        card?: SavedCard
        error?: string
      }
      if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
      const card = body.card
      setCurrentCardId(card.id)
      setCurrentCardName(card.name)
      setSavedCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)])
    } catch (e) {
      setShipError(e instanceof Error ? e.message : 'Ship failed')
    } finally {
      setShipping(false)
    }
  }, [content, currentCardId, currentCardName, cardType, selectedComp, ratio, tags, buildSnapshot, capture])

  const handleUnship = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/footshorts/share/cards/${id}/unpublish`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard }
      if (res.ok && body.ok && body.card) {
        setSavedCards((prev) => prev.map((c) => (c.id === id ? body.card! : c)))
      }
    } catch {
      /* non-fatal — reflected on next reload */
    }
  }, [])

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

  // Use a remote image (a news thumbnail) as the AI reference. Fetch it through
  // the same-origin proxy and inline it as a data URL so it flows through the
  // same path as an uploaded file.
  const pickReferenceFromUrl = useCallback(async (url: string) => {
    setAiRefBusy(true)
    setAiError(null)
    try {
      const res = await fetch(`/api/footshorts/share/proxy-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(blob)
      })
      setAiRefImage(dataUrl)
      setAiRefPickerOpen(false)
    } catch {
      setAiError('Could not load that thumbnail as a reference.')
    } finally {
      setAiRefBusy(false)
    }
  }, [])

  // Generate an AI image to use as the card background. Same endpoint as the AI
  // card, reusing the chosen style/model/palette; the result is stored as the
  // background rather than the card content.
  const handleGenerateBg = useCallback(async () => {
    const subject = bgAiSubject.trim()
    if (!subject) {
      setBgError('Describe the background.')
      return
    }
    setBgBusy(true)
    setBgError(null)
    try {
      const paletteHexes = [themes[themeName].colors.accent, accentHex].filter(Boolean)
      const res = await fetch('/api/footshorts/share/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleId: aiStyleId, subject, ratio, model: aiModel, paletteHexes }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      setBackground({ type: 'ai', dataUrl: body.dataUrl })
    } catch (e) {
      setBgError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBgBusy(false)
    }
  }, [bgAiSubject, aiStyleId, aiModel, ratio, themeName, accentHex])

  // ── badge / flag overlay handlers ───────────────────────────────────────────
  const searchBadges = useCallback(async () => {
    setBadgeLoading(true)
    try {
      const res = await fetch(`/api/footshorts/data/entities?q=${encodeURIComponent(badgeQuery.trim())}&limit=40`)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: EntityResult[] }
      setBadgeResults(body.items ?? [])
    } catch {
      setBadgeResults([])
    } finally {
      setBadgeLoading(false)
    }
  }, [badgeQuery])

  // Load the flag list lazily the first time the Flags tab is opened.
  useEffect(() => {
    if (badgeTab !== 'flags' || flagList !== null) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/data/flags')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: FlagOption[] }
        if (alive) setFlagList(body.items ?? [])
      } catch {
        if (alive) setFlagList([])
      }
    })()
    return () => {
      alive = false
    }
  }, [badgeTab, flagList])

  const filteredFlags = useMemo(() => {
    const q = flagQuery.trim().toLowerCase()
    const list = flagList ?? []
    return (q ? list.filter((f) => f.name.toLowerCase().includes(q)) : list).slice(0, 60)
  }, [flagList, flagQuery])

  const addOverlay = useCallback((url: string, label: string, kind: Overlay['kind']) => {
    const id = `ov-${overlaySeq.current++}`
    setOverlays((prev) => [
      ...prev,
      { id, url, label, kind, xPct: 50, yPct: 50, widthPct: DEFAULT_OVERLAY_WIDTH },
    ])
    setSelectedOverlayId(id)
  }, [])

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id))
    setSelectedOverlayId((cur) => (cur === id ? null : cur))
  }, [])

  const setOverlayWidth = useCallback((id: string, widthPct: number) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, widthPct } : o)))
  }, [])

  // Drag an overlay over the preview. The interaction layer matches the card
  // box, so pointer position maps straight to card percentages.
  const interactionRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<string | null>(null)
  const onDragMove = useCallback((e: PointerEvent) => {
    const id = dragIdRef.current
    const el = interactionRef.current
    if (!id || !el) return
    const rect = el.getBoundingClientRect()
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, xPct, yPct } : o)))
  }, [])
  const onDragEnd = useCallback(() => {
    dragIdRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }, [onDragMove])
  const onOverlayPointerDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      e.preventDefault()
      setSelectedOverlayId(id)
      dragIdRef.current = id
      window.addEventListener('pointermove', onDragMove)
      window.addEventListener('pointerup', onDragEnd)
    },
    [onDragMove, onDragEnd],
  )

  // ── Fixtures (match-row list) selection ─────────────────────────────────────
  const toggleFixture = useCallback((id: string) => {
    setPickedFixtureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])
  const selectAllFixtures = useCallback(() => {
    setPickedFixtureIds((fixtures ?? []).map((f) => f.id))
  }, [fixtures])

  const fixtureRowCap = maxFixtureRows(ratio, matchRowVariant)

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
                onClick={() => selectCardType(t.id)}
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

        {/* Group picker — only for group-stage cups (World Cup, Euros…). */}
        {cardType === 'standings' && standingGroups.length > 0 && (
          <label className={labelCls}>
            Group
            <select
              value={pickedGroup}
              onChange={(e) => setPickedGroup(e.target.value)}
              className={selectCls}
            >
              {standingGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
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

        {/* Match / match-timeline: fixture picker */}
        {(cardType === 'match' || cardType === 'match-timeline') && fixtures && (
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

        {/* Match / match-timeline: the heading match-type card's layout (tile vs
            editorial card) — the timeline rides below whichever is picked. */}
        {(cardType === 'match' || cardType === 'match-timeline') && (
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

        {/* Match timeline: event-type filter */}
        {cardType === 'match-timeline' && (
          <label className={labelCls}>
            Event filter
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as EventTypeFilter)}
              className={selectCls}
            >
              <option value="all">All events</option>
              <option value="goal">Goals only</option>
              <option value="card">Cards only</option>
              <option value="subst">Substitutions only</option>
            </select>
            {eventsLoading ? (
              <span className="text-[11px] text-neutral-500">Loading events…</span>
            ) : events && events.length === 0 ? (
              <span className="text-[11px] text-neutral-500">No events for this fixture.</span>
            ) : null}
          </label>
        )}

        {/* Fixtures: multi-select list + row density */}
        {cardType === 'fixtures' && fixtures && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={labelCls}>Fixtures ({pickedFixtureIds.length})</span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllFixtures}
                  className="text-sky-300 hover:text-sky-200"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setPickedFixtureIds([])}
                  className="text-neutral-400 hover:text-neutral-200"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-white/10 bg-neutral-900 p-1.5">
              {fixtures.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-neutral-500">No fixtures.</p>
              )}
              {fixtures.map((f) => {
                const home = f.home?.name ?? f.home_team_name ?? 'TBD'
                const away = f.away?.name ?? f.away_team_name ?? 'TBD'
                const score =
                  f.status === 'finished' && f.home_score != null
                    ? ` (${f.home_score}–${f.away_score})`
                    : ''
                const checked = pickedFixtureIds.includes(f.id)
                return (
                  <label
                    key={f.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] ${
                      checked ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleFixture(f.id)} />
                    <span className="min-w-0 flex-1 truncate">
                      {home} vs {away}
                      {score}
                    </span>
                  </label>
                )
              })}
            </div>
            {pickedFixtureIds.length > fixtureRowCap && (
              <p className="text-[11px] text-amber-400/90">
                Only the first {fixtureRowCap} fit this format; the rest are hidden.
              </p>
            )}
            <label className={labelCls}>
              Density
              <select
                value={matchRowVariant}
                onChange={(e) => setMatchRowVariant(e.target.value as MatchRowVariant)}
                className={selectCls}
              >
                {MATCH_ROW_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
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

        {/* News picker — the image card only lists articles that have a thumbnail. */}
        {needsNews && news && (
          <label className={labelCls}>
            Article
            <input
              value={newsSearch}
              onChange={(e) => setNewsSearch(e.target.value)}
              placeholder="Search articles…"
              className="mt-1 mb-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
            />
            <select value={pickedNewsId} onChange={(e) => setPickedNewsId(e.target.value)} className={selectCls}>
              <option value="">{`Select an article… (${filteredNews.length})`}</option>
              {filteredNews.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.headline.slice(0, 70)}
                </option>
              ))}
            </select>
            {/* Pull a deeper page on demand. Shown only while the last fetch came
                back full (so more may exist) and we're under the server cap. */}
            {news.length >= newsLimit && newsLimit < NEWS_LIMIT_MAX && (
              <button
                type="button"
                onClick={() => setNewsLimit((n) => Math.min(n + NEWS_LIMIT_STEP, NEWS_LIMIT_MAX))}
                disabled={loading}
                className="mt-1.5 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-white/30 hover:text-neutral-100 disabled:opacity-50"
              >
                {loading ? 'Loading…' : `Load more articles (showing ${news.length})`}
              </button>
            )}
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
                <div className="mt-1.5 space-y-1.5">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickReference(e.target.files?.[0] ?? null)}
                    className="block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-neutral-100 hover:file:bg-white/20"
                  />
                  <button
                    onClick={() => setAiRefPickerOpen((v) => !v)}
                    className="text-[11px] text-sky-300 hover:text-sky-200"
                  >
                    {aiRefPickerOpen ? '× Close news thumbnails' : '+ Use a news thumbnail'}
                  </button>
                  {aiRefPickerOpen && (
                    <div>
                      <input
                        value={newsSearch}
                        onChange={(e) => setNewsSearch(e.target.value)}
                        placeholder="Search news…"
                        className="mb-1.5 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
                      />
                      {news === null ? (
                        <p className="text-[11px] text-neutral-500">Loading…</p>
                      ) : (
                        <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto">
                          {newsWithImage.slice(0, 30).map((n) => (
                            <button
                              key={n.id}
                              onClick={() => void pickReferenceFromUrl(n.image_url!)}
                              disabled={aiRefBusy}
                              title={n.headline}
                              className="aspect-square overflow-hidden rounded-md border border-white/10 hover:border-white/30 disabled:opacity-50"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={n.image_url!} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      {aiRefBusy && <p className="mt-1 text-[11px] text-neutral-500">Loading thumbnail…</p>}
                    </div>
                  )}
                </div>
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

        {/* Logo size + variant */}
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Logo size
            <select
              value={logoSize}
              onChange={(e) => setLogoSize(e.target.value as LogoSize)}
              className={selectCls}
            >
              {LOGO_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Logo style
            <select
              value={logoVariant}
              onChange={(e) => setLogoVariant(e.target.value as LogoVariant)}
              className={selectCls}
            >
              {LOGO_VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Eyebrow (competition / publisher label) override + toggle */}
        <div>
          <div className="flex items-center justify-between">
            <span className={labelCls}>Label (top-left)</span>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={showEyebrow}
                onChange={(e) => setShowEyebrow(e.target.checked)}
              />
              Show
            </label>
          </div>
          <input
            value={eyebrowOverride}
            onChange={(e) => setEyebrowOverride(e.target.value)}
            disabled={!showEyebrow}
            placeholder="Auto (competition / publisher) — type to override"
            className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30 disabled:opacity-40"
          />
        </div>

        {/* Caption styling — only meaningful on image-led (bleed) cards */}
        {(cardType === 'news-image' || cardType === 'ai-image') && (
          <div className="grid grid-cols-2 items-end gap-3">
            <label className={labelCls}>
              Gradient {Math.round(gradientStrength * 100)}%
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(gradientStrength * 100)}
                onChange={(e) => setGradientStrength(Number(e.target.value) / 100)}
                className="mt-2 w-full"
              />
            </label>
            <label className={labelCls}>
              Caption color
              <input
                type="color"
                value={captionColor}
                onChange={(e) => setCaptionColor(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-white/10 bg-neutral-900"
              />
            </label>
          </div>
        )}

        {/* Background — paint a news image, AI image, or aura behind a data
            card's content. Hidden for bleed cards, which already are an image. */}
        {bgEnabled && (
          <>
            <hr className="border-white/10" />
            <div>
              <div className="flex items-center justify-between">
                <span className={labelCls}>Background</span>
                {background.type !== 'none' && (
                  <button
                    onClick={() => setBackground({ type: 'none' })}
                    className="text-[11px] text-neutral-400 hover:text-neutral-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Source tabs */}
              <div className="mt-1.5 flex overflow-hidden rounded-md border border-white/10">
                {BACKGROUND_KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setBgTab(k.id)}
                    className={`flex-1 px-2 py-1.5 text-[11px] ${
                      bgTab === k.id ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              {/* News thumbnails */}
              {bgTab === 'news' && (
                <div className="mt-2">
                  <input
                    value={newsSearch}
                    onChange={(e) => setNewsSearch(e.target.value)}
                    placeholder="Search news…"
                    className="mb-1.5 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
                  />
                  {news === null ? (
                    <p className="text-[11px] text-neutral-500">Loading…</p>
                  ) : (
                    <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto">
                      {newsWithImage.slice(0, 30).map((n) => {
                        const selected = background.type === 'news' && background.url === n.image_url
                        return (
                          <button
                            key={n.id}
                            onClick={() =>
                              setBackground({ type: 'news', url: n.image_url!, label: n.headline })
                            }
                            title={n.headline}
                            className={`aspect-square overflow-hidden rounded-md border ${
                              selected
                                ? 'border-sky-400/80 ring-1 ring-sky-400/60'
                                : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={n.image_url!} alt="" className="h-full w-full object-cover" />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* AI generator */}
              {bgTab === 'ai' && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={bgAiSubject}
                    onChange={(e) => setBgAiSubject(e.target.value)}
                    rows={2}
                    placeholder="e.g. a moody floodlit stadium, deep greens"
                    className="w-full resize-vertical rounded border border-white/10 bg-neutral-950 p-2 text-[12px] text-neutral-100 outline-none focus:border-white/30"
                  />
                  <label className={labelCls}>
                    Style
                    <select
                      value={aiStyleId}
                      onChange={(e) => setAiStyleId(e.target.value)}
                      className={selectCls}
                    >
                      {SHARE_IMAGE_STYLES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => void handleGenerateBg()}
                    disabled={bgBusy || !bgAiSubject.trim()}
                    className="w-full rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
                  >
                    {bgBusy ? 'Generating…' : background.type === 'ai' ? 'Regenerate' : 'Generate'}
                  </button>
                </div>
              )}

              {/* Aura slug */}
              {bgTab === 'aura' && (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={bgAuraSlug}
                    onChange={(e) => {
                      const slug = e.target.value
                      setBgAuraSlug(slug)
                      setBackground(slug.trim() ? { type: 'aura', slug: slug.trim() } : { type: 'none' })
                    }}
                    placeholder="aura.promad.design slug — e.g. nebula"
                    className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
                  />
                  <p className="text-[11px] text-amber-400/90">
                    Auras animate in the preview but aren’t baked into the exported PNG.
                  </p>
                </div>
              )}

              {bgError && <p className="mt-1 text-[11px] text-red-400">{bgError}</p>}

              {/* Scrim — darken the backdrop so card content stays legible. */}
              {background.type !== 'none' && (
                <label className={`${labelCls} mt-2 block`}>
                  Scrim {Math.round(backgroundScrim * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(backgroundScrim * 100)}
                    onChange={(e) => setBackgroundScrim(Number(e.target.value) / 100)}
                    className="mt-2 w-full"
                  />
                </label>
              )}
            </div>
          </>
        )}

        <hr className="border-white/10" />

        {/* Badges & flags — fetch and place crests / logos / flags on the card */}
        <div>
          <span className={labelCls}>Badges &amp; flags</span>
          <div className="mt-1.5 flex overflow-hidden rounded-md border border-white/10">
            {(['badges', 'flags'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setBadgeTab(t)}
                className={`flex-1 px-2 py-1.5 text-[11px] ${
                  badgeTab === t ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t === 'badges' ? 'Crests / Logos' : 'Flags'}
              </button>
            ))}
          </div>

          {badgeTab === 'badges' ? (
            <>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={badgeQuery}
                  onChange={(e) => setBadgeQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void searchBadges()}
                  placeholder="Search team or competition…"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
                />
                <button
                  onClick={() => void searchBadges()}
                  className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-neutral-100 hover:bg-white/20"
                >
                  {badgeLoading ? '…' : 'Find'}
                </button>
              </div>
              {badgeResults.length > 0 && (
                <div className="mt-2 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
                  {badgeResults.map((r) =>
                    r.crest_url ? (
                      <button
                        key={r.id}
                        onClick={() =>
                          addOverlay(r.crest_url!, r.name, r.type === 'league' ? 'logo' : 'crest')
                        }
                        title={r.name}
                        className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1.5 hover:border-white/30"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.crest_url} alt={r.name} className="max-h-full max-w-full object-contain" />
                      </button>
                    ) : null,
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <input
                value={flagQuery}
                onChange={(e) => setFlagQuery(e.target.value)}
                placeholder={flagList === null ? 'Loading countries…' : 'Search country…'}
                className="mt-2 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
              />
              <div className="mt-2 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
                {filteredFlags.map((f) => {
                  const url = `https://flagcdn.com/w320/${f.code}.png`
                  return (
                    <button
                      key={f.code}
                      onClick={() => addOverlay(url, f.name, 'flag')}
                      title={f.name}
                      className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1 hover:border-white/30"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={f.name} className="max-h-full max-w-full rounded-sm object-contain" />
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Placed badges */}
          {overlays.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <span className="text-[11px] text-neutral-500">Placed · drag on the card to move</span>
              {overlays.map((o) => (
                <div
                  key={o.id}
                  onClick={() => setSelectedOverlayId(o.id)}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${
                    selectedOverlayId === o.id ? 'border-sky-400/70 bg-white/5' : 'border-white/10'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.url} alt="" className="h-6 w-6 shrink-0 object-contain" />
                  <span className="flex-1 truncate text-[11px] text-neutral-300">{o.label}</span>
                  <input
                    type="range"
                    min={6}
                    max={55}
                    value={o.widthPct}
                    onChange={(e) => setOverlayWidth(o.id, Number(e.target.value))}
                    className="w-20"
                    title="Size"
                  />
                  <button
                    onClick={() => removeOverlay(o.id)}
                    className="rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void handleDownload()}
            disabled={!content || downloading}
            className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!content || saving}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveError && <p className="text-[11px] text-red-400">{saveError}</p>}

        <hr className="border-white/10" />

        {/* Publish to product — tag with entities, then ship the rendered PNG
            into the footshorts app (feed, For You, and the tagged team /
            competition pages). */}
        <div>
          <span className={labelCls}>Publish to product</span>

          {/* Selected tags */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.length === 0 ? (
              <span className="text-[11px] text-neutral-500">
                No tags — add teams or competitions so the card surfaces in the app.
              </span>
            ) : (
              tags.map((t) => (
                <span
                  key={`${t.type}:${t.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-neutral-900 py-1 pl-1.5 pr-1 text-[11px] text-neutral-200"
                >
                  {t.crest_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.crest_url} alt="" className="h-3.5 w-3.5 object-contain" />
                  ) : null}
                  {t.name}
                  <button
                    onClick={() => removeTag(t.type, t.slug)}
                    className="rounded px-1 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove ${t.name}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Tag search */}
          <div className="mt-2 flex gap-1.5">
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchTags()}
              placeholder="Add a team or competition…"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
            />
            <button
              onClick={() => void searchTags()}
              className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-neutral-100 hover:bg-white/20"
            >
              {tagLoading ? '…' : 'Find'}
            </button>
          </div>
          {tagResults.length > 0 && (
            <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
              {tagResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addTag(r)}
                  className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-neutral-900 p-1.5 text-left hover:border-white/30"
                >
                  {r.crest_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.crest_url} alt="" className="h-5 w-5 shrink-0 object-contain" />
                  ) : (
                    <span className="h-5 w-5 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-[11px] text-neutral-200">{r.name}</span>
                  <span className="text-[10px] text-neutral-500">{r.type}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => void handleShip()}
            disabled={!content || shipping}
            className="mt-2.5 w-full rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {shipping ? 'Shipping…' : currentCardId ? 'Re-ship to product' : 'Ship to product'}
          </button>
          {shipError && <p className="mt-1 text-[11px] text-red-400">{shipError}</p>}
        </div>

        {/* Saved cards — reload a snapshot back into the editor, or delete it. */}
        {savedCards.length > 0 && (
          <div>
            <span className={labelCls}>Saved cards</span>
            <div className="mt-1.5 space-y-1.5">
              {savedCards.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${
                    currentCardId === c.id ? 'border-sky-400/50 bg-white/5' : 'border-white/10'
                  }`}
                >
                  <button
                    onClick={() => loadCard(c)}
                    title="Load into editor"
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-neutral-200 hover:text-white"
                  >
                    {c.name}
                    <span className="ml-1 text-neutral-500">· {c.cardType}</span>
                  </button>
                  {c.status === 'published' ? (
                    <>
                      <span
                        className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                        title={
                          c.publishedAt
                            ? `Shipped ${new Date(c.publishedAt).toLocaleString()}`
                            : 'Live in the product'
                        }
                      >
                        ● Live
                      </span>
                      <button
                        onClick={() => void handleUnship(c.id)}
                        className="shrink-0 rounded px-1.5 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-white"
                        title="Remove from the product"
                      >
                        Unship
                      </button>
                    </>
                  ) : null}
                  <button
                    onClick={() => void handleDeleteSaved(c.id)}
                    className="shrink-0 rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label="Delete saved card"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 items-start justify-center rounded-xl border border-white/10 bg-neutral-950/40 p-6">
        {content ? (
          <div
            className="relative"
            style={{
              width: renderW * previewScale,
              height: renderH * previewScale,
            }}
          >
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <ShareCardCanvas
                ref={captureRef}
                content={content}
                frame={{
                  themeName,
                  ratio,
                  accentHex: accentHex || null,
                  eyebrow,
                  handle,
                  logoSize,
                  logoVariant,
                  captionColor,
                  gradientStrength,
                  background,
                  backgroundScrim,
                }}
                overlays={overlays}
              />
            </div>
            {/* Drag layer over the card (not part of the captured node). */}
            <div ref={interactionRef} className="pointer-events-none absolute inset-0">
              {overlays.map((o) => (
                <div
                  key={o.id}
                  onPointerDown={(e) => onOverlayPointerDown(e, o.id)}
                  className="pointer-events-auto absolute cursor-move"
                  style={{
                    left: `${o.xPct}%`,
                    top: `${o.yPct}%`,
                    width: `${o.widthPct}%`,
                    aspectRatio: '1 / 1',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div
                    className={
                      'h-full w-full rounded ' +
                      (selectedOverlayId === o.id ? 'ring-2 ring-sky-400/90' : 'ring-1 ring-transparent hover:ring-white/30')
                    }
                  />
                </div>
              ))}
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
