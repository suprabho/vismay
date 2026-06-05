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
import { storyContentDir, writeStoryFiles, previewUrlFor } from '../shared'

/**
 * Manual refine — regenerate ONE section against editor feedback, then rewrite
 * the story files in place (same slug). The client holds the outline + the
 * current sections and sends them back with the index to change.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface Body {
  slug: string
  outline: StoryOutline
  sections: GeneratedSection[]
  index: number
  feedback?: string
  sources: SourceDoc[]
  brief: ResearchBrief
  answers: ComposeAnswers
  model?: string
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

  const { slug, outline, sections, index } = body
  if (!slug || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }
  if (!outline || !Array.isArray(sections) || typeof index !== 'number') {
    return NextResponse.json({ error: 'missing outline / sections / index' }, { status: 400 })
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
        sources: body.sources,
        brief: body.brief,
        answers: body.answers ?? {},
        refine: { feedback: body.feedback?.trim() || 'Regenerate this section with a fresh take.', previous: sections[index]! },
      },
      { model },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `regeneration failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Splice the new section in and rewrite the story files under the SAME slug.
  const nextSections = sections.slice()
  nextSections[index] = newSection
  const story = assembleStory(outline, nextSections)
  const issues = validateStory(story)
  const art = serializeStory(story)
  try {
    await writeStoryFiles(storyContentDir(), slug, art)
  } catch (e) {
    return NextResponse.json(
      { error: `failed to write story files: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    index,
    section: newSection,
    issues,
    previewUrl: previewUrlFor(slug),
  })
}
