import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  generateOutlineSection,
  type ResearchBrief,
  type StoryFormat,
  type StoryOutline,
  type SectionStub,
  type ComposeAnswers,
} from '@vismay/story-pipeline'
import { listStorySources } from '@vismay/content-source/storySources'
import {
  readComposeState,
  writeComposeState,
  type ComposeOutlineEntry,
} from '@vismay/content-source/composeState'
import { resolveModel, resolveStoryPack, sourcesToDocs } from '../../shared'

/**
 * Compose stage 3, per-slide — regenerate ONE outline section in place, or add
 * a NEW section from an author prompt, without re-planning the whole deck. Both
 * are STRUCTURE edits, so they only run during the outline phase on a live
 * draft, and only against entries that haven't been materialised yet (a
 * regenerated stub for an already-written section would desync from its prose).
 * The result is converted to a `ComposeOutlineEntry`, slotted into
 * `compose_state.outline` with a unique heading + id, and mirrored into
 * `storyOutline.sections` so the CONTENT/VISUAL passes read the fresh stub.
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

/** A SectionStub → ComposeOutlineEntry projection (mirrors the outline route's
 *  mapping), preserving an existing entry's id/status when regenerating. */
function stubToEntry(
  stub: SectionStub,
  base: { id: string; status: ComposeOutlineEntry['status']; sectionId: string | null },
): ComposeOutlineEntry {
  return {
    id: base.id,
    heading: stub.heading,
    intent: stub.intent,
    kind: stub.kind,
    context: stub.context,
    expectedContent: stub.expectedContent,
    visual: stub.visual,
    layout: stub.layout,
    chartId: stub.chartId,
    geo: stub.geo,
    regionRequirement: stub.regionRequirement,
    subsections: stub.subsections,
    status: base.status,
    sectionId: base.sectionId,
  }
}

/** An outline entry, as the SectionStub the pipeline plans against. */
function entryToStub(e: ComposeOutlineEntry): SectionStub {
  return {
    heading: e.heading,
    kind: e.kind,
    intent: e.intent,
    context: e.context,
    expectedContent: e.expectedContent,
    visual: e.visual,
    layout: e.layout,
    chartId: e.chartId,
    geo: e.geo,
    regionRequirement: e.regionRequirement,
    subsections: e.subsections,
  }
}

/** A fresh `s<n>` entry id that doesn't collide with the existing ones. */
function nextEntryId(entries: ComposeOutlineEntry[]): string {
  const used = new Set(entries.map((e) => e.id))
  let n = entries.length + 1
  while (used.has(`s${n}`)) n++
  return `s${n}`
}

/** Make `heading` unique against `taken` (case-insensitive) — outline headings
 *  are markdown anchors, so a duplicate would collide on materialise. */
