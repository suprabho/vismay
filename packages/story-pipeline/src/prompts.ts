import { GEN_FOREGROUND_TYPES } from './vizEngine'
import { SECTION_KINDS } from './schema'
import type {
  SourceDoc,
  ResearchBrief,
  ComposeAnswers,
  StoryFormat,
  SectionContext,
  SectionContentDraft,
} from './types'

/** Per-source character cap so a few long PDFs don't blow the context budget. */
const MAX_SOURCE_CHARS = 12_000

/** Render the ingested sources as a titled, bounded prompt block. */
export function renderSources(sources: SourceDoc[]): string {
  if (sources.length === 0) return '(no sources provided)'
  return sources
    .map((s, i) => {
      const head = `### Source ${i + 1}: ${s.title}${s.byline ? ` — ${s.byline}` : ''}\n(${s.kind}: ${s.origin})`
      const body =
        s.body.length > MAX_SOURCE_CHARS
          ? `${s.body.slice(0, MAX_SOURCE_CHARS)}\n…[truncated]`
          : s.body
      return `${head}\n\n${body}`
    })
    .join('\n\n---\n\n')
}

export const RESEARCH_SYSTEM =
  `You are a research analyst preparing a data-driven visual story for the Vizmaya desk. ` +
  `Read the provided sources and produce a structured brief:\n` +
  `- summary: what the material is really about.\n` +
  `- keyFacts: the load-bearing facts and figures a story would stand on.\n` +
  `- entities: the main people, orgs, places, things.\n` +
  `- suggestedFormat: "deck" for a slide narrative, "map" when geography is the spine.\n` +
  `- candidateAngles: 2–4 distinct angles.\n` +
  `- questions: 3–6 sharp clarifying questions an editor MUST answer before you write ` +
  `(format choice, lead angle, audience, scope, what to emphasise). Prefer "choice" ` +
  `questions with concrete options; use "text" only when open input is genuinely needed.\n\n` +
  `Be specific and grounded in the sources — do not invent facts.`

export const ANGLES_SYSTEM =
  `You are a research analyst preparing a data-driven visual story for the Vizmaya desk. ` +
  `Read the provided sources and produce:\n` +
  `- summary: what the material is really about.\n` +
  `- keyFacts: the load-bearing facts and figures a story would stand on.\n` +
  `- entities: the main people, orgs, places, things.\n` +
  `- suggestedFormat: "deck" for a slide narrative, "map" when geography is the spine.\n` +
  `- angles: 3–5 DISTINCT angles the story could take. Each is a title, a one-sentence ` +
  `thesis (the claim it makes), and a rationale (why it's worth taking) — all grounded in ` +
  `the sources.\n\nBe specific and grounded — do not invent facts.`

/** Render the editor's answers to the clarifying questions. */
function renderAnswers(brief: ResearchBrief, answers: ComposeAnswers): string {
  const qa = brief.questions
    .map((q) => {
      const a = answers[q.id]
      return a ? `- ${q.question}\n  → ${a}` : null
    })
    .filter(Boolean)
    .join('\n')
  return qa || '(none provided — use your best judgement)'
}

const LAYER_TYPES = GEN_FOREGROUND_TYPES.filter(
  (l) => l.type !== 'image' && l.type !== 'imageGrid',
)
const LAYER_MENU = LAYER_TYPES.map((l) => `- ${l.type}: ${l.label}`).join('\n')
const LAYER_TYPES_INLINE = LAYER_TYPES.map((l) => l.type).join(', ')

/** The deck layouts the VISUAL pass can actually build (no image-only layouts). */
const DECK_LAYOUTS =
  'stat-left-chart-right, text-left-chart-right, text-left-quote-right, ' +
  'stat-top-chart-below, chart-top-text-below, centered, hero-full-bleed'

// ── Step 1: outline ────────────────────────────────────────────────────────

