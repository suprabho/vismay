/**
 * Refresh the OCW Desk's taxonomy (packages/randomizer/src/data/ocw.json)
 * from the MIT Learn API, the public API behind ocw.mit.edu/search.
 *
 * The randomizer's field and topic reels are MIT Learn's two-level topic
 * tree (11 fields, about 100 topics); its resource kinds are a hand-picked
 * subset of MIT Learn's course features (the ones that make a story), and
 * its lenses are the playbook's. Fields and topics are rewritten from the
 * API on every run, each topic with how many OCW files of each kind it has
 * (one aggregation call per kind), so the draw never plans a topic and
 * kind that have nothing: about a quarter of the combinations are empty,
 * and 17 topics have no files at all. Kinds and lenses are kept from the
 * file (or seeded on the first run) and only validated: every kind must
 * still be a course feature the API knows, or the run fails.
 *
 * The file is committed so the slot machine's reel strips and the draw's
 * plan never need the network; only the course and resource reels do, per
 * spin (see packages/randomizer/src/draw.ts, drawOcw).
 *
 * Usage:
 *   pnpm randomizer:ocw-taxonomy           # rewrite the file
 *   pnpm randomizer:ocw-taxonomy --check   # exit non-zero if fields or topics are stale (CI)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://api.learn.mit.edu/api/v1'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/randomizer/src/data/ocw.json')

interface ApiTopic {
  id: number
  name: string
  parent: number | null
}

interface OcwField {
  id: number
  name: string
}

interface OcwTopic {
  id: number
  field: number
  name: string
  /** OCW files of each kind under the topic, by kind name, at the last refresh. */
  files: Record<string, number>
}

interface OcwKind {
  name: string
  hands_on: boolean
  description: string
}

interface NamedOption {
  name: string
  description: string
}

interface OcwDataset {
  fields: OcwField[]
  topics: OcwTopic[]
  kinds: OcwKind[]
  lenses: NamedOption[]
}

/**
 * The resource kinds the OCW Desk draws from, with MIT Learn's exact feature
 * names: Lecture Notes alone for now. To add a kind, append it to `kinds` in
 * ocw.json (the file wins over this seed) and re-run; the draw, the pool and
 * the brief take any number, and the one-in-three hands-on quota wakes up
 * once a `hands_on: true` kind is in. Candidates that make a story, with
 * their OCW file counts in October 2026: Readings (5,545), Lecture Videos
 * (865), Problem Sets (5,855, hands-on), Exams (3,138, hands-on), Projects
 * (4,370, hands-on), Problem Set Solutions (2,398), Exam Solutions (953),
 * Laboratory Assignments (2,403). Put `{ key: 'kind', label: 'Resource
 * kind' }` back in RANDOMIZER_META.ocw.reels (types.ts) to spin it.
 */
const SEED_KINDS: OcwKind[] = [
  { name: 'Lecture Notes', hands_on: false, description: 'The notes or slides for one lecture: one idea, as the instructor laid it out.' },
]

