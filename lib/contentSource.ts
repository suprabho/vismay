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

export type StoryStatus = 'draft' | 'published' | 'archived'

export interface StoryMeta {
  slug: string
  status: StoryStatus
  listed: boolean
  displayOrder: number | null
}

export interface ContentSource {
  /** All story slugs plus the minimum metadata needed to filter draft/listed. */
  listStories(): Promise<StoryMeta[]>
  readMarkdown(slug: string): Promise<string | null>
  readConfigYaml(slug: string): Promise<string | null>
  readShareYaml(slug: string): Promise<string | null>
  readReportYaml(slug: string): Promise<string | null>
  readChart(slug: string, chartId: string): Promise<unknown | null>

  /** Write methods for the admin editor. Callers are responsible for auth. */
  writeMarkdown(slug: string, raw: string): Promise<void>
  writeConfigYaml(slug: string, raw: string | null): Promise<void>
  writeShareYaml(slug: string, raw: string | null): Promise<void>
  writeReportYaml(slug: string, raw: string | null): Promise<void>
  writeChart(slug: string, chartId: string, data: unknown): Promise<void>
  updateMetadata(slug: string, meta: Partial<Pick<StoryMeta, 'status' | 'listed' | 'displayOrder'>>): Promise<void>
  listChartIds(slug: string): Promise<string[]>
}

// ---------------------------------------------------------------------------
// Filesystem source — mirrors current behavior.

const STORIES_DIR = path.join(process.cwd(), 'content/stories')

function fsReadIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
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
      return { slug, status, listed, displayOrder }
    })
  },
  async readMarkdown(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.md`))
  },
  async readConfigYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.config.yaml`))
  },
  async readShareYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.share.yaml`))
  },
  async readReportYaml(slug) {
    return fsReadIfExists(path.join(STORIES_DIR, `${slug}.report.yaml`))
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
  async writeMarkdown(slug, raw) {
    fs.mkdirSync(STORIES_DIR, { recursive: true })
    fs.writeFileSync(path.join(STORIES_DIR, `${slug}.md`), raw, 'utf8')
  },
  async writeConfigYaml(slug, raw) {
    const p = path.join(STORIES_DIR, `${slug}.config.yaml`)
    if (raw == null) {
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return
    }
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
  async writeChart(slug, chartId, data) {
    const dir = path.join(STORIES_DIR, slug, 'charts')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${chartId}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8')
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
    // Try to select with display_order column; fall back to without if column doesn't exist yet
    let { data, error } = await sb
      .from('stories')
      .select('slug, status, listed, display_order')

    if (error?.message?.includes('display_order')) {
      // display_order column doesn't exist yet (migration not applied), query without it
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
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('stories')
      .select('config_yaml')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(`readConfigYaml ${slug}: ${error.message}`)
    return data?.config_yaml ?? null
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
  async writeMarkdown(slug, raw) {
    // Parse frontmatter so the denormalized title/status/listed columns stay
    // in sync with the body — the admin editor may edit frontmatter inline.
    const { default: matter } = await import('gray-matter')
    const { data } = matter(raw)
    const title = (data.title as string | undefined) ?? slug
    const status = ((data.status as string | undefined) ?? 'published') as StoryStatus
    const listed = data.listed !== false
    const sb = createServiceClient()
    const { error } = await sb.from('stories').upsert(
      {
        slug,
        title,
        status,
        listed,
        markdown: raw,
        updated_at: new Date().toISOString(),
        published_at: status === 'published' ? new Date().toISOString() : null,
      },
      { onConflict: 'slug' }
    )
    if (error) throw new Error(`writeMarkdown ${slug}: ${error.message}`)
  },
  async writeConfigYaml(slug, raw) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('stories')
      .update({ config_yaml: raw, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    if (error) throw new Error(`writeConfigYaml ${slug}: ${error.message}`)
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
  async writeChart(slug, chartId, data) {
    const sb = createServiceClient()
    const { error } = await sb
      .from('chart_data')
      .upsert({ slug, chart_id: chartId, data, updated_at: new Date().toISOString() }, {
        onConflict: 'slug,chart_id',
      })
    if (error) throw new Error(`writeChart ${slug}/${chartId}: ${error.message}`)
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