export function outlineSystem(format: StoryFormat): string {
  const visualGuidance =
    format === 'map'
      ? `For each section's "visual" describe the map moment (where the camera sits, what it ` +
        `marks/pins) plus any stat or quote overlaid; leave "layout" empty.`
      : `For each section's "visual" name the foreground layers it features (${LAYER_TYPES_INLINE}) ` +
        `and what each shows, and set "layout" to the deck layout that frames them best ` +
        `(${DECK_LAYOUTS}).`
  return (
    `You plan a Vizmaya ${format} data story from research + the editor's answers — the ` +
    `SKELETON only, no prose yet. The downstream writer and designer act ONLY on what you put ` +
    `in each section stub, so make every section's expectations explicit and concrete.\n\n` +
    `Produce:\n` +
    `- title, subtitle, byline.\n` +
    `- charts: every chart the story needs, as a simple spec (chartType bar|line, categories, ` +
    `numeric series) with a kebab-case id. Sections reference charts by id.\n` +
    `- imagePrompts: vivid prompts for sections that want imagery.\n` +
    `- sections (3–8): each a stub with —\n` +
    `  • heading and kind (${SECTION_KINDS.join(' | ')}).\n` +
    `  • intent: one line on the section's job.\n` +
    `  • context: how it connects to the sections around it (what it follows from, what it sets up).\n` +
    `  • expectedContent: the specific facts, figures, and quotes it must carry — concrete and ` +
    `grounded in the sources, NOT generic placeholders.\n` +
    `  • visual: the visualisation it features (see below).\n` +
    `  • optional chartId when the section features a chart.\n` +
    `${visualGuidance}\n\n` +
    `Open with a cover/hero and end with a closing section. Ground every figure in the sources; ` +
    `do not invent data.`
  )
}

export function buildOutlinePrompt(
  sources: SourceDoc[],
  brief: ResearchBrief,
  answers: ComposeAnswers,
  refine?: { feedback: string; previous: unknown },
): string {
  const base =
    `RESEARCH BRIEF\n` +
    `Summary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n` +
    `Entities: ${brief.entities.join(', ')}\n` +
    `Candidate angles:\n${brief.candidateAngles.map((a) => `- ${a}`).join('\n')}\n\n` +
    `EDITOR'S ANSWERS\n${renderAnswers(brief, answers)}\n\n` +
    `SOURCES\n${renderSources(sources)}`
  if (refine) {
    return (
      `${base}\n\nPREVIOUS OUTLINE:\n${JSON.stringify(refine.previous)}\n\n` +
      `Revise that outline per this feedback (keep what works, change only what's noted):\n${refine.feedback}`
    )
  }
  return base
}

// ── Step 2: one section, in two passes (CONTENT then VISUAL) ───────────────
//
// The CONTENT pass writes prose; the VISUAL pass designs the config `body`
// given the accepted prose. Both are grounded in a `SectionContext` that is
// either the full outline context or a lean free-text brief (canvas PromptBar).

function formatOf(ctx: SectionContext): StoryFormat {
  return ctx.source === 'outline' ? ctx.outline.format : ctx.format
}

/** The shared grounding block (story/section context + brief + sources). */
function contextBlock(ctx: SectionContext): string {
  if (ctx.source === 'brief') return `BRIEF\n${ctx.brief}`
  const { outline, stub, sources, brief, answers } = ctx
  const chartList = outline.charts.length
    ? outline.charts.map((c) => `- ${c.id}: ${c.title ?? c.chartType} (${c.chartType})`).join('\n')
    : '(none)'
  const otherHeadings = outline.sections.map((s) => s.heading).join(' · ')
  return (
    `STORY: ${outline.title} — ${outline.subtitle}\n` +
    `All sections: ${otherHeadings}\n` +
    `Available charts:\n${chartList}\n\n` +
    `THIS SECTION\n` +
    `Heading: ${stub.heading}\n` +
    `Kind: ${stub.kind}\n` +
    `Intent: ${stub.intent}\n` +
    (stub.context ? `Context (role in the story): ${stub.context}\n` : '') +
    (stub.expectedContent ? `Expected content (must cover): ${stub.expectedContent}\n` : '') +
    (stub.visual ? `Planned visual: ${stub.visual}\n` : '') +
    (stub.layout ? `Planned layout: ${stub.layout}\n` : '') +
    (stub.chartId ? `Feature chart: ${stub.chartId}\n` : '') +
    `\nBRIEF\nSummary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n` +
    `EDITOR'S ANSWERS\n${renderAnswers(brief, answers)}\n\n` +
    `SOURCES\n${renderSources(sources)}`
  )
}

