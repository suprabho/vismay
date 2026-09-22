/**
 * AI Data Centers daily snapshot — the edition composer.
 *
 * Replaces the markdown recap worker (generate-news-recap.ts). Once a day it
 * takes the window's relevant dc_news stories (with their snapshot tags and
 * extracted facts), the kept arXiv papers, the tracked stocks' latest moves
 * and any data-centre stories from iea_news, and writes ONE structured draft
 * row into dc_editions — the row the public page renders.
 *
 * Hybrid, like the recap worker before it: Gemini writes the prose layer
 * (headline, deck, six key notes, per-layer headline / sub / notes, research
 * headline / sub) in JSON mode. Everything numeric — mood score and counts,
 * geo pins and region bars, the four per-layer visualisations, the energy
 * figures and composition, the field baselines, the tape — is assembled
 * deterministically from the tagged rows (packages/content-source/src/
 * dcEditionAssembly.ts), never by the model, and every note's lead number is
 * checked against the stories it cites. On any model failure the composer
 * falls back to a deterministic edition (headline from the top theme's lead
 * story, notes from the largest stated figures) and marks
 * model = 'deterministic', so the cron never goes dark.
 *
 * Editor edits on an existing draft survive a recompose unless
 * --clear-edits is passed; every run is appended to composer_runs so the
 * admin can diff the current text against the previous run.
 *
 * Run locally:  pnpm ai-data-centers:compose-edition
 *               pnpm ai-data-centers:compose-edition -- --date 2026-09-22
 *               pnpm ai-data-centers:compose-edition -- --dry-run --out edition.json
 *               pnpm ai-data-centers:compose-edition -- --clear-edits
 * Run in CI:    .github/workflows/compose-dc-edition.yml (08:15 UTC daily)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read dc_news / dc_papers /
 *     dc_places / dc_stocks / dc_stock_prices / iea_news, write dc_editions
 *   GEMINI_API_KEY — optional; enables the prose layer
 *   GEMINI_MODEL   — optional override (default gemini-2.5-flash)
 *   ADMIN_SESSION_SECRET — optional; signs the revalidate ping when a stale
 *     draft gets published on the way in
 */

import { writeFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  assembleEditionNumbers,
  listDcNewsTagged,
  listDcPapersInWindow,
  listDcPlaces,
  listIeaNewsForEditionWindow,
  publishStaleDrafts,
  upsertDraftEdition,
} from '@vismay/content-source/dcEditions'
import {
  DC_LAYERS,
  DC_LAYER_KEYS,
  DC_PAPER_AREAS,
  DC_REGIONS,
  DC_THEMES,
  editionDateFor,
  editionWindow,
  type DcEditionStory,
  type DcPaper,
  type DcPlace,
  type EditionLayerNote,
  type EditionNote,
  type EditionText,
} from '@vismay/content-source/dcEditionTypes'
import {
  deterministicText,
  groundNoteMetric,
  paperGainText,
  sourcesFromIdxs,
} from '@vismay/content-source/dcEditionAssembly'
import { pingEditionRevalidate } from './revalidate'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
/** Ceiling on stories handed to the model — a busy day lands well under it. */
const MAX_STORIES = 150
/** Papers per edition: the gate's top scorers, newest first among ties. */
const MAX_PAPERS = 8
const NOTE_COUNT = 6
const LAYER_NOTE_COUNT = 3