/** What the story does with the resource (playbook lenses, OCW variant). */
const SEED_LENSES: NamedOption[] = [
  { name: 'The one idea', description: 'Explain the single idea the resource turns on, for a reader who has not taken the course, with the resource as the only source for what it says.' },
  { name: 'Work the problem', description: 'Pick one problem (or the hardest exam question) and solve it on the page, step by step, with the arithmetic shown.' },
  { name: 'Chart it', description: 'Find the quantity the resource is about and chart it from a real dataset: 8 or more points, sourced, with the resource explaining what the chart shows.' },
  { name: 'Where it came from', description: 'The history of the idea: who found it, when, what it replaced, and how the course teaches it differently from how it was discovered.' },
  { name: 'Why it matters now', description: 'Tie the idea to something dated in this month\'s news, and let the resource do the explaining.' },
  { name: 'Across the river', description: 'The same idea as another field sees it: a physics note read by an economist, a planning case read by an engineer.' },
]

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const existing: OcwDataset | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as OcwDataset) : null

  const [topics, features] = await Promise.all([
    get<{ count: number; results: ApiTopic[] }>('/topics/?limit=500'),
    get<{ count: number; results: Array<{ name: string }> }>('/course_features/?limit=500'),
  ])
  if (topics.results.length !== topics.count) throw new Error(`topics: got ${topics.results.length} of ${topics.count}`)
  if (features.results.length !== features.count) throw new Error(`course_features: got ${features.results.length} of ${features.count}`)

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  const fields: OcwField[] = topics.results
    .filter((t) => t.parent === null)
    .map((t) => ({ id: t.id, name: t.name }))
    .sort(byName)
  const fieldIds = new Set(fields.map((f) => f.id))
  const children: OcwTopic[] = topics.results
    .filter((t): t is ApiTopic & { parent: number } => t.parent !== null && fieldIds.has(t.parent))
    .map((t) => ({ id: t.id, field: t.parent, name: t.name, files: {} as Record<string, number> }))
    .sort((a, b) => a.field - b.field || a.name.localeCompare(b.name))
  const orphans = topics.results.filter((t) => t.parent !== null && !fieldIds.has(t.parent))
  if (orphans.length) throw new Error(`topics with an unknown parent: ${orphans.map((t) => t.name).join(', ')}`)
  for (const f of fields) {
    if (!children.some((t) => t.field === f.id)) throw new Error(`field without topics: ${f.name}`)
  }

  const kinds = existing?.kinds ?? SEED_KINDS
  const lenses = existing?.lenses ?? SEED_LENSES
  const known = new Set(features.results.map((f) => f.name))
  for (const k of kinds) {
    if (!known.has(k.name)) throw new Error(`kind "${k.name}" is not a course feature the API knows`)
  }

  // How many OCW files of each kind each topic has: one aggregation per kind.
  const counts = new Map<string, Map<string, number>>()
  for (const k of kinds) {
    const agg = await get<{ metadata?: { aggregations?: { topic?: Array<{ key: string; doc_count: number }> } } }>(
      `/content_file_search/?platform=ocw&limit=0&aggregations=topic&content_feature_type=${encodeURIComponent(k.name)}`,
    )
    const buckets = agg.metadata?.aggregations?.topic
    if (!buckets) throw new Error(`no topic aggregation for ${k.name}`)
    counts.set(k.name, new Map(buckets.map((b) => [b.key, b.doc_count])))
  }
  for (const t of children) {
    t.files = Object.fromEntries(kinds.map((k) => [k.name, counts.get(k.name)!.get(t.name) ?? 0]))
  }
  const empty = children.filter((t) => Object.values(t.files).every((n) => n === 0))

  const next: OcwDataset = { fields, topics: children, kinds, lenses }
  const text = `${JSON.stringify(next, null, 2)}\n`
  const same = (a: OcwTopic[], b: OcwTopic[]) => JSON.stringify(a.map((t) => [t.id, t.field, t.name])) === JSON.stringify(b.map((t) => [t.id, t.field, t.name]))
  // Counts drift daily and are not what --check is for; the tree is.
  const stale = !existing || JSON.stringify(existing.fields) !== JSON.stringify(fields) || !same(existing.topics, children)

  if (check) {
    if (stale) {
      console.error(`${OUT} is stale: run pnpm randomizer:ocw-taxonomy`)
      process.exit(1)
    }
    console.log(`ocw.json is current: ${fields.length} fields, ${children.length} topics (${empty.length} with no files), ${kinds.length} kinds, ${lenses.length} lenses`)
    return
  }
  writeFileSync(OUT, text)
  console.log(
    `wrote ${join('packages/randomizer/src/data', 'ocw.json')}: ${fields.length} fields, ${children.length} topics (${empty.length} with no files of any kind), ${kinds.length} kinds, ${lenses.length} lenses${stale ? '' : ' (tree unchanged)'}`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
