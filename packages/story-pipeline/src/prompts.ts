import { GEN_FOREGROUND_TYPES, getForegroundLayout } from './vizEngine'
import { SECTION_KINDS } from './schema'
import type {
  SourceDoc,
  ResearchBrief,
  ComposeAnswers,
  StoryFormat,
  SectionContext,
  SectionContentDraft,
  ChartRequirement,
  RegionRequirement,
} from './types'

/** Per-source character cap so a few long PDFs don't blow the context budget.
 *  The prose passes (research / angles / outline / content) read for gist, so
 *  the tight default is fine. The CHART data pass overrides it — see below. */
const MAX_SOURCE_CHARS = 12_000

/**
 * The chart DATA pass needs the actual numbers, which in data-heavy sources
 * (a long CSV, a stats-dense report) often sit well past the prose cap — and
 * tabular numeric data is exactly what the tight default truncates away. So
 * the chart pass renders sources with a much larger budget; numeric fidelity
 * matters more there than keeping the prompt lean.
 */
const CHART_SOURCE_CHARS = 48_000

/** Render the ingested sources as a titled, bounded prompt block. `maxChars`
 *  caps each source's body (the chart pass passes a larger budget). */
export function renderSources(
  sources: SourceDoc[],
  maxChars: number = MAX_SOURCE_CHARS,
): string {
  if (sources.length === 0) return '(no sources provided)'
  return sources
    .map((s, i) => {
      const head = `### Source ${i + 1}: ${s.title}${s.byline ? ` — ${s.byline}` : ''}\n(${s.kind}: ${s.origin})`
      const body =
        s.body.length > maxChars
          ? `${s.body.slice(0, maxChars)}\n…[truncated]`
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
const DECK_LAYOUT_NAMES = [
  'stat-left-chart-right',
  'text-left-chart-right',
  'text-left-quote-right',
  'stat-top-chart-below',
  'chart-top-text-below',
  'centered',
  'hero-full-bleed',
] as const

/** Names only — enough for the outline pass, which just picks a layout. */
const DECK_LAYOUTS = DECK_LAYOUT_NAMES.join(', ')

/**
 * Render a layout-name list with the regions each ACTUALLY defines, read from
 * viz-engine's registry so it can never drift from the renderer. The renderer
 * places layers ONLY into a layout's real regions — a layer in any other region
 * is silently dropped — so the VISUAL pass is shown the exact region vocabulary
 * and told not to invent regions. Single-box layouts (hero-full-bleed) are
 * called out so a cover doesn't emit `lead`/`body` it can't place.
 */
function layoutMenu(names: readonly string[]): string {
  return names
    .map((name) => {
      const def = getForegroundLayout(name)
      const regions = def ? Object.keys(def.regions ?? {}).filter((k) => k !== 'default') : []
      return regions.length
        ? `- ${name} — regions: ${regions.join(', ')}`
        : `- ${name} — ONE full-bleed box (single overlay layer; no named regions)`
    })
    .join('\n')
}
const DECK_LAYOUT_MENU = layoutMenu(DECK_LAYOUT_NAMES)

// ── Step 1: outline ────────────────────────────────────────────────────────

export function outlineSystem(format: StoryFormat): string {
  const visualGuidance =
    format === 'map'
      ? `A Vizmaya MAP section shades GEOGRAPHY: the camera frames a region and a choropleth shades ` +
        `each area by a value — the map IS the chart, not a backdrop. For each section's "visual" ` +
        `describe the camera moment (where it sits, what it frames, any focal pins). When the section ` +
        `shades regions by a metric, ALSO set "regionRequirement" (metric + level + which regions); ` +
        `for generated stories use level "country" (built-in boundaries, ISO codes) unless the sources ` +
        `ship custom GeoJSON. The prose renders in the scroll rail and any supporting chart is ` +
        `referenced by id — do NOT plan a side panel over the map.`
      : `For each section's "visual" name the foreground layers it features (${LAYER_TYPES_INLINE}) ` +
        `and what each shows, and set "layout" to the deck layout that frames them best ` +
        `(${DECK_LAYOUTS}).`
  return (
    `You plan a Vizmaya ${format} data story from research + the editor's answers — the ` +
    `SKELETON only, no prose yet. The downstream writer and designer act ONLY on what you put ` +
    `in each section stub, so make every section's expectations explicit and concrete.\n\n` +
    `Produce:\n` +
    `- title, subtitle, byline.\n` +
    `- charts: every chart the story needs, declared as a REQUIREMENT — a kebab-case id, ` +
    `chartType (bar|line), a title, and a precise "requirement" describing exactly what to ` +
    `plot (which figures/series/categories and over what range, all from the sources). Do ` +
    `NOT fabricate the numbers here — the data is generated in a focused later pass. Sections ` +
    `reference charts by id.\n` +
    `- imagePrompts: vivid prompts for sections that want imagery.\n` +
    `- sections (3–8): each a stub with —\n` +
    `  • heading (UNIQUE across all sections — it is the markdown anchor, so a duplicate heading ` +
    `collides and that section loses its prose) and kind (${SECTION_KINDS.join(' | ')}).\n` +
    `  • intent: one line on the section's job.\n` +
    `  • context: how it connects to the sections around it (what it follows from, what it sets up).\n` +
    `  • expectedContent: the specific facts, figures, and quotes it must carry — concrete and ` +
    `grounded in the sources, NOT generic placeholders.\n` +
    `  • visual: the visualisation it features (see below).\n` +
    `  • optional chartId when the section features a chart.\n` +
    `  • optional regionRequirement (MAP only) when the section shades geography by a metric.\n` +
    `${visualGuidance}\n\n` +
    `THE COVER is one beat, not a summary: a sharp title plus EXACTLY ONE supporting element — ` +
    `either a single headline stat OR a one-line standfirst, never both, and never a multi-row ` +
    `table or full paragraph. Its "visual" names that ONE layer only. The cover must NOT carry the ` +
    `whole thesis or the data breakdown — give the "at a glance" / pattern summary its OWN early ` +
    `section. Keep the cover's expectedContent to the hook plus that one figure.\n` +
    `Open with this cover and end with a closing section. Ground every figure in the sources; ` +
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

// ── Chart data pass (turns a chart REQUIREMENT into numeric series) ────────
//
// Decoupled from the outline so chart data is grounded in the sources by a
// focused call rather than fabricated as a byproduct of skeleton planning. The
// model emits ONLY categories + numeric series; the id/title/chartType/axes
// come from the requirement and are merged in deterministically.

export const CHART_SYSTEM =
  `You produce the DATA for ONE chart in a Vizmaya data story, grounded strictly ` +
  `in the provided sources. Given a chart requirement (what to plot) and the ` +
  `research material, return:\n` +
  `- categories: the X-axis labels, in the order they should appear.\n` +
  `- series: one or more named series, each with one number per category (same ` +
  `order as categories).\n\n` +
  `Rules:\n` +
  `- Use ONLY figures present in or directly derivable from the sources — never ` +
  `invent or estimate numbers. If the requirement asks for data the sources don't ` +
  `support, plot the closest subset the sources DO support and keep categories/` +
  `series consistent.\n` +
  `- Every series must have exactly one value per category.\n` +
  `- Keep it tight and legible (a handful of categories; few series).`

/** Render a chart requirement for the data prompt. */
function renderChartRequirement(req: ChartRequirement): string {
  return (
    `CHART REQUIREMENT\n` +
    `id: ${req.id}\n` +
    `type: ${req.chartType}\n` +
    (req.title ? `title: ${req.title}\n` : '') +
    (req.xLabel ? `x-axis: ${req.xLabel}\n` : '') +
    (req.yLabel ? `y-axis: ${req.yLabel}\n` : '') +
    `what to plot: ${req.requirement}`
  )
}

export function buildChartPrompt(
  req: ChartRequirement,
  brief: ResearchBrief,
  sources: SourceDoc[],
  refine?: { feedback: string; previous: unknown },
): string {
  const base =
    `${renderChartRequirement(req)}\n\n` +
    `RESEARCH BRIEF\n` +
    `Summary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n\n` +
    `SOURCES\n${renderSources(sources, CHART_SOURCE_CHARS)}`
  if (refine) {
    return (
      `${base}\n\nPREVIOUS CHART DATA:\n${JSON.stringify(refine.previous)}\n\n` +
      `Revise it per this feedback (keep what works, change only what's noted):\n${refine.feedback}`
    )
  }
  return base
}

// ── Map-region data pass (turns a choropleth REQUIREMENT into per-region values)
//
// The exact mirror of the chart data pass, for the PRIMARY visual of a map
// story. Reads the sources with the larger CHART_SOURCE_CHARS budget — region
// values are numeric data (often a long table of countries), so numeric
// fidelity matters more than keeping the prompt lean.

export const REGIONS_SYSTEM =
  `You produce the DATA for ONE map choropleth in a Vizmaya map story, grounded ` +
  `strictly in the provided sources. Given a region requirement (what metric to ` +
  `shade, which regions) and the research material, return:\n` +
  `- items: one entry per region — { code, value } — where \`code\` is the ` +
  `region's ISO 3166-1 alpha-2 code (level: country) or the GeoJSON feature id ` +
  `(level: custom), and \`value\` is the metric for that region.\n\n` +
  `Rules:\n` +
  `- Use ONLY figures present in or directly derivable from the sources — never ` +
  `invent or estimate values. Include only regions the sources actually support.\n` +
  `- For level: country, \`code\` MUST be a valid ISO alpha-2 (US, IN, NO, CN, …) ` +
  `— never a country name, never alpha-3.\n` +
  `- Exactly one value per region; no duplicate codes.\n` +
  `- Shade as many regions as the sources support — a world metric can be 150+; ` +
  `do not artificially trim the set.`

/** Render a choropleth requirement for the region data prompt. */
function renderRegionRequirement(req: RegionRequirement): string {
  return (
    `CHOROPLETH REQUIREMENT\n` +
    `metric: ${req.metric}\n` +
    `level: ${req.level}\n` +
    (req.level === 'custom' && req.idProperty ? `feature id property: ${req.idProperty}\n` : '') +
    `what to shade: ${req.requirement}`
  )
}

export function buildRegionsPrompt(
  req: RegionRequirement,
  brief: ResearchBrief,
  sources: SourceDoc[],
  refine?: { feedback: string; previous: unknown },
): string {
  const base =
    `${renderRegionRequirement(req)}\n\n` +
    `RESEARCH BRIEF\n` +
    `Summary: ${brief.summary}\n` +
    `Key facts:\n${brief.keyFacts.map((f) => `- ${f}`).join('\n')}\n\n` +
    `SOURCES\n${renderSources(sources, CHART_SOURCE_CHARS)}`
  if (refine) {
    return (
      `${base}\n\nPREVIOUS CHOROPLETH DATA:\n${JSON.stringify(refine.previous)}\n\n` +
      `Revise it per this feedback (keep what works, change only what's noted):\n${refine.feedback}`
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
      ? `This is a MAP story — the MAP itself is the visual. Set body.map to the section camera ` +
        `(center [lng, lat], zoom, optional pitch/bearing, and focal pins with [lng, lat] ` +
        `coordinates). If this section shades regions, its choropleth (map.regions) is filled by a ` +
        `separate source-grounded pass and merged in for you — do NOT author region values; just ` +
        `frame the camera so the shaded geography reads well. PREFER NO foreground on a map section: ` +
        `the prose renders in the scroll rail and any chart is referenced by id. Add a foreground ` +
        `ONLY for a lone hero stat (a single bigStat). NEVER place prose/keyValue/quote panels over ` +
        `the map — they bury it and suppress the prose rail.`
      : `This is a DECK story (no map backdrop). Set body.foreground: either a FLAT layers list (no ` +
        `layout), or a layout name plus regions — each region maps to its layers. Layouts and the ` +
        `regions they define:\n${DECK_LAYOUT_MENU}`

  return (
    `You design the VISUAL for ONE already-written section of a Vizmaya ${format} data story. ` +
    `You are given the section's heading and prose; produce body — the visual content as ` +
    `structured fields (NOT YAML, NOT a string).\n\n` +
    `${formatGuidance}\n\n` +
    `Available foreground layer types:\n${LAYER_MENU}\n\n` +
    `Rules:\n` +
    `- ONE primary element per region: put a SINGLE chart, bigStat, keyValue, quote, or prose ` +
    `block in each region — never stack a stat AND a table AND prose into one region or one box. ` +
    `Match the number of elements to the layout's regions; if the prose carries more than the ` +
    `layout holds, lead with the essentials (a later section can carry the rest) or pick a layout ` +
    `with more regions. A multi-row keyValue is ONE element; do not also pile a stat and prose on it.\n` +
    `- COVER/HERO sections (see Kind) are the strict case — ONE foreground layer total: one ` +
    `bigStat, OR a one-line standfirst, OR one short quote. The full breakdown / "at a glance" ` +
    `belongs in a later section, not the opener.\n` +
    `- Place layers ONLY in regions the chosen layout defines (see the list above). A layer in a ` +
    `region the layout does not have will NOT render. Single-box / single-content layouts ` +
    `(hero-full-bleed, single-fill, centered) hold EXACTLY ONE element — if a section needs two ` +
    `(e.g. a closing line plus a recap stat), pick a two-region layout (stat-top-chart-below, ` +
    `text-left-chart-right, text-left-quote-right), never centered. Do not invent 'lead'/'body'/'stat' ` +
    `regions a layout doesn't list.\n` +
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
