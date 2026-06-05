import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  generateStory,
  serializeStory,
  isAllowedTextModel,
  DEFAULT_TEXT_MODEL,
  type SourceDoc,
  type ResearchBrief,
  type ComposeAnswers,
  type StoryFormat,
} from '@vismay/story-pipeline'

function log(msg: string): void {
  console.log(`[compose/generate] ${msg}`)
}

/**
 * Phase 2 of the story composer: generate the full story from sources + brief +
 * the editor's answers, validate it against viz-engine's schemas, and write the
 * paired files (`<slug>.md`, `<slug>.config.yaml`, `<slug>/charts/*.json`) into
 * the vizmaya content dir so it renders immediately.
 *
 * Filesystem output only for this first cut (local dev defaults to
 * CONTENT_SOURCE=fs); DB-backed writes are a follow-up.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface GenerateBody {
  sources: SourceDoc[]
  brief: ResearchBrief
  answers: ComposeAnswers
  format?: StoryFormat
  model?: string
}

/** Where generated stories land. Defaults to the vizmaya-fyi content dir (monorepo dev). */
function storyContentDir(): string {
  return (
    process.env.STORY_CONTENT_DIR ||
    path.resolve(process.cwd(), '../vizmaya-fyi/content/stories')
  )
}

/** Pick a non-colliding slug so we never clobber an existing story. */
async function uniqueSlug(dir: string, base: string): Promise<string> {
  let slug = base
  let n = 2
  // eslint-disable-next-line no-await-in-loop
  while (await exists(path.join(dir, `${slug}.md`))) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0 || !body.brief) {
    return NextResponse.json({ error: 'missing sources or brief' }, { status: 400 })
  }

  const model = isAllowedTextModel(body.model ?? '') ? body.model! : DEFAULT_TEXT_MODEL

  let story
  let issues
  try {
    log(`generating ${body.format ?? body.brief.suggestedFormat} story from ${body.sources.length} source(s) with ${model}…`)
    const t0 = Date.now()
    const out = await generateStory(
      { sources: body.sources, brief: body.brief, answers: body.answers ?? {} },
      { format: body.format, model },
    )
    story = out.story
    issues = out.issues
    log(
      `done in ${Date.now() - t0}ms — ${story.sections.length} sections, ${story.charts.length} charts` +
        (issues.length ? `, ${issues.length} residual issue(s)` : ''),
    )
  } catch (e) {
    log(`generation failed: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json(
      { error: `generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const art = serializeStory(story)

  // Write the paired files (+ chart JSONs + an imagePrompts sidecar).
  const dir = storyContentDir()
  const slug = await uniqueSlug(dir, art.slug)
  try {
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
  } catch (e) {
    log(`failed to write story files: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json(
      { error: `failed to write story files: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }
  log(`wrote ${slug} (${art.charts.length} chart file(s)) to ${dir}`)

  // Best-effort audit.
  try {
    const supabase = createServiceClient()
    const params = { feature: 'compose-generate', format: story.format, sections: story.sections.length, model }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: body.brief.summary,
      model,
      params,
      requestHash: hashRequest({ model, prompt: slug, params }),
      resultRef: null,
      resultText: art.markdown.slice(0, 4000),
    })
  } catch {
    // swallow
  }

  const base = process.env.VIZMAYA_BASE_URL ?? ''
  return NextResponse.json({
    ok: true,
    slug,
    format: story.format,
    previewUrl: `${base}/story/${slug}`,
    sections: story.sections.length,
    charts: story.charts.length,
    imagePrompts: art.imagePrompts,
    issues,
  })
}
