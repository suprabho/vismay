/**
 * Content source abstraction — one raw-I/O boundary for story content.
 *
 * `content.ts` and `storyConfig.ts` go through this so their parsers
 * (gray-matter, yaml.parse) see the same strings whether the underlying
 * bytes came from disk or Postgres.
 *
 * Selection: `CONTENT_SOURCE=fs|db` (env). Default `fs` so local dev and
 * existing build paths keep working until the admin UI is ready.
 *
 * See docs/db-backed-content-plan.md § phase 3.
 */

import fs from 'fs'
import path from 'path'
import { createServiceClient } from './supabase'
import { listStorySources, removeSourceFile } from './storySources'

export type StoryStatus = 'draft' | 'published' | 'archived'

/**
 * Serialization format of a story's section config.
 *
 *  • `'yaml'` — the legacy `<slug>.config.yaml` / `config_yaml` column. Every
 *    vizmaya-fyi story uses this.
 *  • `'json'` — the `<slug>.config.json` / `config_json` column. New verticals
 *    (f1, footshorts) are JSON-native: the compose pipeline writes a structured
 *    object rather than hand-built YAML, and the canvas edits the parsed tree.
 *
 * The discriminator is simply *which artifact exists*: a story has at most one.
 * Because JSON is a subset of YAML, every existing `parseYaml`-based reader keeps
 * working when handed JSON text — so only writers and the line-based canvas
 * surgery need to branch on format.
 */
export type ConfigFormat = 'yaml' | 'json'

export interface StoryMeta {
  slug: string
  status: StoryStatus
  listed: boolean
  displayOrder: number | null
  appSlug: string | null
}

export interface ContentSource {
  /** All story slugs plus the minimum metadata needed to filter draft/listed. */
  listStories(): Promise<StoryMeta[]>
  readMarkdown(slug: string): Promise<string | null>
  /** Read the section config TEXT regardless of format — JSON artifact wins
   *  when present, else YAML. Returns whatever string is stored; callers that
   *  only `parseYaml` it need no change (JSON ⊂ YAML). */
  readConfigYaml(slug: string): Promise<string | null>
  /** Read the section config text together with its format, for the writers
   *  and the canvas surgery that must know which serializer to use. */
  readConfig(slug: string): Promise<{ text: string; format: ConfigFormat } | null>
  /** Which serializer a story uses — `'json'` iff a JSON config artifact
   *  exists for the slug, else `'yaml'` (the default for legacy stories). */
  getConfigFormat(slug: string): Promise<ConfigFormat>
  readShareYaml(slug: string): Promise<string | null>
  readReportYaml(slug: string): Promise<string | null>
  readTtsYaml(slug: string): Promise<string | null>
  /** Per-unit dwell times for silent (no-narration) video — see storyTiming. */
  readTimingYaml(slug: string): Promise<string | null>
  readMapYaml(slug: string): Promise<string | null>
  readChart(slug: string, chartId: string): Promise<unknown | null>

  /** Read the markdown + config edit surface together with an opaque `version`
   *  token. The compose section route uses this with `casWriteStory` to merge a
   *  single section's slice without clobbering a concurrently-written section
   *  (both passes read the whole story, edit disjoint slices, and write it back —
   *  a classic lost update without compare-and-set). */
  readStoryForEdit(
    slug: string,
  ): Promise<{
    markdown: string
    /** The config text (JSON for JSON-native stories — see `configFormat`). */
    configYaml: string | null
    configFormat: ConfigFormat
    version: string
  } | null>
  /** Compare-and-set write of markdown and/or config. Applies only if the
   *  story's version still equals `expectedVersion`; returns false on a version
   *  conflict so the caller can re-read fresh and re-apply its slice. Only the
   *  provided fields are written (omit one to leave it untouched). `configYaml`
   *  carries the config text; `configFormat` (default `'yaml'`) selects which
   *  artifact it lands in. */
  casWriteStory(
    slug: string,
    next: { markdown?: string; configYaml?: string | null; configFormat?: ConfigFormat },
    expectedVersion: string,
  ): Promise<boolean>