interface Args {
  date: string
  dryRun: boolean
  clearEdits: boolean
  out: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { date: editionDateFor(new Date()), dryRun: false, clearEdits: false, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    if (a === '--date') {
      const d = argv[++i]
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) throw new Error(`Invalid --date value: ${d}`)
      args.date = d
    } else if (a === '--dry-run') args.dryRun = true
    else if (a === '--clear-edits') args.clearEdits = true
    else if (a === '--out') args.out = argv[++i] ?? 'edition.json'
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

// ---------------------------------------------------------------------------
// Gemini prose layer

const COMPOSER_SYSTEM = `You are the editor of "AI Data Centers Daily", a frozen morning edition for operators, investors, analysts and policy people who need to know what happened in AI infrastructure yesterday, from every angle, with every claim traceable to a source.

You receive the window's stories (each with an idx, outlet, layer, place, theme, mood, energy flag, tickers and the FACTS the story states), the kept research papers, the tracked stocks' moves and a few numbers the page already computes. You write the prose layer only; the page computes every chart and count itself.

Write in a plain, specific, newsroom register: no hype, no opinion, no adjectives that are not in the reporting. British or American spelling is fine; be consistent. Never invent facts, numbers, quotes, names or events. Every number you write must appear in the stories you cite for that sentence.

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{
  "headline": "The 24-hour headline: one sentence, ≤ 18 words, naming the day's biggest development and, if there is one, the tension beneath it.",
  "sub": "The deck: 2–3 sentences that carry the secondary threads. Mark one clause to emphasise with *asterisks*.",
  "notes": [
    {
      "metric": "the number that matters, as text ('4.6', '2027', 'High-NA'); null when the note has no lead figure",
      "unit": "'GW', 'MW', '%', null …",
      "label": "3–8 words under the number ('power committed in three deals')",
      "text": "2–3 sentences. Start with the takeaway in bold-worthy plain words, then the specifics with outlets' facts.",
      "sourceIdxs": [0, 5],
      "energy": false
    }
  ],
  "layers": {
    "dc":    { "headline": "≤ 14 words on what moved in data-center sites and capacity", "sub": "1–2 sentences", "notes": [ { "text": "one sentence, specific", "sourceIdxs": [2] } ] },
    "hyper": { "headline": "…", "sub": "…", "notes": [ … ] },
    "semi":  { "headline": "…", "sub": "…", "notes": [ … ] },
    "equip": { "headline": "…", "sub": "…", "notes": [ … ] }
  },
  "research": {
    "headline": "≤ 16 words on the day in AI research, on its own terms",
    "sub": "2–3 sentences: the largest gains, what was released or closed, the audit or benchmark story if there is one."
  }
}

Rules:
- Exactly 6 notes, most important first. Each cites 1–3 story idx values from the input and is led by a number one of those stories states — or has metric null. The sixth note is the sustainability / energy note when the window has one (energy: true).
- Each layer: exactly 3 notes when the layer has 3 or more stories, fewer when it has fewer, none when it has none (then headline: "No <layer> stories in this window", sub: ""). Layer notes cite only stories tagged with that layer.
- sourceIdxs must be idx values from the input, nothing else.
- Use the FACTS fields (figures, horizon, action) as the numbers; do not compute new ones.
- research: write from the papers list only; if it is empty say so plainly.`

interface ModelNote {
  metric?: unknown
  unit?: unknown
  label?: unknown
  text?: unknown
  sourceIdxs?: unknown
  energy?: unknown
}

interface ModelLayer {
  headline?: unknown
  sub?: unknown
  notes?: unknown
}

interface ModelOutput {
  headline?: unknown
  sub?: unknown
  notes?: unknown
  layers?: Record<string, ModelLayer>
  research?: { headline?: unknown; sub?: unknown }
}

function buildComposerInput(input: {
  editionDate: string
  windowLabel: string
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  papers: DcPaper[]
  places: Map<string, DcPlace>
  numbers: Awaited<ReturnType<typeof assembleEditionNumbers>>
}): unknown {
  const { stories, ieaStories, papers, places, numbers } = input
  return {
    edition: input.editionDate,
    window: input.windowLabel,
    computed: {
      moodScore: numbers.moodScore,
      moodCounts: numbers.moodCounts,
      storiesByLayer: numbers.layerCounts,
      topPlaces: numbers.geo.places.slice(0, 6).map((p) => `${p.name} (${p.count})`),
      powerCommittedGw: numbers.energy.hero?.value ?? 0,
      energyStories: numbers.energy.storyCount,
      largestMoves: numbers.tape.slice(0, 4).concat(numbers.tape.slice(-3)).map((t) => `${t.ticker} ${t.changePct > 0 ? '+' : ''}${t.changePct}%`),
    },
    stories: stories.map((s, idx) => ({
      idx,
      headline: s.title,
      summary: s.summary?.slice(0, 400) ?? null,
      outlet: s.source,
      publishedAt: s.publishedAt,
      layer: s.layer ? DC_LAYERS[s.layer].name : null,
      layerKey: s.layer,
      place: s.place ? (places.get(s.place)?.name ?? s.place) : null,
      region: s.region ? DC_REGIONS[s.region] : null,
      theme: s.theme ? DC_THEMES[s.theme].name : null,
      mood: s.mood === 1 ? 'boom' : s.mood === -1 ? 'doom' : 'neutral',
      energy: s.energy,
      tickers: s.tickers,
      facts: s.facts,
    })),
    ieaStories: ieaStories.map((s) => ({ headline: s.title, summary: s.summary?.slice(0, 300) ?? null, publishedAt: s.publishedAt })),
    papers: papers.map((p, idx) => ({
      idx,
      arxivId: p.arxivId,
      title: p.title,
      area: p.area ? DC_PAPER_AREAS[p.area] : null,
      affiliations: p.affiliations,
      kind: p.kind,
      result: p.bench ? `${paperGainText(p)} on ${p.bench}` : null,
      scale: p.scale,
      released: p.weightsReleased ? 'weights + code' : p.codeReleased ? 'code only' : 'nothing yet',
      why: p.why,
    })),
  }
}

function parseModelJson(raw: string): ModelOutput | null {
  let text = raw.trim()
  // JSON mode usually returns clean JSON, but occasionally wraps it in
  // ```json fences (same tolerance as the recap worker).
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as ModelOutput) : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * Turn the model's JSON into a valid EditionText: resolve sourceIdxs to real
 * sources, ground every note's metric in its cited stories, enforce the
 * counts, and pad anything missing from the deterministic edition.
 */
function validateModelText(out: ModelOutput, stories: DcEditionStory[], fallback: EditionText): EditionText | null {
  const headline = str(out.headline, 220)
  const sub = str(out.sub, 700)
  if (!headline || !sub) return null

  const notes: EditionNote[] = []
  for (const raw of Array.isArray(out.notes) ? (out.notes as ModelNote[]) : []) {
    if (!raw || typeof raw !== 'object') continue
    const text = str(raw.text, 900)
    const sources = sourcesFromIdxs(raw.sourceIdxs, stories)
    if (!text || sources.length === 0) continue
    const cited = stories.filter((s) => sources.some((src) => src.url === s.url))
    const draft: EditionNote = {
      metric: typeof raw.metric === 'string' ? str(raw.metric, 24) || null : null,
      unit: typeof raw.unit === 'string' ? str(raw.unit, 16) || null : null,
      label: str(raw.label, 140) || (cited[0]?.theme ? DC_THEMES[cited[0].theme].name : 'as stated'),
      text,
      sources,
      energy: raw.energy === true || cited.every((s) => s.energy),
    }
    const grounded = groundNoteMetric(draft, cited)
    notes.push({ ...draft, metric: grounded.metric, unit: grounded.metric ? grounded.unit : null })
    if (notes.length === NOTE_COUNT) break
  }
  // Pad from the deterministic notes, skipping sources already used.
  for (const n of fallback.notes) {
    if (notes.length >= NOTE_COUNT) break
    if (notes.some((x) => x.sources[0]?.url === n.sources[0]?.url)) continue
    notes.push(n)
  }

  const layers = {} as EditionText['layers']
  for (const k of DC_LAYER_KEYS) {
    const raw = out.layers?.[k]
    const inLayer = stories.filter((s) => s.layer === k)
    const layerNotes: EditionLayerNote[] = []
    for (const rn of Array.isArray(raw?.notes) ? (raw!.notes as ModelNote[]) : []) {
      if (!rn || typeof rn !== 'object') continue
      const text = str(rn.text, 700)
      // Layer notes cite only stories in that layer.
      const sources = sourcesFromIdxs(rn.sourceIdxs, stories).filter((src) => inLayer.some((s) => s.url === src.url))
      if (!text || sources.length === 0) continue
      layerNotes.push({ text, sources })
      if (layerNotes.length === LAYER_NOTE_COUNT) break
    }
    for (const n of fallback.layers[k].notes) {
      if (layerNotes.length >= Math.min(LAYER_NOTE_COUNT, inLayer.length)) break
      if (layerNotes.some((x) => x.sources[0]?.url === n.sources[0]?.url)) continue
      layerNotes.push(n)
    }
    layers[k] = {
      headline: str(raw?.headline, 220) || fallback.layers[k].headline,
      sub: str(raw?.sub, 700) || fallback.layers[k].sub,
      notes: layerNotes,
    }
  }

  return {
    headline,
    sub,
    notes,
    layers,
    research: {
      headline: str(out.research?.headline, 220) || fallback.research.headline,
      sub: str(out.research?.sub, 700) || fallback.research.sub,
    },
  }
}

async function generateText(input: unknown, stories: DcEditionStory[], fallback: EditionText): Promise<EditionText | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[compose] GEMINI_API_KEY not set — deterministic edition')
    return null
  }
  const genai = new GoogleGenAI({ apiKey })
  try {
    const res = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${COMPOSER_SYSTEM}\n\nWrite the edition for this window:\n${JSON.stringify(input, null, 1)}` }],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.35 },
    })
    const parsed = parseModelJson(res.text ?? '')
    if (!parsed) {
      console.warn('[compose] model output was not JSON — deterministic edition')
      return null
    }
    const text = validateModelText(parsed, stories, fallback)
    if (!text) console.warn('[compose] model output missing headline/sub — deterministic edition')
    return text
  } catch (err) {
    console.warn(`[compose] prose generation failed (${err instanceof Error ? err.message : String(err)}) — deterministic edition`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main

/** Papers already carried by recent editions, so a paper appears once. */
async function recentlyUsedPaperIds(beforeDate: string): Promise<Set<string>> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select('paper_ids')
    .lt('edition_date', beforeDate)
    .order('edition_date', { ascending: false })
    .limit(3)
  if (error) throw new Error(`recentlyUsedPaperIds: ${error.message}`)
  const used = new Set<string>()
  for (const r of (data ?? []) as { paper_ids: string[] | null }[]) for (const id of r.paper_ids ?? []) used.add(id)
  return used
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { start, end } = editionWindow(args.date)
  const windowLabel = `${start.toISOString().slice(0, 16).replace('T', ' ')} → ${end.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  console.log(`[compose] edition ${args.date} · window ${windowLabel}${args.dryRun ? ' (dry)' : ''}`)

  if (!args.dryRun) {
    // One draft at a time: a draft that never got its 09:00 publish (a job
    // failure, an endless hold) goes public now — its review window is over.
    for (const stale of await publishStaleDrafts(args.date)) {
      console.log(`[compose] published stale draft ${stale.date} as edition ${stale.number}`)
      await pingEditionRevalidate(stale.date)
    }
  }

  const [stories, ieaStories, places, used] = await Promise.all([
    listDcNewsTagged({ start: start.toISOString(), end: end.toISOString(), limit: MAX_STORIES }),
    listIeaNewsForEditionWindow({ start: start.toISOString(), end: end.toISOString() }).catch((err) => {
      console.warn(`[compose] iea_news unavailable (${err instanceof Error ? err.message : err})`)
      return [] as DcEditionStory[]
    }),
    listDcPlaces(),
    recentlyUsedPaperIds(args.date),
  ])
  const untagged = stories.filter((s) => !s.layer).length
  console.log(`[compose] ${stories.length} relevant stories (${untagged} untagged) · ${ieaStories.length} iea_news items`)
  if (untagged > 0) console.warn('[compose] untagged rows in the window — run the scraper with --backfill-days to tag them')

  // arXiv announces a day after submission; look back a little further than
  // the news window and let the recent-editions filter dedupe.
  const paperStart = new Date(start.getTime() - 12 * 3_600_000).toISOString()
  const papers = (await listDcPapersInWindow({ start: paperStart, end: end.toISOString(), limit: 40 }).catch((err) => {
    console.warn(`[compose] dc_papers unavailable (${err instanceof Error ? err.message : err}) — empty research chapter`)
    return [] as DcPaper[]
  }))
    .filter((p) => !used.has(p.arxivId))
    .slice(0, MAX_PAPERS)
  console.log(`[compose] ${papers.length} papers`)

  const numbers = await assembleEditionNumbers({ editionDate: args.date, stories, ieaStories, papers })
  const placeMap = new Map(places.map((p) => [p.slug, p]))
  const fallback = deterministicText({ stories, papers, places: placeMap })

  const modelInput = buildComposerInput({ editionDate: args.date, windowLabel, stories, ieaStories, papers, places: placeMap, numbers })
  const modelText = stories.length > 0 ? await generateText(modelInput, stories, fallback) : null
  const text = modelText ?? fallback
  const model = modelText ? GEMINI_MODEL : 'deterministic'
  const classifierVersion = stories.find((s) => s.layer)?.facts ? 'v2-snapshot-2026-09' : null

  const payload = {
    editionDate: args.date,
    text,
    numbers,
    storyIds: stories.map((s) => s.id),
    paperIds: papers.map((p) => p.arxivId),
    ieaIds: ieaStories.map((s) => s.id),
    model,
    classifierVersion,
    generatedAt: new Date().toISOString(),
    clearEdits: args.clearEdits,
  }

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`[compose] wrote ${args.out}`)
  }
  if (args.dryRun) {
    console.log('\n----- edition (dry run, not written) -----')
    console.log(`headline: ${text.headline}\nsub: ${text.sub}\n`)
    text.notes.forEach((n, i) => console.log(`note ${i + 1}: [${n.metric ?? '—'}${n.unit ? ` ${n.unit}` : ''}] ${n.label} — ${n.text} (${n.sources.map((s) => s.name).join(', ')})`))
    for (const k of DC_LAYER_KEYS) console.log(`\n${DC_LAYERS[k].name}: ${text.layers[k].headline} — ${text.layers[k].sub} [${numbers.layerCounts[k]} stories, viz=${numbers.layerViz[k]?.kind ?? 'none'}]`)
    console.log(`\nresearch: ${text.research.headline} — ${text.research.sub}`)
    console.log(`\nmood ${numbers.moodScore} ${JSON.stringify(numbers.moodCounts)} · places ${numbers.geo.places.length} · power ${numbers.energy.hero?.value ?? 0} GW · tape ${numbers.tape.length}`)
    return
  }

  const draft = await upsertDraftEdition(payload)
  const { layerCounts } = numbers
  console.log(
    `[compose] draft ${draft.date} written · model=${model} · ${draft.counts.stories} stories (dc ${layerCounts.dc} · hyper ${layerCounts.hyper} · semi ${layerCounts.semi} · equip ${layerCounts.equip}) · ${draft.counts.papers} papers · mood ${draft.moodScore ?? '—'} · auto-publish ${draft.autoPublishAt}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
