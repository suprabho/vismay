import { createServiceClient } from '@vismay/content-source/supabase'
import {
  getIeaCountryProfile,
  type IeaCountryProfile,
  listDcNewsForAdmin,
  listDcNewsRecaps,
  getDcNewsRecap,
  getDcStockMarket,
  type DcStockSeries,
} from '@vismay/content-source/epics'

/**
 * Compose "from library" PROVIDERS — pluggable sources of in-DB content that can
 * be attached as research for a draft, beyond the bespoke `story_sources` and
 * `story-assets` paths (which the sources route handles directly).
 *
 * Each provider `list`s lightweight items (id + title + subtitle) and, on
 * attach, `extract`s one to plain text that the sources route snapshots into a
 * `kind: 'text'` row. Providers are app-scoped: a provider only contributes a
 * group when it serves the draft's `app_slug`, so the picker stays on-domain.
 *
 * Reachability note: `createServiceClient()` binds to ONE Supabase project
 * (NEXT_PUBLIC_SUPABASE_URL). Stories/epics/datasets live in that project; the
 * per-vertical football/f1 `articles` tables live in SEPARATE projects, so a
 * provider for those would need a second client and is intentionally absent.
 */

/** A pickable item within a provider's group. */
export interface LibraryItem {
  id: string
  title: string
  subtitle?: string
}

/** A rendered group in the picker — one per applicable provider. */
export interface LibraryGroup {
  key: string
  label: string
  items: LibraryItem[]
}

/** One page of a provider's items plus the full (filtered) match count — drives
 *  the picker's per-tab "Load more" affordance. */
export interface LibraryPage {
  items: LibraryItem[]
  total: number
}

/** How the picker's tab strip should present a tab. `provider` tabs are backed
 *  by a `LibraryProvider`; `sources`/`assets` are the two synthetic tabs handled
 *  directly by the page route. */
export type LibraryTabKind = 'provider' | 'sources' | 'assets'

/** Lightweight tab descriptor for the picker — no items, so it's cheap to build
 *  (just the app-scope filter, no per-provider query). */
export interface LibraryTab {
  key: string
  label: string
  /** `list` tabs surface content up front; `search` tabs need a query first. */
  mode: 'list' | 'search'
  kind: LibraryTabKind
}

/** Extracted text for one item, ready to snapshot as a source row. */
export interface LibraryExtract {
  title: string
  byline?: string
  text: string
}

interface ListCtx {
  /** The draft's app_slug, or null if unknown (then a provider may serve all). */
  appSlug: string | null
  /** The draft's own slug — excluded from results so you can't attach yourself. */
  excludeSlug: string
  /** Zero-based row offset for the requested page. */
  offset: number
  /** Max rows to return for the page. */
  limit: number
  /** Optional server-side text filter scoped to the active tab. */
  query?: string
}

interface SearchCtx extends ListCtx {
  /** The user's (sanitised) query — never empty when `search` is invoked. */
  query: string
}

/**
 * A provider is `list`-based (bounded set surfaced up front — stories, epics,
 * news), `search`-based (large corpus queried on demand — the datasets), or
 * both. Each returns a `LibraryPage` (a page of items + the full match count)
 * so the picker can paginate. `extract` resolves a chosen item's text
 * regardless of how it surfaced.
 */
interface LibraryProvider {
  key: string
  label: string
  /** Which app_slugs this provider serves; omit to serve every app. */
  apps?: string[]
  list?(ctx: ListCtx): Promise<LibraryPage>
  search?(ctx: SearchCtx): Promise<LibraryPage>
  extract(id: string): Promise<LibraryExtract | null>
}

/** Slice an already-materialised item list into a page + report its full size.
 *  Used by providers whose corpus is fetched whole (small sets or reader-backed
 *  queries that don't take an offset), then paged in memory. */
function pageOf(items: LibraryItem[], offset: number, limit: number): LibraryPage {
  return { items: items.slice(offset, offset + limit), total: items.length }
}

/** Strip characters that would break a PostgREST `.or(...)` filter, then wrap as
 *  an ilike pattern. Keeps user queries from injecting filter syntax. */
function ilikePattern(query: string): string {
  const safe = query.replace(/[%,()*\\:]/g, ' ').replace(/\s+/g, ' ').trim()
  return `%${safe}%`
}

// ── Cross-app epic sharing ───────────────────────────────────────────────────

/**
 * Vizmaya epics whose compose research material — the explainer AND the curated
 * member stories — is also offered to other desks' drafts. Sharing is read-only
 * and picker-level: ownership (`epics.app_slug`), homepage surfacing, and story
 * routing are untouched, unlike the fifa-wc26 move which repointed app_slug.
 * Epic slug → extra app_slugs that may attach its material.
 *
 * The football desk's nation stories (fifa-wc26) lean on vizmaya's country
 * context: global-trade is the trade counterpart to the country energy
 * profiles dataset below, and energy-profile's explainer + story rail
 * complement that dataset's numbers.
 */
const SHARED_EPICS: Record<string, string[]> = {
  'global-trade': ['footshorts'],
  'energy-profile': ['footshorts'],
}

/** Epic slugs shared with an app, beyond the ones it owns. */
function sharedEpicSlugsFor(appSlug: string | null): string[] {
  if (!appSlug) return []
  return Object.entries(SHARED_EPICS)
    .filter(([, apps]) => apps.includes(appSlug))
    .map(([slug]) => slug)
}

/** Published-story slugs curated into the epics shared with an app. Empty when
 *  nothing is shared; slugs are kebab-case so they embed safely in a
 *  PostgREST `.or(slug.in.(...))` filter. */
