import type { Theme } from '@vismay/viz-engine'
import { fillTheme, normalizeTheme } from '@vismay/viz-engine'
import { createServiceClient } from './supabase'

/**
 * Story themes — the saved-theme library behind the admin theme editor's
 * "Presets" strip. A row is a full story `Theme` (colours + fonts) under a
 * name, either shared by every app (`app_slug` null) or owned by one app. Each
 * app may flag one row `is_default`: that theme seeds every new story of the
 * app (`POST /api/stories/compose`) instead of the neutral editorial
 * `DEFAULT_THEME`.
 *
 * Applying a preset to a story is a COPY into the story's frontmatter (the
 * renderer reads `frontmatter.theme` only) — rows are never linked from
 * stories, so editing a row never retroactively restyles published stories.
 *
 * The four built-in rows (footshorts classic/pitch/terrace, vizf1 paddock) are
 * seeded by migration 077 from `STORY_THEME_PRESETS` in
 * `@vismay/viz-engine` (lib/themeDefaults) — the admin merges DB rows over
 * that list by slug so built-ins can be edited but not deleted.
 * See migration `077_story_themes.sql`.
 */

export interface StoryTheme {
  id: string
  /** Stable key (`<app|shared>-<name>`); the merge key against built-ins. */
  slug: string
  name: string
  /** Owning app slug; `null` = visible to every app. */
  appSlug: string | null
  theme: Theme
  /** Seeds new stories of `appSlug` (one per app; never true for shared rows). */
  isDefault: boolean
  /** Seeded by migration — the admin hides delete for these. */
  builtin: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface NewStoryTheme {
  name: string
  appSlug?: string | null
  theme: unknown
  isDefault?: boolean
}

export interface StoryThemeUpdate {
  name?: string
  theme?: unknown
}

const SELECT_COLUMNS =
  'id, slug, name, app_slug, theme, is_default, builtin, sort_order, created_at, updated_at'

function rowToStoryTheme(r: Record<string, unknown>): StoryTheme {
  // Trust the row but fill any missing required token: a partial jsonb must
  // never crash ThemeProvider, which hard-reads every required key.
  const validated = normalizeTheme(r.theme)
  const theme = validated ?? fillTheme((r.theme ?? {}) as Partial<Theme>)
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    appSlug: (r.app_slug as string | null) ?? null,
    theme,
    isDefault: Boolean(r.is_default),
    builtin: Boolean(r.builtin),
    sortOrder: (r.sort_order as number | null) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** kebab-case slug from a preset name (local so this module never pulls story-pipeline). */
function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'theme'
  )
}

/** Sanity-limit on app slugs coming from request bodies / query strings. */
const APP_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isValidAppSlug(v: unknown): v is string {
  return typeof v === 'string' && APP_SLUG_RE.test(v)
}

/**
 * Every theme an app's editors can pick from: the shared rows plus the app's
 * own, built-ins first (by `sort_order`), then by name.
 */
export async function listStoryThemes(appSlug: string): Promise<StoryTheme[]> {
  if (!isValidAppSlug(appSlug)) throw new Error(`listStoryThemes: invalid app slug "${appSlug}"`)
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_themes')
    .select(SELECT_COLUMNS)
    .or(`app_slug.is.null,app_slug.eq.${appSlug}`)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(`listStoryThemes: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(rowToStoryTheme)
}

export async function getStoryTheme(id: string): Promise<StoryTheme | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_themes')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getStoryTheme ${id}: ${error.message}`)
  return data ? rowToStoryTheme(data as Record<string, unknown>) : null
}

/**
 * The theme an app seeds new stories from, or `null` when the app has no
 * default row (callers fall back to `DEFAULT_THEME`).
 */
export async function getDefaultStoryTheme(appSlug: string | null | undefined): Promise<Theme | null> {
  if (!isValidAppSlug(appSlug)) return null
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_themes')
    .select(SELECT_COLUMNS)
    .eq('app_slug', appSlug)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw new Error(`getDefaultStoryTheme ${appSlug}: ${error.message}`)
  return data ? rowToStoryTheme(data as Record<string, unknown>).theme : null
}

