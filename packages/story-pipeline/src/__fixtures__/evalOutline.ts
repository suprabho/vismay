/**
 * Outline-eval harness — generate ONE sample's outline several times and lay the
 * runs side by side, so prompt edits can be judged against real variance rather
 * than a single lucky (or unlucky) draw.
 *
 *   pnpm --filter @vismay/story-pipeline eval:outline                 # 5× on the rooftop fixture
 *   EVAL_N=8 pnpm --filter @vismay/story-pipeline eval:outline        # 8 runs
 *   EVAL_SOURCES=/path/to/dir pnpm ... eval:outline                   # any folder of sources
 *   EVAL_MODEL=text.opus pnpm ... eval:outline                        # pick the model
 *   EVAL_DEEP=cover pnpm ... eval:outline                             # render+lint run #1's cover
 *   EVAL_DEEP=all   pnpm ... eval:outline                             # render+lint EVERY section of run #1
 *   EVAL_FORMAT=map pnpm ... eval:outline                             # force deck|map (else brief decides)
 *   EVAL_LINT_DIR=.eval-out/<stamp> pnpm ... eval:outline             # offline re-lint a prior run (NO LLM)
 *   EVAL_DIRECT=1 pnpm ... eval:outline                               # bypass the gateway → Anthropic direct (own quota)
 *
 * Research runs ONCE and is cached to the run dir, so every outline draw is
 * grounded in the same brief + answers — the only thing varying is the outline
 * pass itself. Each outline is written to `.eval-out/<stamp>/outline-<i>.json`,
 * and a compact comparison prints to the console with the COVER foregrounded
 * (the section we keep overloading). Every run is also passed through the
 * layout-lint (`lintOutline` / `lintSectionBody`) — the token-free check that
 * flags covers parked on stacking layouts and body regions that won't render.
 * Needs AI_GATEWAY_API_KEY — auto-loaded from apps/admin/.env when not already
 * in the environment.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, extname, basename } from 'node:path'
import {
  ingestSources,
  research,
  generateOutline,
  generateSection,
  slugify,
  lintOutline,
  lintSectionBody,
  formatLintIssue,
  type LayoutLintIssue,
  type ResearchBrief,
  type ComposeAnswers,
  type StoryOutline,
  type SectionStub,
  type StoryFormat,
} from '../index'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

/** Read KEY=value from a dotenv file (best-effort), without overwriting a real
 *  shell value. Quotes are stripped. */
