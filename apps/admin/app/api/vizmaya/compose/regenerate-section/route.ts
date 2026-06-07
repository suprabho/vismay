import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  generateSection,
  assembleStory,
  validateStory,
  serializeStory,
  isAllowedTextModel,
  DEFAULT_TEXT_MODEL,
  type StoryOutline,
  type GeneratedSection,
  type SourceDoc,
  type ResearchBrief,
  type ComposeAnswers,
} from '@vismay/story-pipeline'
import {
  persistStory,
  previewUrlFor,
  loadSession,
  saveSession,
} from '../shared'

/**
 * Manual refine — regenerate ONE section against editor feedback, rewrite the
 * story files in place (same slug), and persist the change to the session so it
 * survives a reload.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface Body {
  sessionId?: string
  index: number
  feedback?: string
  model?: string
  // Fallback when there's no session on disk.
  slug?: string
  outline?: StoryOutline
  sections?: GeneratedSection[]
  sources?: SourceDoc[]
  brief?: ResearchBrief
  answers?: ComposeAnswers
}

export async function POST(req: Request): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const { index } = body
  if (typeof index !== 'number') {
    return NextResponse.json({ error: 'missing index' }, { status: 400 })
  }

  // Prefer the saved session (source of truth); fall back to the inline payload.
  const session = body.sessionId ? await loadSession(body.sessionId) : null
  const outline = session?.outline ?? body.outline
  const sections = (session?.sections?.filter(Boolean) as GeneratedSection[]) ?? body.sections
  const sources = session?.sources ?? body.sources ?? []
  const brief = session?.brief ?? body.brief
  const answers = session?.answers ?? body.answers ?? {}
  const slug = session?.slug ?? body.slug

  if (!outline || !Array.isArray(sections) || !brief) {
    return NextResponse.json({ error: 'missing outline / sections / brief' }, { status: 400 })
  }
  if (!slug || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad or missing slug' }, { status: 400 })
  }
  const stub = outline.sections?.[index]
  if (!stub || !sections[index]) {
    return NextResponse.json({ error: `no section at index ${index}` }, { status: 400 })
  }

  const model = isAllowedTextModel(body.model ?? '') ? body.model! : DEFAULT_TEXT_MODEL

  let newSection: GeneratedSection
  try {
    newSection = await generateSection(
      {
        outline,
        stub,
        sources,
        brief,
        answers,
        refine: {
          feedback: body.feedback?.trim() || 'Regenerate this section with a fresh take.',
          previous: sections[index]!,
        },
      },
      { model },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `regeneration failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Splice in, rewrite the story under the same slug, and persist to the session.
  const nextSections = sections.slice()
  nextSections[index] = newSection
  const story = assembleStory(outline, nextSections)
  const issues = validateStory(story)
  const art = serializeStory(story)
  try {
    await persistStory(slug, art)
  } catch (e) {
    return NextResponse.json(
      { error: `failed to write story: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  if (session) {
    session.sections[index] = newSection
    await saveSession(session).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    index,
    section: newSection,
    issues,
    previewUrl: previewUrlFor(slug),
  })
}
