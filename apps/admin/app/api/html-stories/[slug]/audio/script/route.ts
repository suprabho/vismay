import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { getHtmlStoryScript, saveHtmlStoryScript } from '@vismay/html-stories/audio'
import { getHtmlStoryForAdmin } from '@vismay/html-stories/htmlStories'
import { extractNarrationSections, type NarrationScriptEntry } from '@vismay/html-stories/narration'
import { isAuthed } from '@/lib/adminAuth'

/**
 * A story's narration script (`?app=`): what the section audio reads instead
 * of each section's on-screen text (packages/html-stories/src/narration.ts).
 * GET lists the page's sections, each with the text it reads without a
 * script and its script line; PUT `{ app, sections: [{ index, label, text }] }`
 * replaces the script (an empty line, or no entry, reads the page). Saving
 * doesn't voice anything: the Section audio panel's Generate audio does.
 * Travel stories get no audio, so no script either.
 */

type Ctx = { params: Promise<{ slug: string }> }

interface ScriptSectionView {
  index: number
  label: string
  /** What the voice reads with no script line (empty: silent). */
  pageText: string
  /** The script line, or '' to read the page. */
  script: string
  /** The section's label when the line was written, when that differs from now. */
  writtenFor: string | null
}

function view(html: string, script: NarrationScriptEntry[]) {
  const lines = new Map(script.map((l) => [l.index, l]))
  const sections = extractNarrationSections(html).map((s): ScriptSectionView => {
    const line = lines.get(s.index)
    return {
      index: s.index,
      label: s.label,
      pageText: s.pageText,
      script: line?.text ?? '',
      writtenFor: line && line.label && line.label !== s.label ? line.label : null,
    }
  })
  // Lines for sections the page no longer has (it lost sections since).
  const orphans = script.filter((l) => l.index >= sections.length)
  return { sections, orphans }
}

async function load(req: Request, slug: string, appParam: unknown) {
  const app = parseHtmlStoryApp(appParam ?? new URL(req.url).searchParams.get('app'))
  if (!app) return { error: NextResponse.json({ error: 'unknown app' }, { status: 400 }) }
  if (app === 'travel') return { error: NextResponse.json({ error: 'travel stories get no audio' }, { status: 400 }) }
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  return { story }
}

export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const { story, error } = await load(req, slug, null)
  if (error) return error
  try {
    return NextResponse.json(view(story.html, await getHtmlStoryScript(slug)))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'read failed' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { slug } = await params
  const { story, error } = await load(req, slug, b.app)
  if (error) return error
  if (!Array.isArray(b.sections)) return NextResponse.json({ error: 'sections must be an array' }, { status: 400 })
  try {
    return NextResponse.json(view(story.html, await saveHtmlStoryScript(slug, b.sections)))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'save failed' }, { status: 500 })
  }
}
