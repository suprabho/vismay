import { createServiceClient } from '@vismay/content-source/supabase'

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
}

interface SearchCtx extends ListCtx {
  /** The user's (sanitised) query — never empty when `search` is invoked. */
  query: string
  /** Max hits to return. */
  limit: number
}

/**
 * A provider is `list`-based (bounded set surfaced up front — stories, epics,
 * news), `search`-based (large corpus queried on demand — the datasets), or
 * both. `extract` resolves a chosen item's text regardless of how it surfaced.
 */
interface LibraryProvider {
  key: string
  label: string
  /** Which app_slugs this provider serves; omit to serve every app. */
  apps?: string[]
  list?(ctx: ListCtx): Promise<LibraryItem[]>
  search?(ctx: SearchCtx): Promise<LibraryItem[]>
  extract(id: string): Promise<LibraryExtract | null>
}

/** Strip characters that would break a PostgREST `.or(...)` filter, then wrap as
 *  an ilike pattern. Keeps user queries from injecting filter syntax. */
function ilikePattern(query: string): string {
  const safe = query.replace(/[%,()*\\:]/g, ' ').replace(/\s+/g, ' ').trim()
  return `%${safe}%`
}

// ── Providers ───────────────────────────────────────────────────────────────

/** Published stories — reuse another story's prose. Covers every vertical, since
 *  footshorts/f1 editorial stories are rows in the shared `stories` table. */
