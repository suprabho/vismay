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

// Shared helpers for the compose routes (not a route itself — only route.ts /
// page.tsx are routes in the app dir).

/** Where generated stories land. Defaults to the vizmaya-fyi content dir (monorepo dev). */
export function storyContentDir(): string {
  return (
    process.env.STORY_CONTENT_DIR ||
    path.resolve(process.cwd(), '../vizmaya-fyi/content/stories')
  )
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Pick a non-colliding slug so a new story never clobbers an existing one. */
export async function uniqueSlug(dir: string, base: string): Promise<string> {
  let slug = base
  let n = 2
  // eslint-disable-next-line no-await-in-loop
  while (await exists(path.join(dir, `${slug}.md`))) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

/** Write the paired story files (md + config + chart JSONs + imagePrompts sidecar). */
export async function writeStoryFiles(
  dir: string,
  slug: string,
  art: StoryArtifacts,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${slug}.md`), art.markdown, 'utf8')
  await fs.writeFile(path.join(dir, `${slug}.config.yaml`), art.configYaml, 'utf8')
  if (art.charts.length > 0) {
    const chartsDir = path.join(dir, slug, 'charts')
    await fs.mkdir(chartsDir, { recursive: true })
    await Promise.all(
      art.charts.map((c) => fs.writeFile(path.join(chartsDir, `${c.id}.json`), c.json, 'utf8')),
    )
  }
  if (art.imagePrompts.length > 0) {
    await fs.writeFile(
      path.join(dir, `${slug}.imageprompts.json`),
      JSON.stringify(art.imagePrompts, null, 2),
      'utf8',
    )
  }
}

export function previewUrlFor(slug: string): string {
  const base = process.env.VIZMAYA_BASE_URL ?? ''
  return `${base}/story/${slug}`
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
