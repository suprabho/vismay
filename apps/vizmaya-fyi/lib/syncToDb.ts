import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { createServiceClient } from './supabase'
import type { Frontmatter } from '@/types/story'

const STORIES_DIR = path.join(process.cwd(), 'content/stories')

export interface SyncResult {
  slug: string
  ok: boolean
  charts: number
  skipped?: boolean
  error?: string
}

export interface SyncOptions {
  /**
   * When true, skip stories whose slug already exists in the DB. Charts
   * are also written with ignoreDuplicates, so an existing (slug,chart_id)
   * row is physically unable to be overwritten — the safety is enforced at
   * the DB layer, not by a select-then-upsert TOCTOU check.
   */
  skipIfExists?: boolean
}

function readIfExists(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

function listChartFiles(slug: string): string[] {
  const dir = path.join(STORIES_DIR, slug, 'charts')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))
}

export function listFsSlugs(): string[] {
  if (!fs.existsSync(STORIES_DIR)) return []
  return fs
    .readdirSync(STORIES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
}

export async function syncStory(slug: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const mdPath = path.join(STORIES_DIR, `${slug}.md`)
  const markdown = readIfExists(mdPath)
  if (!markdown) throw new Error(`missing ${mdPath}`)

  const sb = createServiceClient()

  const { data } = matter(markdown)
  const fm = data as Frontmatter
  const configYaml = readIfExists(path.join(STORIES_DIR, `${slug}.config.yaml`))
  const shareYaml = readIfExists(path.join(STORIES_DIR, `${slug}.share.yaml`))

  const row = {
    slug,
    title: fm.title ?? slug,
    status: (fm.status ?? 'published') as string,
    listed: fm.listed !== false,
    markdown,
    config_yaml: configYaml,
    share_yaml: shareYaml,
    updated_at: new Date().toISOString(),
    published_at: (fm.status ?? 'published') === 'published' ? new Date().toISOString() : null,
  }

  const charts = listChartFiles(slug).map((filePath) => ({
    slug,
    chart_id: path.basename(filePath, '.json'),
    data: JSON.parse(fs.readFileSync(filePath, 'utf8')),
    updated_at: new Date().toISOString(),
  }))

  if (opts.skipIfExists) {
    // Insert-only path. ignoreDuplicates pushes the no-overwrite guarantee
    // down to Postgres ON CONFLICT DO NOTHING — an existing row cannot be
    // mutated through this code path even if a caller forgets the check.
    const { data: inserted, error: storyErr } = await sb
      .from('stories')
      .upsert(row, { onConflict: 'slug', ignoreDuplicates: true })
      .select('slug')
    if (storyErr) throw new Error(`stories insert: ${storyErr.message}`)
    const wasInserted = (inserted ?? []).length > 0
    if (!wasInserted) return { slug, ok: true, charts: 0, skipped: true }

    if (charts.length > 0) {
      const { error: chartErr } = await sb
        .from('chart_data')
        .upsert(charts, { onConflict: 'slug,chart_id', ignoreDuplicates: true })
      if (chartErr) throw new Error(`chart_data insert: ${chartErr.message}`)
    }
    return { slug, ok: true, charts: charts.length }
  }

  const { error: storyErr } = await sb.from('stories').upsert(row, { onConflict: 'slug' })
  if (storyErr) throw new Error(`stories upsert: ${storyErr.message}`)

  if (charts.length > 0) {
    const { error: chartErr } = await sb
      .from('chart_data')
      .upsert(charts, { onConflict: 'slug,chart_id' })
    if (chartErr) throw new Error(`chart_data upsert: ${chartErr.message}`)
  }

  return { slug, ok: true, charts: charts.length }
}

export async function syncAll(opts: SyncOptions = {}): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  for (const slug of listFsSlugs()) {
    try {
      results.push(await syncStory(slug, opts))
    } catch (err) {
      results.push({ slug, ok: false, charts: 0, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}
