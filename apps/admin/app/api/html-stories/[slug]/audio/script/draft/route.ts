import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateText, hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { createServiceClient } from '@vismay/content-source/supabase'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { getHtmlStoryForAdmin } from '@vismay/html-stories/htmlStories'
import { MAX_SCRIPT_CHARS, extractNarrationSections, narrationSectionContext } from '@vismay/html-stories/narration'
import { isAuthed } from '@/lib/adminAuth'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Draft a narration script with AI (the Section audio panel's Draft with AI).
 * POST `{ app, indices?, guidance?, current? }`: writes spoken narration for
 * the sections at `indices` (default: all) from what each section shows
 * (narrationSectionContext: text, captions, alt text, tables), keeping to the
 * page's facts. `current` is the editor's other lines ({ index, text }), so
 * the draft runs on from them; `guidance` is the editor's direction (tone,
 * length, audience). Returns `{ lines: [{ index, text }] }`. Nothing is
 * saved: the lines land in the editor for review, and Save script stores
 * them. Each call is audited in ai_generations.
 */

export const maxDuration = 120

type Ctx = { params: Promise<{ slug: string }> }

const MAX_GUIDANCE = 1000
/** Context sent per section, and in all: long stories get less per section. */
const MAX_CONTEXT_TOTAL = 60_000

const Draft = z.object({
  lines: z
    .array(
      z.object({
        index: z.number().int().describe('The section number from the list, as given'),
        text: z.string().describe('The narration for that section: plain spoken prose, or "" to leave it silent'),
      }),
    )
    .describe('One entry per section you were asked to write, in order'),
})

const SYSTEM = `You write the narration script for an illustrated, data-driven web story that a
text-to-speech voice reads aloud, one clip per section, while the reader looks at that
section. You are given every section of the page with what it shows, and the sections
to write.

Write for the ear, not the eye:
- Plain spoken prose. No markdown, headings, bullet points, emoji, stage directions,
  SSML or speaker labels. Paragraph breaks (a blank line) become pauses.
- Short, clear sentences in a warm, assured documentary voice. Vary their rhythm.
- Say numbers the way a person would ("about two and a half million", "nearly a
  third", "in 2019"); round where the page's precision doesn't matter to the point.
  Spell out symbols and abbreviations the voice could stumble on on first use.
- Don't read lists, tables or axis labels out; say what they show. The reader can see
  the section, so you may point at it lightly ("on this map", "the line climbs"),
  but the narration must make sense heard alone.
- Run on from section to section: the first section opens the story, later ones carry
  the thread forward without re-introducing it, and the last one lands it.
- Roughly 30 to 120 words a section, shorter for a cover or a single image, never
  longer than the section deserves.

Accuracy matters more than flair:
- Use only facts, names, figures and dates that are on the page. Never add facts,
  context, quotes or numbers from your own knowledge, and never change one.
- Keep the page's hedges and attributions ("estimated", "according to").
- A section with nothing to say (decoration, credits, a blank frame) gets "".

Return one line per requested section, with its number as given.`

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s
}

export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const app = parseHtmlStoryApp(b.app ?? new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  if (app === 'travel') return NextResponse.json({ error: 'travel stories get no audio' }, { status: 400 })
  const { slug } = await params
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const sections = extractNarrationSections(story.html)
  if (!sections.length) return NextResponse.json({ error: 'this page has no sections to narrate' }, { status: 400 })
  const perSection = Math.max(300, Math.min(2000, Math.floor(MAX_CONTEXT_TOTAL / sections.length)))
  const context = narrationSectionContext(story.html, perSection)

  const wanted = Array.isArray(b.indices)
    ? [...new Set(b.indices.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < sections.length))]
    : sections.map((s) => s.index)
  if (!wanted.length) return NextResponse.json({ error: 'no sections to draft' }, { status: 400 })
  wanted.sort((x, y) => x - y)

  const current = new Map<number, string>()
  if (Array.isArray(b.current)) {
    for (const raw of b.current) {
      const r = raw as Record<string, unknown> | null
      const i = Number(r?.index)
      const text = typeof r?.text === 'string' ? r.text.trim() : ''
      if (Number.isInteger(i) && text && !wanted.includes(i)) current.set(i, clip(text, 1500))
    }
  }
  const guidance = typeof b.guidance === 'string' ? b.guidance.trim().slice(0, MAX_GUIDANCE) : ''

  const pageList = sections
    .map((s) => {
      const lines = [`### Section ${s.index + 1}: ${s.label}`, `Shows: ${context[s.index] || '(nothing but visuals)'}`]
      const written = current.get(s.index)
      if (written) lines.push(`Narration already written (keep continuity with it): ${written}`)
      return lines.join('\n')
    })
    .join('\n\n')
  const prompt = [
    `Story: ${story.title}`,
    story.description ? `Summary: ${story.description}` : '',
    '',
    `The page's sections, in order:`,
    '',
    pageList,
    '',
    `Write the narration for section${wanted.length === 1 ? '' : 's'} ${wanted.map((i) => i + 1).join(', ')}.`,
    guidance ? `\nThe editor's direction (follow it within the accuracy rules): ${guidance}` : '',
  ].join('\n')

  let lines: { index: number; text: string }[]
  let modelUsed: string
  try {
    const out = await generateText({
      model: await getFeatureModel('narrationScript'),
      system: SYSTEM,
      prompt,
      schema: Draft,
      temperature: 0.6,
      maxOutputTokens: 16_000,
      metadata: { feature: 'admin-html-story-narration-script', slug },
    })
    modelUsed = out.modelUsed
    // The model numbers sections from 1, as shown; keep only the ones asked for.
    const asked = new Set(wanted)
    const byIndex = new Map<number, string>()
    for (const l of out.result.lines) {
      const index = l.index - 1
      if (asked.has(index) && !byIndex.has(index)) byIndex.set(index, l.text.trim().slice(0, MAX_SCRIPT_CHARS))
    }
    lines = [...byIndex].map(([index, text]) => ({ index, text })).sort((x, y) => x.index - y.index)
  } catch (e) {
    return NextResponse.json({ error: `drafting failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }

  // Audit (non-fatal).
  try {
    await recordGeneration(createServiceClient(), {
      kind: 'text',
      storySlug: slug,
      prompt: `narration-script:${wanted.map((i) => i + 1).join(',')}${guidance ? ` · ${guidance}` : ''}`,
      model: modelUsed,
      params: { feature: 'html-story-narration-script', app, sections: wanted.length },
      requestHash: hashRequest({ model: modelUsed, prompt, params: { sections: wanted } }),
      resultRef: null,
      resultText: JSON.stringify(lines),
    })
  } catch {
    // The draft is still useful without its audit row.
  }

  return NextResponse.json({ lines, model: modelUsed })
}