  /** Write methods for the admin editor. Callers are responsible for auth. */
  writeMarkdown(slug: string, raw: string): Promise<void>
  writeConfigYaml(slug: string, raw: string | null): Promise<void>
  /** Write the section config to the artifact for `format` (JSON or YAML). */
  writeConfig(slug: string, raw: string | null, format: ConfigFormat): Promise<void>
  writeShareYaml(slug: string, raw: string | null): Promise<void>
  writeReportYaml(slug: string, raw: string | null): Promise<void>
  writeTtsYaml(slug: string, raw: string | null): Promise<void>
  writeMapYaml(slug: string, raw: string | null): Promise<void>
  writeChart(slug: string, chartId: string, data: unknown): Promise<void>
  deleteChart(slug: string, chartId: string): Promise<void>
  /** Permanently delete a story and its sidecar content (charts, compose
   *  sources). Used by the admin "delete draft" action. Callers handle auth. */
  deleteStory(slug: string): Promise<void>
  updateMetadata(slug: string, meta: Partial<Pick<StoryMeta, 'status' | 'listed' | 'displayOrder' | 'appSlug'>>): Promise<void>
  listChartIds(slug: string): Promise<string[]>
}

// ---------------------------------------------------------------------------
// Filesystem source — mirrors current behavior.

// Defaults to `<cwd>/content/stories` (each consumer app reads its own content).
// `STORY_CONTENT_DIR` overrides it so an app whose cwd isn't the content root
// can point at another app's stories — admin runs from `apps/admin` but reads
// (and the compose feature writes) `apps/vizmaya-fyi/content/stories`, so they
// share this one env var to agree on the directory.
const STORIES_DIR =
  process.env.STORY_CONTENT_DIR || path.join(process.cwd(), 'content/stories')

function fsReadIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
}

/** Opaque CAS token for a story's edit surface — the mtimes of its markdown and
 *  config files. Any write to either bumps it, so a stale token signals that a
 *  concurrent section write landed in between. */
function fsStoryVersion(slug: string): string {
  const mtime = (file: string): number => {
    const p = path.join(STORIES_DIR, file)
    return fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0
  }
  return `${mtime(`${slug}.md`)}:${mtime(`${slug}.config.yaml`)}:${mtime(`${slug}.config.json`)}`
}

/** Read a story's section config from disk: the JSON artifact wins when present
 *  (a story is JSON-native or YAML, never both), else the YAML one. */
function fsReadConfig(slug: string): { text: string; format: ConfigFormat } | null {
  const j = fsReadIfExists(path.join(STORIES_DIR, `${slug}.config.json`))
  if (j != null) return { text: j, format: 'json' }
  const y = fsReadIfExists(path.join(STORIES_DIR, `${slug}.config.yaml`))
  if (y != null) return { text: y, format: 'yaml' }
  return null
}

// Mirror of the `apps` rows seeded by migrations/039_content_apps.sql. Used in
// fs mode where stories don't carry an `app_slug` column — instead the
// frontmatter declares a `vertical` and we map it to the owning app.
const VERTICAL_TO_APP_SLUG: Record<string, string> = {
  footshorts: 'footshorts',
  f1: 'vizf1',
  kidzovo: 'kidzovo',
}

/**
 * Inverse of `VERTICAL_TO_APP_SLUG`: the `vertical` frontmatter key a story
 * owned by `appSlug` must declare so its viz bundle (`fs:` / `f1:` module
 * types) registers in the canvas and reader. vizmaya-fyi stories use only the
 * core registry and declare no vertical — callers get `null` and should omit
 * the frontmatter key entirely.
 */
export function verticalForApp(appSlug: string | null | undefined): string | null {
  if (!appSlug) return null
  for (const [vertical, app] of Object.entries(VERTICAL_TO_APP_SLUG)) {
    if (app === appSlug) return vertical
  }
  return null
}

function deriveAppSlugFromFrontmatter(data: Record<string, unknown>): string {
  const explicit = data.appSlug ?? data.app_slug
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  const vertical = data.vertical
  if (typeof vertical === 'string' && VERTICAL_TO_APP_SLUG[vertical]) {
    return VERTICAL_TO_APP_SLUG[vertical]
  }
  return 'vizmaya-fyi'
}

