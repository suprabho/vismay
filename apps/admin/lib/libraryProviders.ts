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

interface LibraryProvider {
  key: string
  label: string
  /** Which app_slugs this provider serves; omit to serve every app. */
  apps?: string[]
  list(ctx: ListCtx): Promise<LibraryItem[]>
  extract(id: string): Promise<LibraryExtract | null>
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

const PROVIDERS: LibraryProvider[] = [
  storiesProvider,
  epicsProvider,
  newsProvider({ key: 'footshorts-news', label: 'Football news', table: 'articles', app: 'footshorts' }),
  newsProvider({ key: 'vizf1-news', label: 'F1 news', table: 'vizf1_articles', app: 'vizf1' }),
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
  const applicable = PROVIDERS.filter((p) => !p.apps || (appSlug != null && p.apps.includes(appSlug)))
  const groups = await Promise.all(
    applicable.map(async (p) => {
      try {
        const items = await p.list({ appSlug, excludeSlug: slug })
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