function refineBlock(noun: string, refine?: { feedback: string; previous: unknown }): string {
  if (!refine) return ''
  return (
    `\n\nPREVIOUS ${noun} OF THIS SECTION:\n${JSON.stringify(refine.previous)}\n\n` +
    `Revise it per this feedback (keep what works, change only what's noted):\n${refine.feedback}`
  )
}

// CONTENT pass — prose only (no visual body).

export function contentSystem(format: StoryFormat): string {
  return (
    `You write the PROSE for ONE section of a Vizmaya ${format} data story.\n\n` +
    `Produce:\n` +
    `- heading: short and specific (becomes the markdown ## and the config text anchor).\n` +
    `- paragraphs: the body prose, one string per paragraph, factual magazine register.\n` +
    `- kind: one of ${SECTION_KINDS.join(' | ')}.\n\n` +
    `Cover the section's planned "expected content" and honour its context in the arc. ` +
    `Ground every figure in the provided material; do not invent data. No visual layout here ` +
    `— the visual is designed in a later pass.`
  )
}

export function buildContentPrompt(
  ctx: SectionContext,
  refine?: { feedback: string; previous: unknown },
): string {
  return contextBlock(ctx) + refineBlock('DRAFT', refine)
}

// VISUAL pass — the config `body`, given the already-written prose.

export function visualSystem(format: StoryFormat): string {
  const formatGuidance =
    format === 'map'
      ? `This is a MAP story. Set body.map to the section camera (center [lng, lat], zoom, ` +
        `optional pitch/bearing/pins with [lng, lat] coordinates). A foreground is optional.`
      : `This is a DECK story. Set body.foreground: either a flat layers list, or a layout name ` +
        `plus regions (each region maps to its layers). Good layouts: ${DECK_LAYOUTS}.`

  return (
    `You design the VISUAL for ONE already-written section of a Vizmaya ${format} data story. ` +
    `You are given the section's heading and prose; produce body — the visual content as ` +
    `structured fields (NOT YAML, NOT a string).\n\n` +
    `${formatGuidance}\n\n` +
    `Available foreground layer types:\n${LAYER_MENU}\n\n` +
    `Rules:\n` +
    `- Honour the section's planned visual and layout when the outline gives one; deviate only ` +
    `if the written prose clearly calls for it.\n` +
    `- Reference theme tokens (accent, accent2, teal, positive, amber, red, muted) for colours.\n` +
    `- Do NOT emit image or imageGrid layers — carry the section with stats, charts, quotes, prose.\n` +
    `- A chart layer references an existing chart id; do not invent chart ids.\n` +
    `- Surface the figures already in the prose; do not invent data.`
  )
}

export function buildVisualPrompt(
  ctx: SectionContext,
  content: SectionContentDraft,
  refine?: { feedback: string; previous: unknown },
): string {
  const written =
    `SECTION (already written)\n` +
    `Heading: ${content.heading}\n` +
    `Kind: ${content.kind}\n` +
    `Prose:\n${content.paragraphs.map((p) => `- ${p}`).join('\n')}\n\n`
  return written + contextBlock(ctx) + refineBlock('VISUAL BODY', refine)
}