export async function createStoryTheme(input: NewStoryTheme): Promise<StoryTheme> {
  const name = input.name.trim()
  if (!name) throw new Error('createStoryTheme: name is required')
  if (name.length > 80) throw new Error('createStoryTheme: name must be ≤ 80 chars')
  const appSlug = input.appSlug ?? null
  if (appSlug !== null && !isValidAppSlug(appSlug)) {
    throw new Error(`createStoryTheme: invalid app slug "${appSlug}"`)
  }
  const theme = normalizeTheme(input.theme)
  if (!theme) throw new Error('createStoryTheme: theme must carry every required colour (hex) and font')
  if (input.isDefault && appSlug === null) {
    throw new Error('createStoryTheme: a shared theme cannot be an app default')
  }

  const sb = createServiceClient()
  const base = `${appSlug ?? 'shared'}-${slugifyName(name)}`
  // Reserve a free slug: `<base>`, then `<base>-2`, `<base>-3`, …
  const { data: taken, error: takenErr } = await sb
    .from('story_themes')
    .select('slug')
    .like('slug', `${base}%`)
  if (takenErr) throw new Error(`createStoryTheme: ${takenErr.message}`)
  const used = new Set(((taken ?? []) as { slug: string }[]).map((r) => r.slug))
  let slug = base
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`

  const { data, error } = await sb
    .from('story_themes')
    .insert({ slug, name, app_slug: appSlug, theme, is_default: false, builtin: false })
    .select(SELECT_COLUMNS)
    .single()
  if (error) throw new Error(`createStoryTheme: ${error.message}`)
  const row = rowToStoryTheme(data as Record<string, unknown>)
  if (input.isDefault) return setDefaultStoryTheme(row.id)
  return row
}

export async function updateStoryTheme(id: string, patch: StoryThemeUpdate): Promise<StoryTheme> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('updateStoryTheme: name is required')
    if (name.length > 80) throw new Error('updateStoryTheme: name must be ≤ 80 chars')
    update.name = name
  }
  if (patch.theme !== undefined) {
    const theme = normalizeTheme(patch.theme)
    if (!theme) throw new Error('updateStoryTheme: theme must carry every required colour (hex) and font')
    update.theme = theme
  }
  if (Object.keys(update).length === 0) {
    const existing = await getStoryTheme(id)
    if (!existing) throw new Error(`updateStoryTheme ${id}: not found`)
    return existing
  }
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_themes')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()
  if (error) throw new Error(`updateStoryTheme ${id}: ${error.message}`)
  return rowToStoryTheme(data as Record<string, unknown>)
}

/**
 * Make `id` the default for its app: clear the app's current default, then
 * flag this row. Two statements — the partial unique index
 * (`idx_story_themes_default_per_app`) guards a concurrent second writer.
 */
export async function setDefaultStoryTheme(id: string): Promise<StoryTheme> {
  const row = await getStoryTheme(id)
  if (!row) throw new Error(`setDefaultStoryTheme ${id}: not found`)
  if (row.appSlug === null) throw new Error('setDefaultStoryTheme: a shared theme cannot be an app default')
  const sb = createServiceClient()
  const clear = await sb
    .from('story_themes')
    .update({ is_default: false })
    .eq('app_slug', row.appSlug)
    .eq('is_default', true)
    .neq('id', id)
  if (clear.error) throw new Error(`setDefaultStoryTheme ${id}: ${clear.error.message}`)
  const { data, error } = await sb
    .from('story_themes')
    .update({ is_default: true })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()
  if (error) throw new Error(`setDefaultStoryTheme ${id}: ${error.message}`)
  return rowToStoryTheme(data as Record<string, unknown>)
}

/** Delete a saved theme. Built-in rows are protected (edit them instead). */
export async function deleteStoryTheme(id: string): Promise<void> {
  const row = await getStoryTheme(id)
  if (!row) return
  if (row.builtin) throw new Error('deleteStoryTheme: built-in themes cannot be deleted')
  const sb = createServiceClient()
  const { error } = await sb.from('story_themes').delete().eq('id', id)
  if (error) throw new Error(`deleteStoryTheme ${id}: ${error.message}`)
}