const fsSource: ContentSource = {
  async listStories(): Promise<StoryMeta[]> {
    if (!fs.existsSync(STORIES_DIR)) return []
    // Parse each markdown's frontmatter to surface status/listed/order. Fast for 8
    // stories; if the story count grows we can cache at process boot.
    const { default: matter } = await import('gray-matter')
    const slugs = fs
      .readdirSync(STORIES_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
    return slugs.map((slug) => {
      const file = fs.readFileSync(path.join(STORIES_DIR, `${slug}.md`), 'utf8')
      const { data } = matter(file)
      const status = (data.status ?? 'published') as StoryStatus
      const listed = data.listed !== false
      const displayOrder = typeof data.displayOrder === 'number' ? data.displayOrder : null
      const appSlug = deriveAppSlugFromFrontmatter(data)
      return { slug, status, listed, displayOrder, appSlug }
    })
  },
  async readMarkdown(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.md`))
  },
  async readConfigYaml(slug) {
    return fsReadConfig(slug)?.text ?? null
  },
  async readConfig(slug) {
    return fsReadConfig(slug)
  },
  async getConfigFormat(slug) {
    return fs.existsSync(path.join(STORIES_DIR, `${slug}.config.json`)) ? 'json' : 'yaml'
  },
  async readShareYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.share.yaml`))
  },
  async readReportYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.report.yaml`))
  },
  async readTtsYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.tts.yaml`))
  },
  async readTimingYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.timing.yaml`))
  },
  async readMapYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.map.yaml`))
  },
  async readChart(slug, chartId) {
    const filePath = path.join(STORIES_DIR, slug, 'charts', `${chartId}.json`)
    if (!fs.existsSync(filePath)) return null
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return null
    }
  },
  async readStoryForEdit(slug) {
    const markdown = fsReadIfExists(path.join(STORIES_DIR, `${slug}.md`))
    if (markdown == null) return null
    const cfg = fsReadConfig(slug)
    return {
      markdown,
      configYaml: cfg?.text ?? null,
      configFormat: cfg?.format ?? 'yaml',
      version: fsStoryVersion(slug),
    }
  },
  async casWriteStory(slug, next, expectedVersion) {
    // Single-process Node: with no `await` between the version check and the
    // synchronous writes, no other request can interleave — the read-compare-
    // write below is atomic. (Version = the config files' mtimes, see fsStoryVersion.)
    if (fsStoryVersion(slug) !== expectedVersion) return false
    fs.mkdirSync(STORIES_DIR, { recursive: true })
    if (next.markdown !== undefined) {
      fs.writeFileSync(path.join(STORIES_DIR, `${slug}.md`), next.markdown, 'utf8')
    }
    if (next.configYaml !== undefined) {
      const ext = (next.configFormat ?? 'yaml') === 'json' ? 'config.json' : 'config.yaml'
      const p = path.join(STORIES_DIR, `${slug}.${ext}`)
      if (next.configYaml == null) {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } else {
        fs.writeFileSync(p, next.configYaml, 'utf8')
      }
    }
    return true
  },
  async writeMarkdown(slug, raw) {
    fs.mkdirSync(STORIES_DIR, { recursive: true })
    fs.writeFileSync(path.join(STORIES_DIR, `${slug}.md`), raw, 'utf8')
  },
  async writeConfigYaml(slug, raw) {
    return fsSource.writeConfig(slug, raw, 'yaml')
  },
  async writeConfig(slug, raw, format) {
    const ext = format === 'json' ? 'config.json' : 'config.yaml'
    const p = path.join(STORIES_DIR, `${slug}.${ext}`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.mkdirSync(STORIES_DIR, { recursive: true })
    fs.writeFileSync(p, raw, 'utf8')
  },
  async writeShareYaml(slug, raw) {
    const p = path.join(STORIES_DIR, `${slug}.share.yaml`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.writeFileSync(p, raw, 'utf8')
  },
  async writeReportYaml(slug, raw) {
    const p = path.join(STORIES_DIR, `${slug}.report.yaml`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.writeFileSync(p, raw, 'utf8')
  },
  async writeTtsYaml(slug, raw) {
    const p = path.join(STORIES_DIR, `${slug}.tts.yaml`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.writeFileSync(p, raw, 'utf8')
  },
  async writeMapYaml(slug, raw) {
    const p = path.join(STORIES_DIR, `${slug}.map.yaml`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
    fs.writeFileSync(p, raw, 'utf8')
  },
  async writeChart(slug, chartId, data) {
    const dir = path.join(STORIES_DIR, slug, 'charts')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${chartId}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8')
  },
  async deleteChart(slug, chartId) {
    const p = path.join(STORIES_DIR, slug, 'charts', `${chartId}.json`)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  },
  async deleteStory(slug) {
    // Remove every per-story file + the charts directory. Best-effort per
    // path — a missing sidecar (e.g. no .map.yaml) isn't an error.
    for (const suffix of ['.md', '.config.yaml', '.config.json', '.share.yaml', '.report.yaml', '.tts.yaml', '.timing.yaml', '.map.yaml']) {
      const p = path.join(STORIES_DIR, `${slug}${suffix}`)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
    const dir = path.join(STORIES_DIR, slug)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  },
  async listChartIds(slug) {
    const dir = path.join(STORIES_DIR, slug, 'charts')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  },
  async updateMetadata(slug, meta) {
    // fs mode is vizmaya-fyi-only: silently ignore appSlug writes here so the
    // shared admin code path doesn't need to branch.
    if (meta.status === undefined && meta.listed === undefined && meta.displayOrder === undefined) return
    const { default: matter } = await import('gray-matter')
    const { stringify } = await import('yaml')
    const mdPath = path.join(STORIES_DIR, `${slug}.md`)
    const raw = fs.readFileSync(mdPath, 'utf8')
    const { data, content } = matter(raw)
    if (meta.status !== undefined) data.status = meta.status
    if (meta.listed !== undefined) data.listed = meta.listed
    if (meta.displayOrder !== undefined) data.displayOrder = meta.displayOrder
    const yaml = stringify(data)
    const updated = `---\n${yaml}---\n${content}`
    fs.writeFileSync(mdPath, updated, 'utf8')
  },
}

// ---------------------------------------------------------------------------
// Supabase source.

const dbSource: ContentSource = {
  async listStories() {
    const sb = createServiceClient()
    // Try the latest column set; fall back if app_slug or display_order columns
    // aren't applied yet (older deploys).
    let { data, error } = await sb
      .from('stories')
      .select('slug, status, listed, display_order, app_slug')

    if (error?.message?.includes('app_slug')) {
      const fallback = await sb
        .from('stories')
        .select('slug, status, listed, display_order')
      data = (fallback.data as any)
      error = fallback.error
    }
    if (error?.message?.includes('display_order')) {
      const fallback = await sb
        .from('stories')
        .select('slug, status, listed')
      data = (fallback.data as any)
      error = fallback.error
    }

    if (error) throw new Error(`listStories: ${error.message}`)
    return (data ?? []).map((row: any) => ({
      slug: row.slug,
      status: row.status,
      listed: row.listed,
      displayOrder: typeof row.display_order === 'number' ? row.display_order : null,
      appSlug: (row.app_slug as string | null) ?? null,
    }))
  },
  async readMarkdown(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('markdown')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(`readMarkdown ${slug}: ${error.message}`)
    return data?.markdown ?? null
  },
  async readConfigYaml(slug) {
    return (await dbSource.readConfig(slug))?.text ?? null
  },
  async readConfig(slug) {
    const sb = createServiceClient()
    let { data, error } = await sb
      .from('stories')
      .select('config_yaml, config_json')
      .eq('slug', slug)
      .maybeSingle()
    // Pre-config_json deployments lack the column; fall back to YAML-only.
    if (error?.message?.includes('config_json')) {
      const fb = await sb
        .from('stories')
        .select('config_yaml')
        .eq('slug', slug)
        .maybeSingle()
      data = fb.data as any
      error = fb.error
    }
    if (error) throw new Error(`readConfig ${slug}: ${error.message}`)
    if (!data) return null
    const j = (data as { config_json?: string | null }).config_json ?? null
    if (j != null) return { text: j, format: 'json' }
    const y = (data as { config_yaml?: string | null }).config_yaml ?? null
    if (y != null) return { text: y, format: 'yaml' }
    return null
  },
  async getConfigFormat(slug) {
    return (await dbSource.readConfig(slug))?.format ?? 'yaml'
  },
  async readShareYaml(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('share_yaml')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(`readShareYaml ${slug}: ${error.message}`)
    return data?.share_yaml ?? null
  },
  async readReportYaml(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('report_yaml')
      .eq('slug', slug)
      .maybeSingle()
    // Pre-010 deployments don't have the report_yaml column; treat as null
    // rather than failing — readers should fall through to "no overrides".
    if (error?.message?.includes('report_yaml')) return null
    if (error) throw new Error(`readReportYaml ${slug}: ${error.message}`)
    return (data as { report_yaml?: string | null } | null)?.report_yaml ?? null
  },
  async readTtsYaml(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('tts_yaml')
      .eq('slug', slug)
      .maybeSingle()
    // Pre-012 deployments don't have the tts_yaml column; treat as null
    // rather than failing — readers should fall through to "no overrides".
    if (error?.message?.includes('tts_yaml')) return null
    if (error) throw new Error(`readTtsYaml ${slug}: ${error.message}`)
    return (data as { tts_yaml?: string | null } | null)?.tts_yaml ?? null
  },
  async readTimingYaml(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('timing_yaml')
      .eq('slug', slug)
      .maybeSingle()
    // Pre-060 deployments don't have the timing_yaml column; treat as null
    // rather than failing — the silent path falls through to default dwell.
    if (error?.message?.includes('timing_yaml')) return null
    if (error) throw new Error(`readTimingYaml ${slug}: ${error.message}`)
    return (data as { timing_yaml?: string | null } | null)?.timing_yaml ?? null
  },
  async readMapYaml(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('map_yaml')
      .eq('slug', slug)
      .maybeSingle()
    // Pre-023 deployments don't have the map_yaml column; treat as null
    // rather than failing — autoplay falls through to the unmodified
    // config.yaml when no override is present.
    if (error?.message?.includes('map_yaml')) return null
    if (error) throw new Error(`readMapYaml ${slug}: ${error.message}`)
    return (data as { map_yaml?: string | null } | null)?.map_yaml ?? null
  },
  async readChart(slug, chartId) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('chart_data')
      .select('data')
      .eq('slug', slug)
      .eq('chart_id', chartId)
      .maybeSingle()
    if (error) throw new Error(`readChart ${slug}/${chartId}: ${error.message}`)
    return data?.data ?? null
  },
  async readStoryForEdit(slug) {
    const sb = createServiceClient()
    let { data, error } = await sb
      .from('stories')
      .select('markdown, config_yaml, config_json, updated_at')
      .eq('slug', slug)
      .maybeSingle()
    if (error?.message?.includes('config_json')) {
      const fb = await sb
        .from('stories')
        .select('markdown, config_yaml, updated_at')
        .eq('slug', slug)
        .maybeSingle()
      data = fb.data as any
      error = fb.error
    }
    if (error) throw new Error(`readStoryForEdit ${slug}: ${error.message}`)
    if (!data || data.markdown == null) return null
    const j = (data as { config_json?: string | null }).config_json ?? null
    const y = (data as { config_yaml?: string | null }).config_yaml ?? null
    return {
      markdown: data.markdown as string,
      configYaml: j ?? y ?? null,
      configFormat: j != null ? 'json' : 'yaml',
      // updated_at is the CAS token; casWriteStory filters on its exact value.
      version: String(data.updated_at),
    }
  },
  async casWriteStory(slug, next, expectedVersion) {
    const sb = createServiceClient()
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (next.markdown !== undefined) {
      // Keep the denormalized title/status/listed/aura columns in sync, same as
      // writeMarkdown — the section route only edits body prose, but a slug whose
      // frontmatter changed must not silently drift.
      const { default: matter } = await import('gray-matter')
      const { data } = matter(next.markdown)
      const status = ((data.status as string | undefined) ?? 'published') as StoryStatus
      update.markdown = next.markdown
      update.title = (data.title as string | undefined) ?? slug
      update.status = status
      update.listed = data.listed !== false
      update.aura = (data.aura as string | undefined)?.trim() || null
      update.published_at = status === 'published' ? new Date().toISOString() : null
    }
    if (next.configYaml !== undefined) {
      const col = (next.configFormat ?? 'yaml') === 'json' ? 'config_json' : 'config_yaml'
      update[col] = next.configYaml
    }
    const { data, error } = await sb
      .from('stories')
      .update(update)
      .eq('slug', slug)
      .eq('updated_at', expectedVersion)
      .select('slug')
    if (error) throw new Error(`casWriteStory ${slug}: ${error.message}`)
    // No row matched → the version moved on (a concurrent write landed first).
    return (data?.length ?? 0) > 0
  },
  async writeMarkdown(slug, raw) {
    // Parse frontmatter so the denormalized title/status/listed/aura columns
    // stay in sync with the body — the admin editor may edit frontmatter inline.
    const { default: matter } = await import('gray-matter')
    const { data } = matter(raw)
    const title = (data.title as string | undefined) ?? slug
    const status = ((data.status as string | undefined) ?? 'published') as StoryStatus
    const listed = data.listed !== false
    const aura = (data.aura as string | undefined)?.trim() || null
    const sb = createServiceClient()
    const { error } = await sb.from('stories').upsert(
      {
        slug,
        title,
        status,
        listed,
        aura,
        markdown: raw,
        updated_at: new Date().toISOString(),
        published_at: status === 'published' ? new Date().toISOString() : null,
      },
      { onConflict: 'slug' }
    )
    if (error) throw new Error(`writeMarkdown ${slug}: ${error.message}`)
  },
  async writeConfigYaml(slug, raw) {
    return dbSource.writeConfig(slug, raw, 'yaml')
  },
  async writeConfig(slug, raw, format) {
    const sb = createServiceClient()
    const col = format === 'json' ? 'config_json' : 'config_yaml'
    const { error } = await sb
      .from('stories')
      .update({ [col]: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeConfig ${slug} (${format}): ${error.message}`)
  },
  async writeShareYaml(slug, raw) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('stories')
      .update({ share_yaml: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeShareYaml ${slug}: ${error.message}`)
  },
  async writeReportYaml(slug, raw) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('stories')
      .update({ report_yaml: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeReportYaml ${slug}: ${error.message}`)
  },
  async writeTtsYaml(slug, raw) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('stories')
      .update({ tts_yaml: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeTtsYaml ${slug}: ${error.message}`)
  },
  async writeMapYaml(slug, raw) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('stories')
      .update({ map_yaml: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeMapYaml ${slug}: ${error.message}`)
  },
  async writeChart(slug, chartId, data) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('chart_data')
      .upsert({ slug, chart_id: chartId, data, updated_at: new Date().toISOString() }, {
        onConflict: 'slug,chart_id',
      })
    if (error) throw new Error(`writeChart ${slug}/${chartId}: ${error.message}`)
  },
  async deleteChart(slug, chartId) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('chart_data')
      .delete()
      .eq('slug', slug)
      .eq('chart_id', chartId)
    if (error) throw new Error(`deleteChart ${slug}/${chartId}: ${error.message}`)
  },
  async deleteStory(slug) {
    const sb = createServiceClient()
    // Best-effort: clear the retained source originals from the bucket (the
    // story_sources rows themselves cascade-delete with the stories row).
    try {
      const rows = await listStorySources(slug)
      for (const r of rows) {
        if (r.storagePath) await removeSourceFile(r.storagePath).catch(() => {})
      }
    } catch {
      // bucket/table unreachable — proceed with the row delete anyway
    }
    // chart_data has no cascade onto stories, so drop it explicitly first.
    await sb.from('chart_data').delete().eq('slug', slug)
    const { error } = await sb.from('stories').delete().eq('slug', slug)
    if (error) throw new Error(`deleteStory ${slug}: ${error.message}`)
  },
  async listChartIds(slug) {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('chart_data')
      .select('chart_id')
      .eq('slug', slug)
    if (error) throw new Error(`listChartIds ${slug}: ${error.message}`)
    return (data ?? []).map((r) => r.chart_id as string)
  },
  async updateMetadata(slug, meta) {
    const sb = createServiceClient()
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (meta.status !== undefined) updates.status = meta.status
    if (meta.listed !== undefined) updates.listed = meta.listed
    if (meta.displayOrder !== undefined) updates.display_order = meta.displayOrder
    if (meta.appSlug !== undefined) updates.app_slug = meta.appSlug
    const { error } = await sb
      .from('stories')
      .update(updates)
      .eq('slug', slug)
    if (error) throw new Error(`updateMetadata ${slug}: ${error.message}`)
  },
}

// ---------------------------------------------------------------------------
// Selector.

let resolved: ContentSource | null = null

export function getContentSource(): ContentSource {
  if (resolved) return resolved
  const mode = (process.env.CONTENT_SOURCE ?? 'fs').toLowerCase()
  resolved = mode === 'db' ? dbSource : fsSource
  return resolved
}

// Test / script hook: force a source, bypassing the env var.
export function __setContentSourceForTests(src: ContentSource | null) {
  resolved = src
}
