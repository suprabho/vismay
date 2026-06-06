import { GEN_FOREGROUND_TYPES } from './vizEngine'
import { SECTION_KINDS } from './schema'
import type {
  SourceDoc,
  ResearchBrief,
  ComposeAnswers,
  StoryFormat,
  StoryOutline,
  SectionStub,
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

const LAYER_MENU = GEN_FOREGROUND_TYPES.filter(
  (l) => l.type !== 'image' && l.type !== 'imageGrid',
)
  .map((l) => `- ${l.type}: ${l.label}`)
  .join('\n')

// ── Step 1: outline ────────────────────────────────────────────────────────

export function outlineSystem(format: StoryFormat): string {
  return (
    `You plan a Vizmaya ${format} data story from research + the editor's answers — the ` +
    `SKELETON only, no prose yet.\n\n` +
    `Produce:\n` +
    `- title, subtitle, byline.\n` +
    `- charts: every chart the story needs, as a simple spec (chartType bar|line, categories, ` +
    `numeric series) with a kebab-case id. Sections reference charts by id.\n` +
    `- imagePrompts: vivid prompts for sections that want imagery.\n` +
    `- sections (3–8): each a stub with a heading, a kind (${SECTION_KINDS.join(' | ')}), an ` +
    `intent (1–2 sentences on what it covers and which visual it features — stat / chart / ` +
    `quote / prose), and an optional chartId.\n\n` +
    `Open with a cover/hero and end with a closing section. Ground every figure in the sources; ` +
    `do not invent data.`
  )
}

export function buildOutlinePrompt(
  sources: SourceDoc[],
  brief: ResearchBrief,
  answers: ComposeAnswers,
): string {
  return (
    `RESEARCH BRIEF\n` +
    `Summary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n` +
    `Entities: ${brief.entities.join(', ')}\n` +
    `Candidate angles:\n${brief.candidateAngles.map((a) => `- ${a}`).join('\n')}\n\n` +
    `EDITOR'S ANSWERS\n${renderAnswers(brief, answers)}\n\n` +
    `SOURCES\n${renderSources(sources)}`
  )
}

// ── Step 2: one section ────────────────────────────────────────────────────

export function sectionSystem(format: StoryFormat): string {
  const formatGuidance =
    format === 'map'
      ? `This is a MAP story. Set body.map to the section camera (center [lng, lat], zoom, ` +
        `optional pitch/bearing/pins with [lng, lat] coordinates). A foreground is optional.`
      : `This is a DECK story. Set body.foreground: either a flat layers list, or a layout name ` +
        `plus regions (each region maps to its layers). Good layouts: stat-left-chart-right, ` +
        `text-left-chart-right, text-left-quote-right, chart-top-text-below, centered, hero-full-bleed.`

  return (
    `You write ONE section of a Vizmaya ${format} data story, given the outline and this ` +
    `section's intent.\n\n` +
    `Produce: heading (keep the planned one), paragraphs (body prose, one string per paragraph, ` +
    `factual magazine register), kind, and body (the VISUAL content as structured fields — NOT ` +
    `YAML, NOT a string).\n\n` +
    `${formatGuidance}\n\n` +
    `Available foreground layer types:\n${LAYER_MENU}\n\n` +
    `Rules:\n` +
    `- Reference theme tokens (accent, accent2, teal, positive, amber, red, muted) for colours.\n` +
    `- Do NOT emit image or imageGrid layers — carry the section with stats, charts, quotes, prose.\n` +
    `- A chart layer references a chart id from the outline; do not invent chart ids.\n` +
    `- Ground every figure in the sources; do not invent data.`
  )
}

export function buildSectionPrompt(
  outline: StoryOutline,
  stub: SectionStub,
  sources: SourceDoc[],
  brief: ResearchBrief,
  answers: ComposeAnswers,
  refine?: { feedback: string; previous: unknown },
): string {
  const chartList = outline.charts.length
    ? outline.charts.map((c) => `- ${c.id}: ${c.title ?? c.chartType} (${c.chartType})`).join('\n')
    : '(none)'
  const otherHeadings = outline.sections.map((s) => s.heading).join(' · ')

  const base =
    `STORY: ${outline.title} — ${outline.subtitle}\n` +
    `All sections: ${otherHeadings}\n` +
    `Available charts:\n${chartList}\n\n` +
    `THIS SECTION\n` +
    `Heading: ${stub.heading}\n` +
    `Kind: ${stub.kind}\n` +
    `Intent: ${stub.intent}\n` +
    (stub.chartId ? `Feature chart: ${stub.chartId}\n` : '') +
    `\nBRIEF\nSummary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n` +
    `EDITOR'S ANSWERS\n${renderAnswers(brief, answers)}\n\n` +
    `SOURCES\n${renderSources(sources)}`

  if (refine) {
    return (
      `${base}\n\nPREVIOUS DRAFT OF THIS SECTION:\n${JSON.stringify(refine.previous)}\n\n` +
      `Revise that draft per this feedback (keep what works, change only what's noted):\n${refine.feedback}`
    )
  }
  return base
}
