import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type {
  StoryArtifacts,
  SourceDoc,
  ResearchBrief,
  StoryOutline,
  GeneratedSection,
  ComposeAnswers,
  StoryFormat,
} from '@vismay/story-pipeline'
import { appStoryUrl } from '@/lib/publicSite'
import { getContentSource } from '@vismay/content-source/contentSource'

// Shared helpers for the compose routes (not a route itself — only route.ts /
// page.tsx are routes in the app dir).

/** Where the fs session store lives. Stories themselves now persist through the
 *  content source (fs or db). Defaults to the vizmaya-fyi content dir (dev). */
export function storyContentDir(): string {
  return (
    process.env.STORY_CONTENT_DIR ||
    path.resolve(process.cwd(), '../vizmaya-fyi/content/stories')
  )
}

/**
 * Persist a generated story through the active content source (fs or db, per
 * CONTENT_SOURCE). `writeMarkdown` runs FIRST — in db mode it upserts the
 * `stories` row, and the config/chart writes are updates that silently no-op if
 * the row is absent. In fs mode this writes the same `<slug>.md` /
 * `<slug>.config.yaml` / `<slug>/charts/<id>.json` layout the renderer reads.
 *
 * (The old `.imageprompts.json` sidecar is dropped — imagePrompts ride the route
 * response today and move into `compose_state` once the canvas flow lands.)
 */
export async function persistStory(slug: string, art: StoryArtifacts): Promise<void> {
  const src = getContentSource()
  await src.writeMarkdown(slug, art.markdown)
  await src.writeConfigYaml(slug, art.configYaml)
  for (const c of art.charts) {
    // c.json is a serialized ECharts option; store as parsed JSON so db mode
    // gets jsonb and fs mode re-serialises to the same file.
    // eslint-disable-next-line no-await-in-loop
    await src.writeChart(slug, c.id, JSON.parse(c.json))
  }
}

/** Pick a non-colliding slug, checking the active content source (fs or db). */
export async function uniqueStorySlug(base: string): Promise<string> {
  const src = getContentSource()
  let slug = base
  let n = 2
  // eslint-disable-next-line no-await-in-loop
  while ((await src.readMarkdown(slug)) != null) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

export function previewUrlFor(slug: string): string {
  // Admin runs on its own host, so the link must be absolute or it 404s
  // against the admin origin. `appStoryUrl` resolves to the vizmaya.fyi base
  // (env-overridable via NEXT_PUBLIC_VIZMAYA_URL for local dev). Stories always
  // live on vizmaya-fyi, so the helper never returns null here.
  return appStoryUrl('vizmaya-fyi', slug) ?? `https://vizmaya.fyi/story/${slug}`
}

// ── Compose session store ──────────────────────────────────────────────────
//
// Each step (research brief, outline, every section) is persisted as it lands,
// so a generation that fails partway can be resumed without re-paying for the
// expensive calls already completed. Filesystem-backed for this first cut (a
// `.compose/<id>.json` next to the stories); a DB table is the upgrade path.

export interface ComposeSession {
  id: string
  createdAt: string
  updatedAt: string
  model: string
  format?: StoryFormat
  answers: ComposeAnswers
  sources: SourceDoc[]
  brief: ResearchBrief
  outline?: StoryOutline
  /** Indexed to `outline.sections`; null = not generated yet (resume target). */
  sections: (GeneratedSection | null)[]
  slug?: string
  status: 'researched' | 'generating' | 'done' | 'error'
}

const SAFE_SESSION_ID = /^[a-f0-9]{8,}$/

function sessionsDir(): string {
  return path.join(storyContentDir(), '.compose')
}

export function newSessionId(): string {
  return randomBytes(12).toString('hex')
}

export function sessionPath(id: string): string {
  if (!SAFE_SESSION_ID.test(id)) throw new Error('bad session id')
  return path.join(sessionsDir(), `${id}.json`)
}

export async function saveSession(session: ComposeSession): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true })
  session.updatedAt = new Date().toISOString()
  await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf8')
}

export async function loadSession(id: string): Promise<ComposeSession | null> {
  try {
    return JSON.parse(await fs.readFile(sessionPath(id), 'utf8')) as ComposeSession
  } catch {
    return null
  }
}

export async function deleteSession(id: string): Promise<void> {
  await fs.rm(sessionPath(id), { force: true })
}

/** A lightweight summary for the resume picker (no heavy sources/section bodies). */
export interface ComposeSessionSummary {
  id: string
  title: string
  status: ComposeSession['status']
  updatedAt: string
  done: number
  total: number
  format?: StoryFormat
  slug?: string
}

/** List saved sessions, newest first — powers reload-resume. */
export async function listSessions(): Promise<ComposeSessionSummary[]> {
  let files: string[]
  try {
    files = await fs.readdir(sessionsDir())
  } catch {
    return [] // dir doesn't exist yet → no sessions
  }
  const out: ComposeSessionSummary[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      // eslint-disable-next-line no-await-in-loop
      const raw = await fs.readFile(path.join(sessionsDir(), f), 'utf8')
      const s = JSON.parse(raw) as ComposeSession
      out.push({
        id: s.id,
        title: s.outline?.title ?? s.brief?.summary?.slice(0, 80) ?? '(untitled)',
        status: s.status,
        updatedAt: s.updatedAt ?? s.createdAt,
        done: (s.sections ?? []).filter(Boolean).length,
        total: s.outline?.sections.length ?? 0,
        format: s.format,
        slug: s.slug,
      })
    } catch {
      // skip unreadable/corrupt session file
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