function loadEnvKey(relPath: string, key: string): void {
  if (process.env[key]) return
  try {
    const env = readFileSync(here(relPath), 'utf8')
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (m) process.env[key] = m[1]!.trim().replace(/^["']|["']$/g, '')
  } catch {
    /* fall through — the SDK throws a clear auth error if the key is truly absent */
  }
}

/** Load AI_GATEWAY_API_KEY (admin/.env) so the harness runs with no shell setup. */
function loadGatewayKey(): void {
  loadEnvKey('../../../../apps/admin/.env', 'AI_GATEWAY_API_KEY')
}

/**
 * EVAL_DIRECT=1 — bypass the AI gateway and hit Anthropic directly (its own
 * quota). Loads ANTHROPIC_API_KEY from the repo .env.local and flips the
 * pipeline's direct-mode flag. Use when the gateway quota is exhausted.
 */
function enableAnthropicDirect(): void {
  loadEnvKey('../../../../.env.local', 'ANTHROPIC_API_KEY')
  process.env.STORY_PIPELINE_ANTHROPIC_DIRECT = '1'
}

const EXT_OK = new Set(['.md', '.txt', '.csv', '.pdf', '.html', '.json'])

/** The files to ingest: a folder via EVAL_SOURCES, else the rooftop fixture. */
function sourceFiles(): Array<{ name: string; buffer: Buffer }> {
  const dir = process.env.EVAL_SOURCES
  if (dir) {
    const names = readdirSync(dir).filter((n) => EXT_OK.has(extname(n).toLowerCase()))
    if (names.length === 0) throw new Error(`EVAL_SOURCES has no ingestable files: ${dir}`)
    return names.map((name) => ({ name, buffer: readFileSync(join(dir, name)) }))
  }
  return [
    { name: 'sample.md', buffer: readFileSync(here('./sample.md')) },
    { name: 'sample.csv', buffer: readFileSync(here('./sample.csv')) },
  ]
}

/** The cover stub — the section we keep overloading; explicit kind first, else lead. */
function coverOf(outline: StoryOutline): SectionStub {
  return outline.sections.find((s) => s.kind === 'cover') ?? outline.sections[0]!
}

const trunc = (s: string | undefined, n: number): string =>
  !s ? '—' : s.length > n ? `${s.slice(0, n)}…` : s

/** The layer types in a region value (array, single layer object, or absent). */
function layerTypes(v: unknown): string {
  const arr = Array.isArray(v) ? v : v ? [v] : []
  return arr.map((l) => (l && typeof l === 'object' ? ((l as { type?: string }).type ?? '?') : '?')).join('+')
}

/** Compact "what's in each region" summary for a rendered section body. */
function layerSummary(body: Record<string, unknown>): string {
  const parts: string[] = []
  if (body.map) parts.push('map')
  const fg = body.foreground
  if (fg && typeof fg === 'object' && !Array.isArray(fg) && (fg as { regions?: unknown }).regions) {
    const layout = (fg as { layout?: string }).layout ?? 'flat'
    const regions = (fg as { regions: Record<string, unknown> }).regions
    const r = Object.entries(regions).map(([k, v]) => `${k}[${layerTypes(v)}]`).join(' ')
    parts.push(`${layout}: ${r}`)
  } else if (fg) {
    parts.push(`flat[${layerTypes(fg)}]`)
  }
  return parts.join(' · ') || '(no foreground)'
}

/** Indented lint block (or a clean tick) for a set of issues. */
function printLint(issues: LayoutLintIssue[], label: string): void {
  if (issues.length === 0) {
    console.log(`  ✓ layout-lint clean (${label})`)
    return
  }
  console.log(`  layout-lint (${label}):`)
  for (const i of issues) console.log(`    ${formatLintIssue(i)}`)
}

/** Per-run skeleton + cover line for the side-by-side console comparison. */
function printRun(i: number, outline: StoryOutline): void {
  const cover = coverOf(outline)
  const skeleton = outline.sections
    .map((s) => {
      const geo = s.geo ? ` @ ${s.geo.focus}${s.geo.zoom != null ? ` z${s.geo.zoom}` : ''}` : ''
      const choro = s.regionRequirement ? ' ▦' : ''
      return `${s.heading} (${s.kind}${geo}${choro})`
    })
    .join(' · ')
  console.log(`\n── run ${i} ──────────────────────────────────────────────`)
  console.log(`  title:    ${outline.title}`)
  console.log(`  subtitle: ${trunc(outline.subtitle, 80)}`)
  console.log(`  ${outline.sections.length} sections · ${outline.charts.length} charts`)
  console.log(`  skeleton: ${skeleton}`)
  console.log(`  COVER "${cover.heading}" [${cover.kind}] layout=${cover.layout ?? '—'}`)
  console.log(`    expected: ${trunc(cover.expectedContent, 220)}`)
  console.log(`    visual:   ${trunc(cover.visual, 220)}`)
  printLint(lintOutline(outline), 'planned layouts')
}

/**
 * Token-free mode: re-lint artifacts already on disk. Reads every `outline-*.json`
 * (planned layouts) and `cover-section.json` (rendered body) from a prior run dir
 * and prints the layout-lint — no ingest, no research, no LLM. Lets the lint run
 * even when the gateway quota is exhausted.
 */
function lintDir(dir: string): void {
  const files = readdirSync(dir)
  console.log(`— layout-lint ${dir} (offline) —`)
  let total = 0
  for (const f of files.filter((n) => /^outline-\d+\.json$/.test(n)).sort()) {
    const outline = JSON.parse(readFileSync(join(dir, f), 'utf8')) as StoryOutline
    const issues = lintOutline(outline)
    total += issues.length
    console.log(`\n  ${f} — "${outline.title}"`)
    printLint(issues, 'planned layouts')
  }
  // Rendered section bodies — `deep-NN-*.json` (EVAL_DEEP), or legacy `cover-section.json`.
  let flagged = 0
  const bodyFiles = files.filter((n) => /^deep-\d+-.*\.json$/.test(n) || n === 'cover-section.json').sort()
  for (const f of bodyFiles) {
    const section = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      heading: string
      kind?: string
      body: Record<string, unknown>
    }
    const issues = lintSectionBody(section.body, section.heading)
    total += issues.length
    if (issues.length) flagged++
    console.log(`\n  ${f} — [${section.kind ?? '?'}] "${section.heading}"`)
    printLint(issues, 'rendered body')
  }
  if (bodyFiles.length > 1) console.log(`\n  rendered bodies: ${flagged}/${bodyFiles.length} flagged`)
  console.log(`\n✓ lint complete — ${total} issue(s) across ${basename(dir)}`)
}

async function main(): Promise<void> {
  // Offline re-lint of a prior run dir — no LLM, dodges the quota wall.
  if (process.env.EVAL_LINT_DIR) {
    lintDir(process.env.EVAL_LINT_DIR)
    return
  }
  const direct = process.env.EVAL_DIRECT === '1'
  if (direct) enableAnthropicDirect()
  else loadGatewayKey()
  const N = Number(process.env.EVAL_N) || 5
  const model = process.env.EVAL_MODEL || undefined
  // Force the story format (else the brief's suggestion wins) — the screenshot
  // that prompted this was a MAP cover, so EVAL_FORMAT=map proves the fix there.
  const fmt = process.env.EVAL_FORMAT
  if (fmt && fmt !== 'deck' && fmt !== 'map') throw new Error(`EVAL_FORMAT must be deck|map, got ${fmt}`)
  const format = fmt as StoryFormat | undefined
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = here(`../../.eval-out/${stamp}`)
  mkdirSync(outDir, { recursive: true })

  console.log(`— ingest —`)
  const { sources } = await ingestSources({ files: sourceFiles() })
  console.log(`  ${sources.length} sources: ${sources.map((s) => s.title).join(', ')}`)

  console.log(`— research (once, cached for every run) —`)
  const brief: ResearchBrief = await research(sources, { model })
  // Auto-answer each question with its first option (the verify-harness convention).
  const answers: ComposeAnswers = Object.fromEntries(
    brief.questions.map((q) => [q.id, q.options?.[0] ?? 'Your editorial judgement']),
  )
  writeFileSync(join(outDir, 'brief.json'), JSON.stringify({ brief, answers }, null, 2))
  console.log(`  format=${brief.suggestedFormat} · ${brief.questions.length} questions (auto-answered)`)

  const via = direct ? 'anthropic-direct' : 'gateway'
  console.log(`\n— ${N}× outline (${model ?? 'default model'} via ${via}, format=${format ?? brief.suggestedFormat}) —`)
  const input = { sources, brief, answers }
  const settled = await Promise.allSettled(
    Array.from({ length: N }, () => generateOutline(input, { model, format })),
  )

  const outlines: StoryOutline[] = []
  settled.forEach((r, idx) => {
    const i = idx + 1
    if (r.status === 'rejected') {
      console.log(`\n── run ${i} ── FAILED: ${r.reason?.message ?? r.reason}`)
      return
    }
    outlines.push(r.value)
    writeFileSync(join(outDir, `outline-${i}.json`), JSON.stringify(r.value, null, 2))
    printRun(i, r.value)
  })

  // Variance signal across the successful runs — section counts and cover load.
  if (outlines.length > 1) {
    const counts = outlines.map((o) => o.sections.length)
    const coverLens = outlines.map((o) => (coverOf(o).expectedContent ?? '').length)
    const flagged = outlines.filter((o) => lintOutline(o).length > 0).length
    console.log(`\n── variance ─────────────────────────────────────────────`)
    console.log(`  section count:  ${counts.join(', ')}  (min ${Math.min(...counts)}, max ${Math.max(...counts)})`)
    console.log(`  cover expected-content chars: ${coverLens.join(', ')}`)
    console.log(`  layout-lint: ${flagged}/${outlines.length} runs flagged`)
  }

  // Deep-dive: render run #1's sections end to end (content → visual) and lint
  // each rendered body — the authoritative layout check. EVAL_DEEP=cover does
  // just the cover; EVAL_DEEP=all does every section (the layout discipline now
  // applies to ALL sections, not only the opener).
  const deep = process.env.EVAL_DEEP
  if ((deep === 'cover' || deep === 'all') && outlines[0]) {
    const outline = outlines[0]
    const stubs = deep === 'all' ? outline.sections : [coverOf(outline)]
    console.log(`\n— deep: ${deep === 'all' ? `all ${stubs.length} sections` : 'cover'} (content+visual) for run 1 —`)
    let flagged = 0
    for (let i = 0; i < stubs.length; i++) {
      const stub = stubs[i]!
      let section
      try {
        // eslint-disable-next-line no-await-in-loop
        section = await generateSection({ outline, stub, sources, brief, answers }, { model, format })
      } catch (e) {
        // One flaky/invalid section shouldn't abort the whole-story lint.
        flagged++
        console.log(`\n  [${stub.kind}] ${stub.heading}`)
        console.log(`    ✗ generation FAILED: ${(e as Error).message}`)
        continue
      }
      const nn = String(i + 1).padStart(2, '0')
      writeFileSync(join(outDir, `deep-${nn}-${slugify(section.heading)}.json`), JSON.stringify(section, null, 2))
      const issues = lintSectionBody(section.body, section.heading)
      if (issues.length) flagged++
      const layers = layerSummary(section.body)
      console.log(`\n  [${section.kind}] ${section.heading}  (${layers})`)
      printLint(issues, 'rendered body')
    }
    console.log(`\n  deep lint: ${flagged}/${stubs.length} section(s) flagged`)
  }

  console.log(`\n✓ ${outlines.length}/${N} outlines written to ${outDir}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
