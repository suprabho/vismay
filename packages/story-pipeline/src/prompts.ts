import { GEN_FOREGROUND_TYPES } from './vizEngine'
import { SECTION_KINDS } from './schema'
import type { SourceDoc, ResearchBrief, ComposeAnswers, StoryFormat } from './types'

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

/** The generation system prompt, specialised per format. */
export function generateSystem(format: StoryFormat): string {
  const layerMenu = GEN_FOREGROUND_TYPES.filter(
    (l) => l.type !== 'image' && l.type !== 'imageGrid',
  )
    .map((l) => `- ${l.type}: ${l.label}`)
    .join('\n')

  const formatGuidance =
    format === 'map'
      ? `This is a MAP story. Geography is the spine. For each section set body.map to the ` +
        `camera (center [lng, lat], zoom, optional pitch/bearing/pins with [lng, lat] coordinates). ` +
        `A foreground is optional and sits over the map.`
      : `This is a DECK story. Each section is a slide. Set body.foreground: either a flat ` +
        `layers list, or a layout name plus regions (each region maps to its own layers). ` +
        `Good layouts: stat-left-chart-right, text-left-chart-right, text-left-quote-right, ` +
        `chart-top-text-below, centered, hero-full-bleed.`

  return (
    `You author a complete Vizmaya ${format} data story from research + the editor's answers.\n\n` +
    `Produce:\n` +
    `- title, subtitle, byline.\n` +
    `- sections (3–8): each has a heading (becomes the markdown ## and config text anchor), ` +
    `paragraphs (body prose, one string per paragraph, factual magazine register), a kind ` +
    `(one of ${SECTION_KINDS.join(' | ')}), and a body (the VISUAL content as structured ` +
    `fields — NOT YAML, NOT a string).\n` +
    `- charts: every chart you reference, as a simple spec (chartType bar|line, categories, ` +
    `numeric series). A chart layer references a chart by its id; define that id here.\n` +
    `- imagePrompts: vivid prompts for sections that want imagery.\n\n` +
    `${formatGuidance}\n\n` +
    `Available foreground layer types:\n${layerMenu}\n\n` +
    `Rules:\n` +
    `- Reference theme tokens (accent, accent2, teal, positive, amber, red, muted) for colours.\n` +
    `- Do NOT emit image or imageGrid layers (no real assets exist yet) — request imagery via ` +
    `imagePrompts instead, and carry the narrative with stats, charts, quotes, and prose.\n` +
    `- Open with a cover/hero and end with a closing section.\n` +
    `- Ground every figure in the sources; do not invent data.`
  )
}

/** Fold the brief + answers + sources into the generation user prompt. */
export function buildGeneratePrompt(
  sources: SourceDoc[],
  brief: ResearchBrief,
  answers: ComposeAnswers,
): string {
  const qa = brief.questions
    .map((q) => {
      const a = answers[q.id]
      return a ? `- ${q.question}\n  → ${a}` : null
    })
    .filter(Boolean)
    .join('\n')

  return (
    `RESEARCH BRIEF\n` +
    `Summary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n` +
    `Entities: ${brief.entities.join(', ')}\n` +
    `Candidate angles:\n${brief.candidateAngles.map((a) => `- ${a}`).join('\n')}\n\n` +
    `EDITOR'S ANSWERS\n${qa || '(none provided — use your best judgement)'}\n\n` +
    `SOURCES\n${renderSources(sources)}`
  )
}
