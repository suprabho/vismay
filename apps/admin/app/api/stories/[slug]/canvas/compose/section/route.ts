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
  collectRecapDirectives,
  graftSectionBody,
  type StoryFormat,
  type ComposeAnswers,
} from '@vismay/story-pipeline'
import { getContentSource } from '@vismay/content-source/contentSource'
import { listStorySources } from '@vismay/content-source/storySources'
import { readComposeState } from '@vismay/content-source/composeState'
import {
  resolveModel,
  resolveStoryPack,
  resolveHydrationDeps,
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

// Each successful concurrent section write bumps the story version, so a loser
// needs at most one retry per other in-flight writer. The client caps in-flight
// writes at MAX_CONCURRENT_SECTIONS (3); 5 leaves comfortable headroom.
const SECTION_WRITE_RETRIES = 5

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
  const pack = await resolveStoryPack(slug)
  // Pre-fetch any vertical data the pack hydrates onto generated layers (e.g. f1
  // driver headshots from the DB) — only the VISUAL pass consumes it, so skip
  // the lookup on content-only calls.
  const hydrationDeps = phase === 'content' ? undefined : await resolveHydrationDeps(pack)
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
  const [markdown, cfg] = await Promise.all([src.readMarkdown(slug), src.readConfig(slug)])
  if (markdown == null || cfg == null) {
    return NextResponse.json({ error: 'draft story files are missing' }, { status: 404 })
  }
  const configYaml = cfg.text
  const configFormat = cfg.format

  let newMarkdown = markdown
  let newConfig = configYaml
  // The disjoint slice edits this section's passes produce — re-applied to the
  // freshly-read story at write time so a concurrent section write can't clobber
  // them (see the CAS retry loop below). The local `newMarkdown`/`newConfig`
  // copies are kept only for the VISUAL pass's prose reads + change detection.
  const mdEdits: Array<{ anchor: string; paragraphs: string[] }> = []
  let cfgBody: Record<string, unknown> | null = null
  // The markdown anchor the prose lives under — the config `text`, NOT the
  // outline heading: a deck cover anchors at `## Cover` while its entry keeps
  // the display title (which lives in the config `heading` field).
  const anchor = sectionAnchor(configYaml, entry.sectionId, configFormat) ?? entry.heading
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
          const c = await generateSubsectionContent(ctx, stub, sub, { model, pack })
          newMarkdown = replaceMarkdownProse(newMarkdown, sub.heading, c.paragraphs)
          mdEdits.push({ anchor: sub.heading, paragraphs: c.paragraphs })
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
        const content = await generateSectionContent(ctx, { model, pack, refine })
        newMarkdown = replaceMarkdownProse(newMarkdown, anchor, content.paragraphs)
        mdEdits.push({ anchor, paragraphs: content.paragraphs })
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
      const visual = await generateSectionVisual(ctx, contentForVisual, { model, pack, refine, hydrationDeps })
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
          { model, pack },
        )
        visualBody = injectRegions(visualBody, regions)
      }
      // Footshorts recap ingestion: when a source is a daily recap, it carries
      // real `fs:` configs (actual fixtures, the live table, the bracket). Swap
      // the model's guessed config on any fs: layer it placed for the recap's
      // real one, matched to this section by team/competition overlap. No-op for
      // non-footshorts stories or sources without `fs:` fences.
      const recapDirectives = collectRecapDirectives(docs)
      if (recapDirectives.length > 0) {
        const sectionText = [
          entry.heading,
          ...(contentForVisual.paragraphs ?? []),
        ].join('\n')
        graftSectionBody(visualBody, recapDirectives, sectionText)
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
          const map = await generateSubsectionVisual(ctx, stub, sub, { paragraphs }, { model, pack })
          subEntries.push({
            text: sub.heading,
            ...(Object.keys(map).length ? { map } : {}),
          })
        }
        visualBody = { ...visualBody, subsections: subEntries }
      }
      newConfig = replaceConfigBody(newConfig, entry.sectionId, visualBody, configFormat)
      cfgBody = visualBody
      result.body = visualBody
    }
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const hasMdEdit = mdEdits.length > 0 && newMarkdown !== markdown
  const hasCfgEdit = cfgBody != null && newConfig !== configYaml
  try {
    if (hasMdEdit || hasCfgEdit) {
      // CAS retry: re-read the latest story, re-apply this section's disjoint
      // slice(s) on top of it, and write only if no other section write landed
      // in between (version unchanged). Without this, two section passes that
      // both read the same snapshot would each write back the whole story and
      // the later writer would silently drop the earlier one's section — the
      // lost-update race that left some sections un-written.
      let applied = false
      for (let attempt = 0; attempt < SECTION_WRITE_RETRIES; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        const fresh = await src.readStoryForEdit(slug)
        if (!fresh) return NextResponse.json({ error: 'draft story files are missing' }, { status: 404 })
        let md = fresh.markdown
        for (const e of mdEdits) md = replaceMarkdownProse(md, e.anchor, e.paragraphs)
        const cfg = cfgBody
          ? replaceConfigBody(fresh.configYaml ?? configYaml, entry.sectionId, cfgBody, fresh.configFormat)
          : null
        // eslint-disable-next-line no-await-in-loop
        const ok = await src.casWriteStory(
          slug,
          {
            ...(hasMdEdit ? { markdown: md } : {}),
            ...(hasCfgEdit ? { configYaml: cfg, configFormat: fresh.configFormat } : {}),
          },
          fresh.version,
        )
        if (ok) {
          applied = true
          break
        }
      }
      if (!applied) {
        return NextResponse.json(
          { error: 'section write kept losing a race with a concurrent write — please retry' },
          { status: 409 },
        )
      }
    }
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