function uniqueHeading(heading: string, taken: Set<string>): string {
  const norm = (s: string) => s.trim().toLowerCase()
  if (!taken.has(norm(heading))) return heading
  for (let i = 2; ; i++) {
    const candidate = `${heading} (${i})`
    if (!taken.has(norm(candidate))) return candidate
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: {
    mode?: 'regenerate' | 'add'
    entryId?: string
    afterId?: string
    prompt?: string
    feedback?: string
    model?: string
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // empty body — defaults below reject it
  }
  const mode = body.mode === 'add' ? 'add' : body.mode === 'regenerate' ? 'regenerate' : null
  if (!mode) {
    return NextResponse.json({ error: 'expected mode "regenerate" or "add"' }, { status: 400 })
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })
  if (state.archived) {
    return NextResponse.json({ error: 'draft is finished — reopen it to edit the outline' }, { status: 400 })
  }
  if (state.phase !== 'outline') {
    return NextResponse.json(
      { error: 'sections can only be regenerated or added during the outline phase' },
      { status: 400 },
    )
  }
  if (!state.angles?.length) {
    return NextResponse.json({ error: 'generate angles and pick one first' }, { status: 422 })
  }

  const chosen = state.angles.find((a) => a.id === state.chosenAngleId) ?? state.angles[0]!
  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources yet' }, { status: 422 })
  }

  const model = resolveModel(body.model, state.model)
  const sb = (state.brief ?? {}) as StoredBrief
  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state.format,
    candidateAngles: [chosen.title],
    questions: [],
  }
  const answers: ComposeAnswers = { 'lead-angle': `${chosen.title} — ${chosen.thesis}` }
  const pack = await resolveStoryPack(slug)
  const storyOutline = (state.storyOutline ?? null) as StoryOutline | null
  const charts = storyOutline?.charts ?? []

  // The target index for a regenerate / the insertion point for an add.
  const entries = state.outline
  let targetIndex = -1
  if (mode === 'regenerate') {
    targetIndex = entries.findIndex((e) => e.id === body.entryId)
    if (targetIndex < 0) {
      return NextResponse.json({ error: 'no outline section with that id' }, { status: 404 })
    }
    if (entries[targetIndex]!.sectionId) {
      return NextResponse.json(
        { error: 'that section is already materialised — regenerate it from the section editor instead' },
        { status: 400 },
      )
    }
  }
  // Where an added section slots in: after `afterId`, else at the end.
  const insertAt =
    mode === 'add'
      ? body.afterId
        ? (() => {
            const i = entries.findIndex((e) => e.id === body.afterId)
            return i < 0 ? entries.length : i + 1
          })()
        : entries.length
      : -1

  // Surrounding sections for context (exclude the regenerate target).
  const surrounding =
    mode === 'regenerate'
      ? entries.filter((_, i) => i !== targetIndex).map(entryToStub)
      : entries.map(entryToStub)
  const instruction = mode === 'regenerate' ? body.feedback : body.prompt

  let stub: SectionStub
  try {
    stub = await generateOutlineSection(
      { sources: docs, brief, answers },
      {
        mode,
        outline: surrounding,
        charts,
        target: mode === 'regenerate' ? entryToStub(entries[targetIndex]!) : undefined,
        position: mode === 'add' ? insertAt + 1 : targetIndex + 1,
        instruction: instruction?.trim() || undefined,
      },
      { format: state.format, model, pack },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Headings are anchors — keep the new one unique against the OTHER entries.
  const takenHeadings = new Set(
    entries
      .filter((_, i) => !(mode === 'regenerate' && i === targetIndex))
      .map((e) => e.heading.trim().toLowerCase()),
  )
  stub = { ...stub, heading: uniqueHeading(stub.heading, takenHeadings) }

  let nextOutline: ComposeOutlineEntry[]
  let entry: ComposeOutlineEntry
  if (mode === 'regenerate') {
    const prev = entries[targetIndex]!
    entry = stubToEntry(stub, { id: prev.id, status: prev.status, sectionId: null })
    nextOutline = entries.map((e, i) => (i === targetIndex ? entry : e))
  } else {
    entry = stubToEntry(stub, { id: nextEntryId(entries), status: 'pending', sectionId: null })
    nextOutline = [...entries.slice(0, insertAt), entry, ...entries.slice(insertAt)]
  }

  // Mirror the stub into storyOutline.sections (matched by the OLD heading on a
  // regenerate, inserted at the same slot on an add) so the CONTENT/VISUAL pass
  // reads the fresh stub rather than a stale one.
  let nextStoryOutline = storyOutline
  if (storyOutline) {
    const sections = storyOutline.sections ?? []
    if (mode === 'regenerate') {
      const prevHeading = entries[targetIndex]!.heading
      const at = sections.findIndex((s) => s.heading === prevHeading)
      const merged = at >= 0 ? sections.map((s, i) => (i === at ? stub : s)) : [...sections, stub]
      nextStoryOutline = { ...storyOutline, sections: merged }
    } else {
      // Place it next to its outline neighbour so section order stays aligned.
      const beforeHeading = insertAt > 0 ? entries[insertAt - 1]!.heading : null
      const at = beforeHeading ? sections.findIndex((s) => s.heading === beforeHeading) : -1
      const merged =
        at >= 0
          ? [...sections.slice(0, at + 1), stub, ...sections.slice(at + 1)]
          : [...sections, stub]
      nextStoryOutline = { ...storyOutline, sections: merged }
    }
  }

  await writeComposeState(slug, {
    ...state,
    outline: nextOutline,
    storyOutline: nextStoryOutline ?? state.storyOutline,
  })

  try {
    const supabase = createServiceClient()
    const auditParams = { feature: 'compose-outline-section', mode }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `${mode} outline section "${stub.heading}"`,
      model,
      params: auditParams,
      requestHash: hashRequest({
        model,
        prompt: `outline-section:${slug}:${mode}:${Date.now()}`,
        params: auditParams,
      }),
      resultRef: null,
      resultText: JSON.stringify(entry),
    })
  } catch {
    // best-effort audit
  }

  return NextResponse.json({ ok: true, mode, entry, outline: nextOutline })
}
