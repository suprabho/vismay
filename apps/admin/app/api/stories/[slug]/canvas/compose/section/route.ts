import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  generateSectionContent,
  generateSectionVisual,
  generateSubsectionContent,
  generateSubsectionVisual,
  generateRegions,
  injectRegions,
  type SectionContext,
  type SectionStub,
  type SubsectionStub,
  type StoryOutline,
  type ResearchBrief,
  completeCoverBody,
  coverImageLayer,
  isDeckCover,
  type StoryFormat,
  type ComposeAnswers,
} from '@vismay/story-pipeline'
import { getContentSource } from '@vismay/content-source/contentSource'
import { listStorySources } from '@vismay/content-source/storySources'
import { readComposeState } from '@vismay/content-source/composeState'
import {
  resolveModel,
  sourcesToDocs,
  replaceMarkdownProse,
  readMarkdownProse,
  replaceConfigBody,
  sectionAnchor,
} from '../shared'

/**
 * Compose stage 4 — the per-section CONTENT / VISUAL passes, grounded in the
 * full outline context (chosen angle + sources + the section's outline stub).
 *
 *   phase: 'content'  → write the section's prose (markdown)
 *   phase: 'visual'   → design the section's config `body`
 *   phase: 'combined' → both (default)
 *
 * Edits are in place (markdown prose under the `## heading`; the config section
 * keyed by id), so section ids — and the canvas frame mapping — stay stable.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface StoredBrief {
  summary?: string
  keyFacts?: string[]
  entities?: string[]
  suggestedFormat?: StoryFormat
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { sectionId?: string; phase?: 'content' | 'visual' | 'combined'; model?: string; feedback?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : ''
  if (!sectionId) return NextResponse.json({ error: 'missing "sectionId"' }, { status: 400 })
  const phase = body.phase ?? 'combined'

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })
  const entry = state.outline.find((e) => e.sectionId === sectionId || e.id === sectionId)
  if (!entry?.sectionId) {
    return NextResponse.json({ error: 'section is not materialised' }, { status: 404 })
  }

  const docs = sourcesToDocs(await listStorySources(slug))
  const model = resolveModel(body.model, state.model)
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''

  // Rebuild the rich outline context the section generators expect.
  const storyOutline = (state.storyOutline ?? null) as StoryOutline | null
  const stub: SectionStub =
    storyOutline?.sections.find((s) => s.heading === entry.heading) ?? {
      heading: entry.heading,
      kind: entry.kind,
      intent: entry.intent,
      context: entry.context,
      expectedContent: entry.expectedContent,
      visual: entry.visual,
      layout: entry.layout,
      chartId: entry.chartId,
      geo: entry.geo,
      regionRequirement: entry.regionRequirement,
      subsections: entry.subsections,
    }
  const sb = (state.brief ?? {}) as StoredBrief
  const chosen = state.angles.find((a) => a.id === state.chosenAngleId) ?? state.angles[0]
  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state.format,
    candidateAngles: chosen ? [chosen.title] : [],
    questions: [],
  }
  const answers: ComposeAnswers = chosen ? { 'lead-angle': `${chosen.title} — ${chosen.thesis}` } : {}
  const ctx: SectionContext = {
    source: 'outline',
    outline:
      storyOutline ?? {
        format: state.format,
        title: '',
        subtitle: '',
        byline: '',
        charts: [],
        imagePrompts: [],
        sections: [stub],
      },
    stub,
    sources: docs,
    brief,
    answers,
  }

  const src = getContentSource()
  const [markdown, configYaml] = await Promise.all([src.readMarkdown(slug), src.readConfigYaml(slug)])
  if (markdown == null || configYaml == null) {
    return NextResponse.json({ error: 'draft story files are missing' }, { status: 404 })
  }

  let newMarkdown = markdown
  let newConfig = configYaml
  // The markdown anchor the prose lives under — the config `text`, NOT the
  // outline heading: a deck cover anchors at `## Cover` while its entry keeps
  // the display title (which lives in the config `heading` field).
  const anchor = sectionAnchor(configYaml, entry.sectionId) ?? entry.heading
  const result: {
    heading: string
    paragraphs?: string[]
    kind?: string
    body?: Record<string, unknown>
    subsections?: Array<{ heading: string; paragraphs: string[] }>
  } = {
    heading: entry.heading,
  }
  // A parent with sub-beats has no prose of its own — the engine ignores it.
  // CONTENT writes each beat's prose under its own `## heading`; VISUAL designs
  // the parent camera + per-beat dives.
  const subStubs: SubsectionStub[] = state.format === 'map' ? (stub.subsections ?? []) : []
  const hasSubs = subStubs.length > 0

  try {
    if (phase === 'content' || phase === 'combined') {
      if (hasSubs) {
        const subsOut: Array<{ heading: string; paragraphs: string[] }> = []
        for (const sub of subStubs) {
          // eslint-disable-next-line no-await-in-loop
          const c = await generateSubsectionContent(ctx, stub, sub, { model })
          newMarkdown = replaceMarkdownProse(newMarkdown, sub.heading, c.paragraphs)
          subsOut.push(c)
        }
        result.subsections = subsOut
        result.kind = entry.kind
      } else {
        const refine =
          feedback && phase === 'content'
            ? {
                feedback,
                previous: { heading: entry.heading, paragraphs: readMarkdownProse(markdown, anchor), kind: entry.kind },
              }
            : undefined
        const content = await generateSectionContent(ctx, { model, refine })
        newMarkdown = replaceMarkdownProse(newMarkdown, anchor, content.paragraphs)
        result.paragraphs = content.paragraphs
        result.kind = content.kind
      }
    }
    if (phase === 'visual' || phase === 'combined') {
      const contentForVisual = hasSubs
        ? { heading: entry.heading, paragraphs: [], kind: entry.kind }
        : result.paragraphs
          ? { heading: entry.heading, paragraphs: result.paragraphs, kind: result.kind ?? entry.kind }
          : { heading: entry.heading, paragraphs: readMarkdownProse(markdown, anchor), kind: entry.kind }
      const refine = feedback && phase === 'visual' ? { feedback, previous: { heading: entry.heading } } : undefined
      const visual = await generateSectionVisual(ctx, contentForVisual, { model, refine })
      let visualBody = visual.body
      // DECK cover: complete the editorial cover surface and attach the hero
      // image — its `assets://` ref points at the key the compose image step
      // uploads to (same deterministic filename on both sides), so it never
      // dangles on a fabricated URL.
      if (isDeckCover(state.format, contentForVisual.kind)) {
        visualBody = completeCoverBody(visualBody, {
          heading: entry.heading,
          image: coverImageLayer(slug, storyOutline?.imagePrompts, entry.heading),
        })
      }
      // MAP choropleth: the visual pass frames the camera but never authors the
      // per-region values — fill them with the focused source-grounded pass and
      // merge into body.map.regions, exactly as generateSection does offline.
      if (state.format === 'map' && stub.regionRequirement) {
        const regions = await generateRegions(
          { requirement: stub.regionRequirement, brief, sources: docs },
          { model },
        )
        visualBody = injectRegions(visualBody, regions)
      }
      if (hasSubs) {
        // Per-beat camera dives: center/zoom from the planned geo, tilt + focal
        // pins from the sub visual pass, grounded in the beat's written prose.
        const subEntries: Array<Record<string, unknown>> = []
        for (const sub of subStubs) {
          const paragraphs =
            result.subsections?.find((s) => s.heading === sub.heading)?.paragraphs ??
            readMarkdownProse(newMarkdown, sub.heading)
          // eslint-disable-next-line no-await-in-loop
          const map = await generateSubsectionVisual(ctx, stub, sub, { paragraphs }, { model })
          subEntries.push({
            text: sub.heading,
            ...(Object.keys(map).length ? { map } : {}),
          })
        }
        visualBody = { ...visualBody, subsections: subEntries }
      }
      newConfig = replaceConfigBody(newConfig, entry.sectionId, visualBody)
      result.body = visualBody
    }
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  try {
    if (newMarkdown !== markdown) await src.writeMarkdown(slug, newMarkdown)
    if (newConfig !== configYaml) await src.writeConfigYaml(slug, newConfig)
  } catch (e) {
    return NextResponse.json(
      { error: `failed to write section: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  try {
    const supabase = createServiceClient()
    const params2 = { feature: 'compose-section', phase, refined: Boolean(feedback) }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `${phase} for "${entry.heading}"`,
      model,
      params: params2,
      requestHash: hashRequest({ model, prompt: `section:${slug}:${entry.sectionId}:${Date.now()}`, params: params2 }),
      resultRef: null,
      resultText: JSON.stringify(result),
    })
  } catch {
    // best-effort audit
  }

  return NextResponse.json({ ok: true, section: result })
}