const storiesProvider: LibraryProvider = {
  key: 'story',
  label: 'Published stories',
  async list({ appSlug, excludeSlug }) {
    const sb = createServiceClient()
    let q = sb
      .from('stories')
      .select('slug, title, app_slug')
      .eq('status', 'published')
      .neq('slug', excludeSlug)
      .order('updated_at', { ascending: false })
      .limit(500)
    if (appSlug) q = q.eq('app_slug', appSlug)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ slug: string; title: string | null; app_slug: string | null }>
    return rows.map((r) => ({
      id: r.slug,
      title: r.title ?? r.slug,
      subtitle: r.app_slug ?? undefined,
    }))
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
 *  hub. Only epics that actually carry explainer prose are offered. */
const epicsProvider: LibraryProvider = {
  key: 'epic',
  label: 'Epic explainers',
  async list({ appSlug }) {
    const sb = createServiceClient()
    let q = sb.from('epics').select('slug, name, description, explainer').order('slug', { ascending: true })
    if (appSlug) q = q.eq('app_slug', appSlug)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      slug: string
      name: string | null
      description: string | null
      explainer: string | null
    }>
    return rows
      .filter((r) => (r.explainer ?? '').trim().length > 0)
      .map((r) => ({ id: r.slug, title: r.name ?? r.slug, subtitle: r.description ?? undefined }))
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
    async list() {
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
      return rows
        .filter((r) => (r.summary ?? '').trim().length > 0)
        .map((r) => ({ id: r.id, title: r.headline ?? 'Untitled', subtitle: r.publisher ?? undefined }))
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
 * Footshorts daily match-day recaps (`daily_recaps`) — one ready-to-read
 * markdown brief per (date, scope), written by the recap worker. Lives in the
 * same project as `stories`/`articles`, so the admin service client reaches it.
 * App-scoped to footshorts; the markdown column is the research text verbatim.
 *
 * The table's primary key is composite (recap_date, scope), so an item id packs
 * both as `<recap_date>/<scope>` — neither an ISO date nor a competition slug
 * contains a slash, so a single split on the first `/` round-trips cleanly.
 */
const recapsProvider: LibraryProvider = {
  key: 'footshorts-recap',
  label: 'Match-day recaps',
  apps: ['footshorts'],
  async list() {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('daily_recaps')
      .select('recap_date, scope, fixture_count, article_count')
      .order('recap_date', { ascending: false })
      .order('scope', { ascending: true })
      .limit(100)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      recap_date: string
      scope: string | null
      fixture_count: number | null
      article_count: number | null
    }>
    return rows.map((r) => {
      const scope = r.scope ?? 'all'
      const counts = [
        r.fixture_count ? `${r.fixture_count} fixtures` : null,
        r.article_count ? `${r.article_count} stories` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return {
        id: `${r.recap_date}/${scope}`,
        title: `${r.recap_date} · ${scope === 'all' ? 'All competitions' : scope}`,
        subtitle: counts || undefined,
      }
    })
  },
  async extract(id) {
    const slash = id.indexOf('/')
    const recapDate = slash === -1 ? id : id.slice(0, slash)
    const scope = slash === -1 ? 'all' : id.slice(slash + 1)
    const sb = createServiceClient()
    const { data } = await sb
      .from('daily_recaps')
      .select('markdown')
      .eq('recap_date', recapDate)
      .eq('scope', scope)
      .maybeSingle()
    const text = (data?.markdown ?? '').trim()
    if (!text) return null
    const label = scope === 'all' ? 'All competitions' : scope
    return { title: `Recap · ${recapDate} · ${label}`, byline: `Match-day recap · ${label}`, text }
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
  async search({ query, limit }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error } = await sb
      .from('iea_news')
      .select('id, title, summary, published_at')
      .or(`title.ilike.${pat},summary.ilike.${pat}`)
      .order('published_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ id: number; title: string | null; summary: string | null }>
    return rows.map((r) => ({
      id: String(r.id),
      title: r.title ?? 'Untitled',
      subtitle: r.summary?.slice(0, 120) ?? undefined,
    }))
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
  async search({ query, limit }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error } = await sb
      .from('epstein_documents')
      .select('id, filename, source, page_count')
      .or(`filename.ilike.${pat},raw_text.ilike.${pat}`)
      .not('raw_text', 'is', null)
      .limit(limit)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      id: string
      filename: string | null
      source: string | null
      page_count: number | null
    }>
    return rows.map((r) => ({
      id: r.id,
      title: r.filename ?? 'Untitled document',
      subtitle: [r.source, r.page_count ? `${r.page_count}p` : null].filter(Boolean).join(' · ') || undefined,
    }))
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

const cokeStudioProvider: LibraryProvider = {
  key: 'coke-studio',
  label: 'Coke Studio songs',
  apps: ['vizmaya-fyi'],
  async search({ query, limit }) {
    const sb = createServiceClient()
    const pat = ilikePattern(query)
    const { data, error } = await sb
      .from('coke_studio_songs')
      .select('song_id, title, artists, season, notes')
      .or(`title.ilike.${pat},artists.ilike.${pat},notes.ilike.${pat}`)
      .limit(limit)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      song_id: string
      title: string | null
      artists: string | null
      season: number | null
    }>
    return rows.map((r) => ({
      id: r.song_id,
      title: r.title ?? r.song_id,
      subtitle: [r.artists, r.season ? `S${r.season}` : null].filter(Boolean).join(' · ') || undefined,
    }))
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

const PROVIDERS: LibraryProvider[] = [
  storiesProvider,
  epicsProvider,
  newsProvider({ key: 'footshorts-news', label: 'Football news', table: 'articles', app: 'footshorts' }),
  recapsProvider,
  newsProvider({ key: 'vizf1-news', label: 'F1 news', table: 'vizf1_articles', app: 'vizf1' }),
  ieaNewsProvider,
  epsteinProvider,
  cokeStudioProvider,
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

/**
 * Every applicable provider's group for a draft. Each provider runs
 * independently — one that throws (missing table, etc.) is dropped rather than
 * failing the whole picker. Empty groups are omitted.
 */
export async function getLibraryGroups(slug: string): Promise<LibraryGroup[]> {
  const appSlug = await getDraftApp(slug)
  const applicable = PROVIDERS.filter(
    (p) => p.list && (!p.apps || (appSlug != null && p.apps.includes(appSlug))),
  )
  const groups = await Promise.all(
    applicable.map(async (p) => {
      try {
        const items = await p.list!({ appSlug, excludeSlug: slug })
        return items.length ? { key: p.key, label: p.label, items } : null
      } catch {
        return null
      }
    }),
  )
  return groups.filter((g): g is LibraryGroup => g != null)
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
        const items = await p.search!({ appSlug, excludeSlug: slug, query, limit: SEARCH_LIMIT })
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