async function sharedEpicStorySlugs(appSlug: string | null): Promise<string[]> {
  const shared = sharedEpicSlugsFor(appSlug)
  if (!shared.length) return []
  const sb = createServiceClient()
  const { data, error } = await sb.from('story_epics').select('story_slug').in('epic_slug', shared)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ story_slug: string }>
  return [...new Set(rows.map((r) => r.story_slug))]
}

// ── Providers ───────────────────────────────────────────────────────────────

/** Published stories — reuse another story's prose. Covers every vertical, since
 *  footshorts/f1 editorial stories are rows in the shared `stories` table.
 *  Beyond the draft's own app, stories curated into a SHARED_EPICS epic are
 *  included too (their app_slug subtitle marks the cross-desk origin). */
const storiesProvider: LibraryProvider = {
  key: 'story',
  label: 'Published stories',
  async list({ appSlug, excludeSlug, offset, limit, query }) {
    const sb = createServiceClient()
    let q = sb
      .from('stories')
      .select('slug, title, app_slug', { count: 'exact' })
      .eq('status', 'published')
      .neq('slug', excludeSlug)
      .order('updated_at', { ascending: false })
    if (query) q = q.ilike('title', ilikePattern(query))
    if (appSlug) {
      const sharedStories = await sharedEpicStorySlugs(appSlug)
      q = sharedStories.length
        ? q.or(`app_slug.eq.${appSlug},slug.in.(${sharedStories.join(',')})`)
        : q.eq('app_slug', appSlug)
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ slug: string; title: string | null; app_slug: string | null }>
    return {
      items: rows.map((r) => ({
        id: r.slug,
        title: r.title ?? r.slug,
        subtitle: r.app_slug ?? undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(slug) {
    const sb = createServiceClient()
    const { data } = await sb.from('stories').select('title, markdown').eq('slug', slug).maybeSingle()
    const text = (data?.markdown ?? '').trim()
    if (!text) return null
    return { title: data?.title ?? slug, byline: `Story · ${slug}`, text }
  },
}

/** Epic explainers — the evergreen pillar narrative + key takeaways for a topic
 *  hub. Only epics that actually carry explainer prose are offered. An app sees
 *  its own epics plus any listed for it in SHARED_EPICS. */
const epicsProvider: LibraryProvider = {
  key: 'epic',
  label: 'Epic explainers',
  async list({ appSlug, offset, limit, query }) {
    const sb = createServiceClient()
    let q = sb.from('epics').select('slug, name, description, explainer').order('slug', { ascending: true })
    if (appSlug) {
      const shared = sharedEpicSlugsFor(appSlug)
      q = shared.length
        ? q.or(`app_slug.eq.${appSlug},slug.in.(${shared.join(',')})`)
        : q.eq('app_slug', appSlug)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      slug: string
      name: string | null
      description: string | null
      explainer: string | null
    }>
    // Explainer prose is required, so we filter (and query) in memory over the
    // small epic set, then page the result.
    const ql = query?.trim().toLowerCase()
    const items = rows
      .filter((r) => (r.explainer ?? '').trim().length > 0)
      .filter((r) => !ql || `${r.name ?? ''} ${r.description ?? ''} ${r.slug}`.toLowerCase().includes(ql))
      .map((r) => ({ id: r.slug, title: r.name ?? r.slug, subtitle: r.description ?? undefined }))
    return pageOf(items, offset, limit)
  },
  async extract(slug) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('epics')
      .select('name, description, explainer, takeaways')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return null
    const takeaways = Array.isArray(data.takeaways)
      ? (data.takeaways as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
    const parts = [
      data.description?.trim(),
      data.explainer?.trim(),
      takeaways.length ? takeaways.map((t) => `- ${t}`).join('\n') : null,
    ].filter(Boolean) as string[]
    const text = parts.join('\n\n').trim()
    if (!text) return null
    return { title: data.name ?? slug, byline: `Epic · ${slug}`, text }
  },
}

/**
 * Vertical news tables (`articles`, `vizf1_articles`) share a shape — RSS items
 * with a short model-written `summary`. One factory serves both; each is
 * app-scoped so footshorts/f1 news only appears when composing for that app.
 * Only `summarized` rows (those with usable text) are offered.
 */
function newsProvider(opts: { key: string; label: string; table: string; app: string }): LibraryProvider {
  return {
    key: opts.key,
    label: opts.label,
    apps: [opts.app],
    async list({ offset, limit, query }) {
      const sb = createServiceClient()
      const { data, error } = await sb
        .from(opts.table)
        .select('id, headline, publisher, summary, published_at')
        .eq('status', 'summarized')
        .order('published_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<{
        id: string
        headline: string | null
        publisher: string | null
        summary: string | null
      }>
      // A usable `summary` is required, so filter (and query) in memory over the
      // bounded feed, then page the result.
      const ql = query?.trim().toLowerCase()
      const items = rows
        .filter((r) => (r.summary ?? '').trim().length > 0)
        .filter((r) => !ql || `${r.headline ?? ''} ${r.publisher ?? ''}`.toLowerCase().includes(ql))
        .map((r) => ({ id: r.id, title: r.headline ?? 'Untitled', subtitle: r.publisher ?? undefined }))
      return pageOf(items, offset, limit)
    },
    async extract(id) {
      const sb = createServiceClient()
      const { data } = await sb
        .from(opts.table)
        .select('headline, publisher, summary, original_snippet, url')
        .eq('id', id)
        .maybeSingle()
      const row = data as {
        headline: string | null
        publisher: string | null
        summary: string | null
        original_snippet: string | null
        url: string | null
      } | null
      if (!row) return null
      const text = [row.headline, row.summary ?? row.original_snippet, row.url ? `Source: ${row.url}` : null]
        .filter(Boolean)
        .join('\n\n')
        .trim()
      if (!text) return null
      return { title: row.headline ?? 'Untitled', byline: row.publisher ?? undefined, text }
    },
  }
}

/**
 * Footshorts rolling match recaps (`daily_recaps`) — one ready-to-read markdown
 * brief per snapshot (a trailing "last X hours" window per scope), written by the
 * recap worker. Lives in the same project as `stories`/`articles`, so the admin
 * service client reaches it. App-scoped to footshorts; the markdown column is the
 * research text verbatim. Items are keyed by the row's surrogate `id`.
 */
const recapsProvider: LibraryProvider = {
  key: 'footshorts-recap',
  label: 'Match recaps',
  apps: ['footshorts'],
  async list({ offset, limit, query }) {
    const sb = createServiceClient()
    let q = sb
      .from('daily_recaps')
      .select('id, scope, window_hours, fixture_count, article_count, generated_at', { count: 'exact' })
      .order('generated_at', { ascending: false })
    if (query) q = q.ilike('scope', ilikePattern(query))
    const { data, error, count } = await q.range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      id: string
      scope: string | null
      window_hours: number | null
      fixture_count: number | null
      article_count: number | null
      generated_at: string
    }>
    const items = rows.map((r) => {
      const scope = r.scope ?? 'all'
      const counts = [
        r.fixture_count ? `${r.fixture_count} fixtures` : null,
        r.article_count ? `${r.article_count} stories` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const window = r.window_hours ? `last ${r.window_hours}h` : 'recap'
      const when = new Date(r.generated_at).toISOString().slice(0, 16).replace('T', ' ')
      return {
        id: r.id,
        title: `${when} · ${scope === 'all' ? 'All competitions' : scope} (${window})`,
        subtitle: counts || undefined,
      }
    })
    return { items, total: count ?? items.length }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('daily_recaps')
      .select('markdown, scope, window_hours, generated_at')
      .eq('id', id)
      .maybeSingle()
    const text = (data?.markdown ?? '').trim()
    if (!text) return null
    const scope = data?.scope ?? 'all'
    const label = scope === 'all' ? 'All competitions' : scope
    const window = data?.window_hours ? `last ${data.window_hours}h` : 'recap'
    const when = data?.generated_at ? new Date(data.generated_at).toISOString().slice(0, 16).replace('T', ' ') : ''
    return { title: `Recap · ${when} · ${label}`, byline: `Match recap · ${label} · ${window}`, text }
  },
}

// ── Search-only dataset providers ────────────────────────────────────────────
// Large corpora that can't be listed wholesale — surfaced only when the user
// queries. Keyword (ilike) match over a couple of text columns each. All are
// vizmaya-fyi epic datasets, so app-scoped accordingly.

/** Cap on how much document body a single dataset item contributes. */
const MAX_DOC_TEXT = 16_000

const ieaNewsProvider: LibraryProvider = {
  key: 'iea-news',
  label: 'IEA energy news',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('iea_news')
      .select('id, title, summary, published_at', { count: 'exact' })
      .or(`title.ilike.${pat},summary.ilike.${pat}`)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ id: number; title: string | null; summary: string | null }>
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        title: r.title ?? 'Untitled',
        subtitle: r.summary?.slice(0, 120) ?? undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('iea_news')
      .select('title, summary, topics, country_codes, source_url')
      .eq('id', Number(id))
      .maybeSingle()
    const row = data as {
      title: string | null
      summary: string | null
      topics: string[] | null
      country_codes: string[] | null
      source_url: string | null
    } | null
    if (!row) return null
    const meta = [
      row.topics?.length ? `Topics: ${row.topics.join(', ')}` : null,
      row.country_codes?.length ? `Countries: ${row.country_codes.join(', ')}` : null,
      row.source_url ? `Source: ${row.source_url}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const text = [row.title, row.summary, meta].filter(Boolean).join('\n\n').trim()
    if (!text) return null
    return { title: row.title ?? 'IEA news', byline: 'IEA energy news', text }
  },
}

const epsteinProvider: LibraryProvider = {
  key: 'epstein',
  label: 'Epstein documents',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('epstein_documents')
      .select('id, filename, source, page_count', { count: 'exact' })
      .or(`filename.ilike.${pat},raw_text.ilike.${pat}`)
      .not('raw_text', 'is', null)
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      id: string
      filename: string | null
      source: string | null
      page_count: number | null
    }>
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.filename ?? 'Untitled document',
        subtitle: [r.source, r.page_count ? `${r.page_count}p` : null].filter(Boolean).join(' · ') || undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('epstein_documents')
      .select('filename, source, source_url, raw_text')
      .eq('id', id)
      .maybeSingle()
    const row = data as {
      filename: string | null
      source: string | null
      source_url: string | null
      raw_text: string | null
    } | null
    if (!row?.raw_text) return null
    const body =
      row.raw_text.length > MAX_DOC_TEXT ? `${row.raw_text.slice(0, MAX_DOC_TEXT)}\n\n…[truncated]` : row.raw_text
    const head = [row.filename, row.source_url ? `Source: ${row.source_url}` : null].filter(Boolean).join('\n')
    return {
      title: row.filename ?? 'Epstein document',
      byline: row.source ? `Epstein corpus · ${row.source}` : 'Epstein corpus',
      text: [head, body].filter(Boolean).join('\n\n').trim(),
    }
  },
}

// Reference books scraped into per-article rows (migration 068). Book-generic:
// one provider searches book_articles across every book-epic, keyed by
// book_name. Search-based so the composer's AI research agent reaches it too,
// not just the picker. Adding a book = a migration + importer, no code here.
const bookFactsProvider: LibraryProvider = {
  key: 'book-facts',
  label: 'Book facts',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('book_articles')
      .select('id, title, book_name, section, page_start', { count: 'exact' })
      .or(`title.ilike.${pat},body.ilike.${pat}`)
      .order('article_index', { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      id: string
      title: string | null
      book_name: string | null
      section: string | null
      page_start: number | null
    }>
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title ?? 'Untitled',
        subtitle:
          [r.book_name, r.section, r.page_start ? `p${r.page_start}` : null].filter(Boolean).join(' · ') ||
          undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('book_articles')
      .select('title, book_name, section, page_start, page_end, body')
      .eq('id', id)
      .maybeSingle()
    const row = data as {
      title: string | null
      book_name: string | null
      section: string | null
      page_start: number | null
      page_end: number | null
      body: string | null
    } | null
    if (!row?.body) return null
    const body = row.body.length > MAX_DOC_TEXT ? `${row.body.slice(0, MAX_DOC_TEXT)}\n\n…[truncated]` : row.body
    const pages =
      row.page_start != null
        ? row.page_end != null && row.page_end !== row.page_start
          ? `pp. ${row.page_start}–${row.page_end}`
          : `p. ${row.page_start}`
        : null
    const head = [row.book_name, row.section, pages].filter(Boolean).join(' · ')
    return {
      title: row.title ?? 'Book excerpt',
      byline: row.book_name ? `${row.book_name}${row.section ? ` · ${row.section}` : ''}` : 'Book facts',
      text: [head, row.title, body].filter(Boolean).join('\n\n').trim(),
    }
  },
}

const cokeStudioProvider: LibraryProvider = {
  key: 'coke-studio',
  label: 'Coke Studio songs',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('coke_studio_songs')
      .select('song_id, title, artists, season, notes', { count: 'exact' })
      .or(`title.ilike.${pat},artists.ilike.${pat},notes.ilike.${pat}`)
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      song_id: string
      title: string | null
      artists: string | null
      season: number | null
    }>
    return {
      items: rows.map((r) => ({
        id: r.song_id,
        title: r.title ?? r.song_id,
        subtitle: [r.artists, r.season ? `S${r.season}` : null].filter(Boolean).join(' · ') || undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('coke_studio_songs')
      .select('title, title_native, artists, lyricists, composers, season, episode, notes, youtube_url')
      .eq('song_id', id)
      .maybeSingle()
    const row = data as {
      title: string | null
      title_native: string | null
      artists: string | null
      lyricists: string | null
      composers: string | null
      season: number | null
      episode: number | null
      notes: string | null
      youtube_url: string | null
    } | null
    if (!row) return null
    // Fair-use place-mention snippets are public; raw lyrics live in a separate
    // service-role-only table and are intentionally NOT pulled in here.
    const { data: mentions } = await sb
      .from('coke_studio_place_mentions')
      .select('place_canonical, lyric_context, lyric_translation')
      .eq('song_id', id)
      .limit(20)
    const mentionRows = (mentions ?? []) as Array<{
      place_canonical: string | null
      lyric_context: string | null
      lyric_translation: string | null
    }>
    const meta = [
      row.artists ? `Artists: ${row.artists}` : null,
      row.lyricists ? `Lyricists: ${row.lyricists}` : null,
      row.composers ? `Composers: ${row.composers}` : null,
      row.season ? `Season ${row.season}${row.episode ? `, episode ${row.episode}` : ''}` : null,
      row.youtube_url ? `Video: ${row.youtube_url}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const places = mentionRows
      .filter((m) => (m.lyric_context ?? '').trim())
      .map(
        (m) =>
          `- ${m.place_canonical ?? 'place'}: “${m.lyric_context}”${
            m.lyric_translation ? ` (${m.lyric_translation})` : ''
          }`,
      )
      .join('\n')
    const text = [
      row.title_native ? `${row.title} (${row.title_native})` : row.title,
      meta,
      row.notes?.trim() ? `Notes: ${row.notes.trim()}` : null,
      places ? `Place mentions:\n${places}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    if (!text) return null
    return { title: row.title ?? 'Coke Studio song', byline: 'Coke Studio', text }
  },
}

/**
 * Country energy profiles (`iea_countries` + `iea_country_energy` +
 * `iea_oil_prices_monthly`) — the per-country dataset behind the vizmaya
 * `/energy-profile` epic map. Like the WC26 teams table, the map only reads it
 * through its own API, so without a provider the numbers can't be reused as
 * research. `extract` reuses the epic's own reader (`getIeaCountryProfile`) and
 * flattens it to the CountryDetail sheet's content: editorial summary, the four
 * stat tiles, latest-year electricity / primary mixes, pump prices, and the
 * country's recent energy news.
 *
 * Serves footshorts as well as vizmaya-fyi: the fifa-wc26 epic gives the
 * football desk per-nation stories, and country energy context belongs in the
 * same research pool. The embedded 30-day news slice also means footshorts gets
 * energy news per country without opening the separate `iea-news` provider.
 */
type EnergyMix = IeaCountryProfile['timeseries']['electricityMix']

/** The most recent year with any share data, flattened to "Source share%"
 *  parts sorted largest-first; null when the mix is empty. */
function latestMixBreakdown(mix: EnergyMix): { year: number; parts: string[] } | null {
  for (let i = mix.years.length - 1; i >= 0; i--) {
    const entries = mix.series
      .map((s) => ({ name: s.name, value: s.values[i] }))
      .filter((e): e is { name: string; value: number } => e.value != null && e.value > 0)
    if (entries.length) {
      entries.sort((a, b) => b.value - a.value)
      return { year: mix.years[i], parts: entries.map((e) => `${e.name} ${e.value.toFixed(1)}%`) }
    }
  }
  return null
}

const energyProfileProvider: LibraryProvider = {
  key: 'energy-profile',
  label: 'Country energy profiles',
  apps: ['vizmaya-fyi', 'footshorts'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('iea_countries')
      .select('code, name, summary', { count: 'exact' })
      .or(`name.ilike.${pat},code.ilike.${pat}`)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ code: string; name: string | null; summary: string | null }>
    return {
      items: rows.map((r) => ({
        id: r.code,
        title: r.name ?? r.code,
        subtitle: r.summary?.slice(0, 120) ?? undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(code) {
    const profile = await getIeaCountryProfile(code)
    if (!profile) return null

    const tile = (key: string, label: string, format: (v: number) => string): string | null => {
      const t = profile.latest[key]
      return t ? `${label}: ${format(t.value)} (${t.year})` : null
    }
    const tiles = [
      tile('energy_per_capita_kwh', 'Energy use per person', (v) => `${Math.round(v).toLocaleString('en-US')} kWh`),
      tile('ghg_from_energy_mt', 'GHG from energy', (v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} Mt CO₂e`),
      tile('renewables_share_energy', 'Renewables share of energy', (v) => `${v.toFixed(1)}%`),
      tile('electricity_demand_twh', 'Electricity demand', (v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} TWh`),
    ].filter(Boolean) as string[]

    const elec = latestMixBreakdown(profile.timeseries.electricityMix)
    const primary = latestMixBreakdown(profile.timeseries.primaryEnergyMix)

    const { months, gasoline, diesel } = profile.timeseries.oilPrices
    const lastMonth = months.length ? months[months.length - 1] : null
    const lastGasoline = gasoline.length ? gasoline[gasoline.length - 1] : null
    const lastDiesel = diesel.length ? diesel[diesel.length - 1] : null
    const fuel =
      lastMonth && (lastGasoline != null || lastDiesel != null)
        ? `Retail fuel prices (${lastMonth}, USD/L): ` +
          [
            lastGasoline != null ? `gasoline ${lastGasoline.toFixed(2)}` : null,
            lastDiesel != null ? `diesel ${lastDiesel.toFixed(2)}` : null,
          ]
            .filter(Boolean)
            .join(', ')
        : null

    const news = profile.news
      .slice(0, 6)
      .map((n) => `- ${n.title} (${n.publishedAt.slice(0, 10)})${n.summary ? ` — ${n.summary}` : ''}`)
      .join('\n')

    const text = [
      `# ${profile.name} (${profile.code}) — country energy profile`,
      profile.summary?.trim() || null,
      tiles.length ? tiles.join('\n') : null,
      elec ? `Electricity mix (${elec.year}): ${elec.parts.join(', ')}` : null,
      primary ? `Primary energy mix (${primary.year}): ${primary.parts.join(', ')}` : null,
      fuel,
      news ? `Recent energy news (30d):\n${news}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()

    return {
      title: `${profile.name} · energy profile`,
      byline: 'Energy profile · OWID / IEA',
      text,
    }
  },
}

/**
 * FIFA World Cup 2026 teams (`fifa_wc26_teams`) — the per-nation dataset behind
 * the footshorts `fifa-wc26` epic map / team-profile panel: squad value, GDP,
 * population, inequality, democracy index, FIFA rank, GHI, WHR. The map only
 * reads this table client-side, so without a provider the numbers can't be
 * reused as research; this surfaces one team's full profile on attach.
 *
 * Search-based (48 rows, but the picker's "type to query datasets" affordance
 * is search): match a country name / FIFA code / confederation. App-scoped to
 * footshorts, where the epic now lives. `extract` reproduces the panel's stat
 * block AND each metric's rank among the 48 — computed exactly like the
 * landing's `getFifaWc26TeamProfile` (rank 1 = highest value).
 */
const FIFA_WC26_COLS =
  'code, name, confederation, qualification, is_host, is_debut, ' +
  'squad_value_eur_mn, gdp_nominal_usd_bn, gdp_per_capita_ppp_usd, ' +
  'population_mn, land_area_sq_km, gini_index, eiu_democracy_index_2024, ' +
  'regime_type, fifa_ranking, ghi_2025_score, whr_2025_rank'

interface FifaWc26Row {
  code: string
  name: string
  confederation: string
  qualification: string
  is_host: boolean
  is_debut: boolean
  squad_value_eur_mn: number | null
  gdp_nominal_usd_bn: number | null
  gdp_per_capita_ppp_usd: number | null
  population_mn: number | null
  land_area_sq_km: number | null
  gini_index: number | null
  eiu_democracy_index_2024: number | null
  regime_type: string | null
  fifa_ranking: number | null
  ghi_2025_score: number | null
  whr_2025_rank: number | null
}

/** Rank a value (1 = highest) within a desc-sorted list; null → no rank. */
function fifaRankOf(value: number | null, descSorted: number[]): number | null {
  if (value == null) return null
  const idx = descSorted.findIndex((v) => v <= value)
  return idx === -1 ? descSorted.length : idx + 1
}

const fifaWc26Provider: LibraryProvider = {
  key: 'fifa-wc26',
  label: 'World Cup 2026 teams',
  apps: ['footshorts'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('fifa_wc26_teams')
      .select('code, name, confederation, squad_value_eur_mn, fifa_ranking', { count: 'exact' })
      .or(`name.ilike.${pat},code.ilike.${pat},confederation.ilike.${pat}`)
      .order('squad_value_eur_mn', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      code: string
      name: string | null
      confederation: string | null
      squad_value_eur_mn: number | null
      fifa_ranking: number | null
    }>
    return {
      items: rows.map((r) => ({
        id: r.code,
        title: r.name ?? r.code,
        subtitle:
          [
            r.confederation,
            r.squad_value_eur_mn != null ? `€${r.squad_value_eur_mn.toLocaleString('en-US')}mn squad` : null,
            r.fifa_ranking != null ? `FIFA #${r.fifa_ranking}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(code) {
    const sb = createServiceClient()
    // The row IS the profile, but ranks need the whole field — fetch all 48.
    const { data, error } = await sb.from('fifa_wc26_teams').select(FIFA_WC26_COLS)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as FifaWc26Row[]
    const team = rows.find((r) => r.code === code)
    if (!team) return null

    const total = rows.length
    const sortedDesc = (pick: (r: FifaWc26Row) => number | null): number[] =>
      rows
        .map(pick)
        .filter((v): v is number => v != null)
        .sort((a, b) => b - a)
    const rank = (value: number | null, pick: (r: FifaWc26Row) => number | null): string =>
      value == null ? '' : ` (#${fifaRankOf(value, sortedDesc(pick))} of ${total})`

    const num = (n: number | null): string => (n == null ? '—' : n.toLocaleString('en-US'))
    const gdpNominal = (n: number | null): string =>
      n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(2)} tn` : `$${n.toLocaleString('en-US')} bn`
    const flags = [team.is_host ? 'Host' : null, team.is_debut ? 'Debut' : null].filter(Boolean).join(', ')

    const lines = [
      `Confederation: ${team.confederation}`,
      `Qualification: ${team.qualification}${flags ? ` (${flags})` : ''}`,
      team.fifa_ranking != null ? `FIFA ranking: #${team.fifa_ranking}` : null,
      '',
      `Squad value: €${num(team.squad_value_eur_mn)} mn${rank(team.squad_value_eur_mn, (r) => r.squad_value_eur_mn)}`,
      `GDP nominal: ${gdpNominal(team.gdp_nominal_usd_bn)}${rank(team.gdp_nominal_usd_bn, (r) => r.gdp_nominal_usd_bn)}`,
      `GDP per capita (PPP): $${num(team.gdp_per_capita_ppp_usd)}${rank(team.gdp_per_capita_ppp_usd, (r) => r.gdp_per_capita_ppp_usd)}`,
      `Population: ${num(team.population_mn)} mn${rank(team.population_mn, (r) => r.population_mn)}`,
      `Land area: ${num(team.land_area_sq_km)} sq km${rank(team.land_area_sq_km, (r) => r.land_area_sq_km)}`,
      `Gini index: ${num(team.gini_index)}`,
      `EIU democracy index 2024: ${num(team.eiu_democracy_index_2024)}${rank(team.eiu_democracy_index_2024, (r) => r.eiu_democracy_index_2024)}`,
      team.regime_type ? `Regime: ${team.regime_type}` : null,
      team.ghi_2025_score != null ? `Global Hunger Index 2025: ${num(team.ghi_2025_score)}` : null,
      team.whr_2025_rank != null ? `World Happiness Report 2025 rank: #${team.whr_2025_rank}` : null,
    ]
      .filter((l) => l != null)
      .join('\n')

    const text = `# ${team.name} (${team.code}) — World Cup 2026 profile\n\n${lines}`
    return {
      title: `${team.name} · World Cup 2026`,
      byline: `FIFA World Cup 2026 · ${team.confederation}`,
      text,
    }
  },
}

// ── AI Data Centers epic providers ───────────────────────────────────────────
// The epic's three live streams (migrations 065–066), all scoped to vizmaya-fyi:
// the DC-specific news feed, the daily recap briefs, and the stock watchlist.
// All reuse content-source readers so the dc_* SQL stays in one place.

/**
 * AI Data Centers news (`dc_news`) — the DC-specific Google-News feed, Gemma
 * relevance-gated and ticker-linked. Distinct from `iea_news` above (energy-
 * agency coverage). Search-based like its IEA sibling; reuses the admin reader
 * so only classifier-relevant stories surface.
 */
const dcNewsProvider: LibraryProvider = {
  key: 'dc-news',
  label: 'Data center news',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    // The admin reader takes no offset, so this is a single page: report
    // total = items.length (no "Load more"), and beyond page 1 return nothing.
    if (offset > 0) return { items: [], total: 0 }
    const rows = await listDcNewsForAdmin({ q: query, limit, relevance: 'relevant' })
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        subtitle: r.source ?? r.summary?.slice(0, 120) ?? undefined,
      })),
      total: rows.length,
    }
  },
  async extract(id) {
    const sb = createServiceClient()
    const { data } = await sb
      .from('dc_news')
      .select('title, summary, source, source_url, topics, tickers')
      .eq('id', Number(id))
      .maybeSingle()
    const row = data as {
      title: string | null
      summary: string | null
      source: string | null
      source_url: string | null
      topics: string[] | null
      tickers: string[] | null
    } | null
    if (!row) return null
    const meta = [
      row.topics?.length ? `Topics: ${row.topics.join(', ')}` : null,
      row.tickers?.length ? `Tickers: ${row.tickers.join(', ')}` : null,
      row.source_url ? `Source: ${row.source_url}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const text = [row.title, row.summary, meta].filter(Boolean).join('\n\n').trim()
    if (!text) return null
    return { title: row.title ?? 'Data center news', byline: row.source ?? 'Data center news', text }
  },
}

/**
 * AI Data Centers recaps (`dc_news_recaps`) — the daily markdown brief digesting
 * dc_news (LLM headline + themed sections + a market-movers table), one row per
 * run. List-based like the footshorts recap provider; the markdown is the
 * research text verbatim (plain prose/links, no `fs:` fences to graft).
 */
const dcNewsRecapProvider: LibraryProvider = {
  key: 'dc-news-recap',
  label: 'Data center recaps',
  apps: ['vizmaya-fyi'],
  async list({ offset, limit, query }) {
    const recaps = await listDcNewsRecaps(100)
    const ql = query?.trim().toLowerCase()
    const items = recaps
      .map((r) => {
        const when = new Date(r.generatedAt).toISOString().slice(0, 16).replace('T', ' ')
        const meta = [
          r.windowHours ? `last ${r.windowHours}h` : null,
          r.articleCount ? `${r.articleCount} stories` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return {
          id: String(r.id),
          title: r.headline ?? `${when} recap`,
          subtitle: meta || undefined,
        }
      })
      .filter((it) => !ql || `${it.title} ${it.subtitle ?? ''}`.toLowerCase().includes(ql))
    return pageOf(items, offset, limit)
  },
  async extract(id) {
    const recap = await getDcNewsRecap(Number(id))
    const text = (recap?.markdown ?? '').trim()
    if (!recap || !text) return null
    const day = new Date(recap.generatedAt).toISOString().slice(0, 10)
    return {
      title: recap.headline ?? `Data center recap · ${day}`,
      byline: `Data center recap · ${day}`,
      text,
    }
  },
}

// ── Stock watchlist (`dc_stocks` + `dc_stock_prices`) ─────────────────────────
// Two providers keyed distinctly so a single query can't collide their groups
// (the picker keys sections by provider key): a list-only whole-market snapshot
// surfaced up front, and a search-only per-ticker lookup (also reachable by the
// AI-research enrich agent, which only sees `search` providers). Both flatten
// getDcStockMarket's computed series into research prose; the heavy price read
// runs only on attach (extract), never on list.

const DC_STOCK_WINDOW_DAYS = 90
const DC_CATEGORY_LABELS: Record<string, string> = {
  semiconductors: 'Semiconductors',
  'semi-equipment': 'Semiconductor equipment',
  hyperscalers: 'Hyperscalers',
  'data-centers': 'Data centers & infrastructure',
}
const dcCategoryLabel = (cat: string): string => DC_CATEGORY_LABELS[cat] ?? cat
const fmtClose = (value: number | null, currency: string): string =>
  value == null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
const fmtPct = (pct: number | null): string =>
  pct == null ? 'n/a' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`

const dcStockMarketProvider: LibraryProvider = {
  key: 'dc-stock-market',
  label: 'Data center market',
  apps: ['vizmaya-fyi'],
  async list({ offset, limit, query }) {
    // Cheap head-count only — the price series is read lazily in extract.
    const sb = createServiceClient()
    const { count } = await sb
      .from('dc_stocks')
      .select('ticker', { count: 'exact', head: true })
      .eq('is_active', true)
    const item: LibraryItem = {
      id: 'snapshot',
      title: 'Market snapshot — all tracked tickers',
      subtitle: count ? `${count} tickers · latest closes + ${DC_STOCK_WINDOW_DAYS}d change` : undefined,
    }
    const ql = query?.trim().toLowerCase()
    const items = ql && !item.title.toLowerCase().includes(ql) ? [] : [item]
    return pageOf(items, offset, limit)
  },
  async extract() {
    const market = await getDcStockMarket(DC_STOCK_WINDOW_DAYS)
    if (!market.length) return null
    const dates = market.map((s) => s.latestDate).filter((d): d is string => !!d).sort()
    const latestDate = dates.length ? dates[dates.length - 1] : null
    const byCategory = new Map<string, DcStockSeries[]>()
    for (const s of market) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, [])
      byCategory.get(s.category)!.push(s)
    }
    const sections = [...byCategory.entries()].map(([cat, list]) => {
      const lines = list.map(
        (s) => `- ${s.name} (${s.ticker}): ${fmtClose(s.latestClose, s.currency)}, ${fmtPct(s.changePct)}`,
      )
      return `${dcCategoryLabel(cat)}\n${lines.join('\n')}`
    })
    const text = [
      `# Data center stock watchlist — ${DC_STOCK_WINDOW_DAYS}-day snapshot`,
      latestDate
        ? `Latest close ${latestDate}. Prices are in each listing's native currency; change is first→last close over the ${DC_STOCK_WINDOW_DAYS}-day window.`
        : null,
      ...sections,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    return { title: 'Data center market snapshot', byline: `Stock watchlist · ${latestDate ?? 'latest'}`, text }
  },
}

const dcStocksProvider: LibraryProvider = {
  key: 'dc-stocks',
  label: 'Data center stocks',
  apps: ['vizmaya-fyi'],
  async search({ query, limit, offset }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error, count } = await sb
      .from('dc_stocks')
      .select('ticker, name, exchange, category', { count: 'exact' })
      .eq('is_active', true)
      .or(`name.ilike.${pat},ticker.ilike.${pat},category.ilike.${pat}`)
      .order('category')
      .order('ticker')
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      ticker: string
      name: string | null
      exchange: string | null
      category: string | null
    }>
    return {
      items: rows.map((r) => ({
        id: r.ticker,
        title: r.name ? `${r.name} (${r.ticker})` : r.ticker,
        subtitle:
          [r.category ? dcCategoryLabel(r.category) : null, r.exchange].filter(Boolean).join(' · ') || undefined,
      })),
      total: count ?? rows.length,
    }
  },
  async extract(ticker) {
    const market = await getDcStockMarket(DC_STOCK_WINDOW_DAYS)
    const s = market.find((x) => x.ticker === ticker)
    if (!s) return null
    const tail = s.points
      .slice(-10)
      .map(([d, c]) => `  ${d}: ${c.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
    const text = [
      `# ${s.name} (${s.ticker}) — ${dcCategoryLabel(s.category)}`,
      [
        `Exchange: ${s.exchange} (${s.market})`,
        `Currency: ${s.currency}`,
        `Latest close: ${fmtClose(s.latestClose, s.currency)}${s.latestDate ? ` (${s.latestDate})` : ''}`,
        `Change over ${DC_STOCK_WINDOW_DAYS}d: ${fmtPct(s.changePct)}`,
      ].join('\n'),
      tail.length ? `Recent closes (${s.currency}):\n${tail.join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    return { title: `${s.name} · stock`, byline: `Stock · ${s.ticker}`, text }
  },
}

const PROVIDERS: LibraryProvider[] = [
  storiesProvider,
  epicsProvider,
  newsProvider({ key: 'footshorts-news', label: 'Football news', table: 'articles', app: 'footshorts' }),
  recapsProvider,
  fifaWc26Provider,
  newsProvider({ key: 'vizf1-news', label: 'F1 news', table: 'vizf1_articles', app: 'vizf1' }),
  ieaNewsProvider,
  energyProfileProvider,
  epsteinProvider,
  bookFactsProvider,
  cokeStudioProvider,
  dcNewsProvider,
  dcNewsRecapProvider,
  dcStockMarketProvider,
  dcStocksProvider,
]

const byKey = new Map(PROVIDERS.map((p) => [p.key, p]))

// ── Public API (used by the compose routes) ──────────────────────────────────

/** The draft's app_slug (null if the row/column is missing). */
export async function getDraftApp(slug: string): Promise<string | null> {
  try {
    const sb = createServiceClient()
    const { data } = await sb.from('stories').select('app_slug').eq('slug', slug).maybeSingle()
    return (data?.app_slug as string | undefined) ?? null
  } catch {
    return null
  }
}

/** Default page size for a picker tab. */
const PAGE_LIMIT = 20

/** Is a provider in scope for a draft's app? Providers with no `apps` serve all. */
function providerServesApp(p: LibraryProvider, appSlug: string | null): boolean {
  return !p.apps || (appSlug != null && p.apps.includes(appSlug))
}

/**
 * The picker's tab strip for a draft — every applicable provider (one tab each)
 * plus the two synthetic "Research sources" and "Document assets" tabs. Cheap:
 * only the app-scope filter runs, no per-provider query, so items are loaded
 * lazily per tab through {@link getLibraryGroupPage} / the page route.
 *
 * Unlike the old flat list this does NOT drop empty providers (that would need a
 * query per provider) — a provider whose corpus is empty simply shows an empty
 * tab. For the primary desks every applicable provider is backed by a real
 * table, so phantom tabs are not a concern in practice.
 */
export async function getLibraryTabs(slug: string): Promise<LibraryTab[]> {
  const appSlug = await getDraftApp(slug)
  const providerTabs: LibraryTab[] = PROVIDERS.filter(
    (p) => (p.list || p.search) && providerServesApp(p, appSlug),
  ).map((p) => ({
    key: p.key,
    label: p.label,
    mode: p.list ? 'list' : 'search',
    kind: 'provider',
  }))
  return [
    ...providerTabs,
    { key: 'sources', label: 'Research sources', mode: 'list', kind: 'sources' },
    { key: 'assets', label: 'Document assets', mode: 'list', kind: 'assets' },
  ]
}

/**
 * One page of a single provider tab. Uses the provider's `list` when it has one
 * (passing the active `query` for a server-side filter), else its `search`
 * (which needs a >=2-char query — short queries return an empty page, matching
 * {@link searchLibrary}). App-scope is enforced and errors are isolated, so a
 * bad tab yields an empty page rather than failing the picker.
 */
export async function getLibraryGroupPage(
  slug: string,
  key: string,
  opts: { offset?: number; limit?: number; query?: string } = {},
): Promise<LibraryPage> {
  const provider = byKey.get(key)
  if (!provider) return { items: [], total: 0 }
  const appSlug = await getDraftApp(slug)
  if (!providerServesApp(provider, appSlug)) return { items: [], total: 0 }
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? PAGE_LIMIT
  const query = (opts.query ?? '').trim()
  try {
    if (provider.list) {
      return await provider.list({ appSlug, excludeSlug: slug, offset, limit, query: query || undefined })
    }
    if (provider.search) {
      if (query.length < 2) return { items: [], total: 0 }
      return await provider.search({ appSlug, excludeSlug: slug, query, offset, limit })
    }
    return { items: [], total: 0 }
  } catch {
    return { items: [], total: 0 }
  }
}

/** Max hits returned per dataset for a single query. */
const SEARCH_LIMIT = 25

/**
 * Run every applicable SEARCH-based provider (the large datasets) against a
 * query and return their non-empty groups. Short queries return nothing — the
 * picker only hits the DB once there's something to match. Each provider is
 * isolated; one that throws is dropped.
 */
export async function searchLibrary(slug: string, rawQuery: string): Promise<LibraryGroup[]> {
  const query = rawQuery.trim()
  if (query.length < 2) return []
  const appSlug = await getDraftApp(slug)
  const applicable = PROVIDERS.filter(
    (p) => p.search && (!p.apps || (appSlug != null && p.apps.includes(appSlug))),
  )
  const groups = await Promise.all(
    applicable.map(async (p) => {
      try {
        const { items } = await p.search!({ appSlug, excludeSlug: slug, query, limit: SEARCH_LIMIT, offset: 0 })
        return items.length ? { key: p.key, label: p.label, items } : null
      } catch {
        return null
      }
    }),
  )
  return groups.filter((g): g is LibraryGroup => g != null)
}

/** Resolve one provider item to extractable text, or null if unavailable. */
export async function extractLibraryItem(
  providerKey: string,
  itemId: string,
): Promise<LibraryExtract | null> {
  const provider = byKey.get(providerKey)
  if (!provider) return null
  try {
    return await provider.extract(itemId)
  } catch {
    return null
  }
}
