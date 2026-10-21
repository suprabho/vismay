/**
 * Refresh the Landmark Desk's taxonomy (packages/randomizer/src/data/landmark.json):
 * the fields, the prizes in each, the eras, and how many awards every prize
 * made in every era, counted from the two award sources the desk reads live.
 *
 * The randomizer's prize list is hand-picked here (docs/landmark-randomizer-plan.md
 * section 2): the four Nobel science prizes and the prizes that stand in for
 * a Nobel in mathematics, computer science, the humanities, history, the
 * social sciences and the cross-field science prizes. Each prize names its
 * award source: the Nobel Prize API (api.nobelprize.org, CC0, no key) for
 * the Nobels, Wikidata (P166 "award received" on the laureate, with P585
 * for the year) for the rest. Each run re-counts the awards per era (one
 * call per Nobel category, one SPARQL query for every Wikidata prize), so
 * the draw never plans a prize and era that have no laureates, and records
 * how many awards name the work in the citation (P1686 "for work"), which
 * the plan does not need but the desk's docs quote.
 *
 * The file is committed so the slot machine's reel strips and the draw's
 * plan never need the network; only the laureate and work reels do, per
 * spin (packages/randomizer/src/landmarkPool.ts).
 *
 * Usage:
 *   pnpm randomizer:landmark-taxonomy           # rewrite the file
 *   pnpm randomizer:landmark-taxonomy --check   # exit non-zero if the prize list in the file differs (CI)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NOBEL_API = 'https://api.nobelprize.org/2.1'
const SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'vismay-randomizer/0.1 (https://vizmaya.fyi; landmark taxonomy script)'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/randomizer/src/data/landmark.json')

type WorkLevel = 'paper' | 'book' | 'result' | 'body'

interface LandmarkField {
  id: string
  name: string
}

interface LandmarkEra {
  id: string
  name: string
  from: number
  to: number
}

interface LandmarkPrize {
  id: string
  field: string
  name: string
  /** The body that awards it, for the credit line. */
  awarder: string
  /** Where the award list comes from: the Nobel Prize API (with its category code) or Wikidata (with the prize item). */
  source: { kind: 'nobel'; category: string; slug: string; item: string } | { kind: 'wikidata'; item: string }
  /** The official list of laureates, to link. */
  url: string
  /** First year awarded. */
  since: number
  /**
   * What the citation names: a paper, a book, a specific result or
   * discovery, or a body of work. The draw's quota keeps work-level prizes
   * (`work_level`) coming: those whose citation or an official document
   * names the work (the Nobels through their scientific background
   * documents, the Gödel Prize, the book prizes).
   */
  works: WorkLevel
  work_level: boolean
  /** One line on what the citation looks like, for the brief. */
  note: string
  /** Awards per era (by LandmarkEra.id) at the last refresh; the plan never asks for an empty one. */
  awards: Record<string, number>
  /** Awards whose statement names the work (P1686), and awards with no date, at the last refresh. */
  named_works: number
  undated: number
}

interface NamedOption {
  name: string
  description: string
}

interface LandmarkDataset {
  fields: LandmarkField[]
  eras: LandmarkEra[]
  prizes: LandmarkPrize[]
  lenses: NamedOption[]
}

const FIELDS: LandmarkField[] = [
  { id: 'physics', name: 'Physics & astronomy' },
  { id: 'chemistry', name: 'Chemistry' },
  { id: 'medicine', name: 'Medicine & life sciences' },
  { id: 'economics', name: 'Economics' },
  { id: 'mathematics', name: 'Mathematics' },
  { id: 'computing', name: 'Computer science' },
  { id: 'humanities', name: 'Humanities & philosophy' },
  { id: 'history', name: 'History' },
  { id: 'social', name: 'Social sciences' },
  { id: 'cross', name: 'Science & technology, cross-field' },
]

const ERAS: LandmarkEra[] = [
  { id: 'founding', name: '1901 to 1945', from: 1901, to: 1945 },
  { id: 'postwar', name: '1946 to 1969', from: 1946, to: 1969 },
  { id: 'late-century', name: '1970 to 1989', from: 1970, to: 1989 },
  { id: 'turn', name: '1990 to 2009', from: 1990, to: 2009 },
  { id: 'recent', name: '2010 onward', from: 2010, to: 2100 },
]

type PrizeSeed = Omit<LandmarkPrize, 'awards' | 'named_works' | 'undated'>

const nobel = (id: string, field: string, name: string, category: string, slug: string, item: string, since: number, note: string): PrizeSeed => ({
  id,
  field,
  name,
  awarder: 'Nobel Prize Outreach AB',
  source: { kind: 'nobel', category, slug, item },
  url: `https://www.nobelprize.org/prizes/lists/all-nobel-prizes-in-${slug}/`,
  since,
  works: 'result',
  work_level: true,
  note,
})

const wd = (id: string, field: string, name: string, item: string, awarder: string, url: string, since: number, works: WorkLevel, note: string, workLevel = works === 'paper' || works === 'book'): PrizeSeed => ({
  id,
  field,
  name,
  awarder,
  source: { kind: 'wikidata', item },
  url,
  since,
  works,
  work_level: workLevel,
  note,
})

/** The prizes, with the Wikidata items checked on 2026-10-21 (a label query against query.wikidata.org). */
const PRIZES: PrizeSeed[] = [
  nobel('nobel-physics', 'physics', 'Nobel Prize in Physics', 'phy', 'physics', 'Q38104', 1901, 'The motivation names a discovery; the scientific background document on nobelprize.org cites the papers.'),
  wd('wolf-physics', 'physics', 'Wolf Prize in Physics', 'Q845333', 'Wolf Foundation', 'https://wolffund.org.il/category/the-wolf-prize-winners/', 1978, 'body', 'A body of work ("for foundational work on…").'),
  wd('breakthrough-physics', 'physics', 'Breakthrough Prize in Fundamental Physics', 'Q1314470', 'Breakthrough Prize Foundation', 'https://breakthroughprize.org/Laureates', 2012, 'result', 'An achievement, sometimes a named discovery or experiment.'),
  wd('kavli-astrophysics', 'physics', 'Kavli Prize in Astrophysics', 'Q18889778', 'Norwegian Academy of Science and Letters', 'https://www.kavliprize.org/prizes', 2008, 'result', 'A discovery ("for discoveries of exoplanets…").'),
  wd('shaw-astronomy', 'physics', 'Shaw Prize in Astronomy', 'Q57232945', 'Shaw Prize Foundation', 'https://www.shawprize.org/laureates/', 2004, 'result', 'A discovery or a line of observation.'),

  nobel('nobel-chemistry', 'chemistry', 'Nobel Prize in Chemistry', 'che', 'chemistry', 'Q44585', 1901, 'The motivation names a discovery or method; the scientific background document cites the papers.'),
  wd('wolf-chemistry', 'chemistry', 'Wolf Prize in Chemistry', 'Q968876', 'Wolf Foundation', 'https://wolffund.org.il/category/the-wolf-prize-winners/', 1978, 'body', 'A body of work.'),

  nobel('nobel-medicine', 'medicine', 'Nobel Prize in Physiology or Medicine', 'med', 'medicine', 'Q80061', 1901, 'The motivation names a discovery; the scientific background document cites the papers.'),
  wd('lasker-basic', 'medicine', 'Lasker Award for Basic Medical Research', 'Q999734', 'Lasker Foundation', 'https://laskerfoundation.org/awards/', 1946, 'result', 'A discovery; the Lasker essay carries a reference list.'),
  wd('lasker-clinical', 'medicine', 'Lasker-DeBakey Clinical Medical Research Award', 'Q136696', 'Lasker Foundation', 'https://laskerfoundation.org/awards/', 1946, 'result', 'A clinical advance; the Lasker essay carries a reference list.'),
  wd('wolf-medicine', 'medicine', 'Wolf Prize in Medicine', 'Q540561', 'Wolf Foundation', 'https://wolffund.org.il/category/the-wolf-prize-winners/', 1978, 'body', 'A body of work.'),
  wd('kavli-neuroscience', 'medicine', 'Kavli Prize in Neuroscience', 'Q18889781', 'Norwegian Academy of Science and Letters', 'https://www.kavliprize.org/prizes', 2008, 'result', 'A discovery.'),
  wd('shaw-life-science', 'medicine', 'Shaw Prize in Life Science and Medicine', 'Q57202753', 'Shaw Prize Foundation', 'https://www.shawprize.org/laureates/', 2004, 'result', 'A discovery.'),
  wd('breakthrough-life-sciences', 'medicine', 'Breakthrough Prize in Life Sciences', 'Q5019489', 'Breakthrough Prize Foundation', 'https://breakthroughprize.org/Laureates', 2013, 'result', 'An achievement, often a named discovery.'),

  nobel('nobel-economics', 'economics', 'Prize in Economic Sciences in Memory of Alfred Nobel', 'eco', 'economic-sciences', 'Q47170', 1969, 'The motivation names a contribution; the scientific background document cites the papers.'),
  wd('clark-medal', 'economics', 'John Bates Clark Medal', 'Q839677', 'American Economic Association', 'https://www.aeaweb.org/about-aea/honors-awards/bates-clark', 1947, 'body', 'A body of work by an economist under forty.'),

  wd('abel', 'mathematics', 'Abel Prize', 'Q188184', 'Norwegian Academy of Science and Letters', 'https://abelprize.no/winners', 2003, 'result', 'An area or a named result ("for their discovery and proof of the index theorem").'),
  wd('fields', 'mathematics', 'Fields Medal', 'Q28835', 'International Mathematical Union', 'https://www.mathunion.org/imu-awards/fields-medal', 1936, 'result', 'A specific result or proof, in the IMU citation.'),
  wd('wolf-mathematics', 'mathematics', 'Wolf Prize in Mathematics', 'Q915604', 'Wolf Foundation', 'https://wolffund.org.il/category/the-wolf-prize-winners/', 1978, 'body', 'A body of work.'),
  wd('breakthrough-mathematics', 'mathematics', 'Breakthrough Prize in Mathematics', 'Q17278380', 'Breakthrough Prize Foundation', 'https://breakthroughprize.org/Laureates', 2015, 'result', 'Sometimes a named discovery.'),
  wd('schock-mathematics', 'mathematics', 'Rolf Schock Prize in Mathematics', 'Q23070438', 'Royal Swedish Academy of Sciences', 'https://www.kva.se/en/prizes/rolf-schock-prizes/', 1993, 'result', 'A specific breakthrough ("concerning the possibility of an infinite number of twin primes").'),
  wd('shaw-mathematics', 'mathematics', 'Shaw Prize in Mathematical Sciences', 'Q57232963', 'Shaw Prize Foundation', 'https://www.shawprize.org/laureates/', 2004, 'result', 'A named contribution.'),

  wd('godel', 'computing', 'Gödel Prize', 'Q1417143', 'EATCS and ACM SIGACT', 'https://www.sigact.org/prizes/g%C3%B6del.html', 1993, 'paper', 'Awarded for outstanding papers: the citation gives the full bibliographic reference.'),
  wd('knuth', 'computing', 'Knuth Prize', 'Q1165991', 'ACM SIGACT and IEEE TCMF', 'https://www.sigact.org/prizes/knuth.html', 1996, 'result', 'A long citation that discusses individual papers.'),
  wd('turing', 'computing', 'ACM Turing Award', 'Q185667', 'Association for Computing Machinery', 'https://amturing.acm.org/', 1966, 'result', 'A contribution, sometimes a named system or algorithm.'),

  wd('holberg', 'humanities', 'Holberg Prize', 'Q1624297', 'Holberg Board, Norway', 'https://holbergprize.org/prizes-and-laureates/holbergprize/holberg-prize-laureates/', 2004, 'body', 'Lifetime contributions; press releases sometimes name major works.'),
  wd('kluge', 'humanities', 'Kluge Prize', 'Q1776592', 'Library of Congress', 'https://www.loc.gov/programs/john-w-kluge-center/kluge-prize/', 2003, 'body', 'Lifetime achievement in the humanities and social sciences.'),
  wd('balzan', 'humanities', 'Balzan Prize', 'Q628457', 'International Balzan Prize Foundation', 'https://www.balzan.org/en/prizewinners', 1961, 'body', 'The subject changes each year; motivations are in press-release PDFs.'),
  wd('berggruen', 'humanities', 'Berggruen Prize for Philosophy and Culture', 'Q25324637', 'Berggruen Institute', 'https://berggruen.org/prize', 2016, 'body', 'A body of work; press releases list the key books.'),
  wd('kyoto-arts-philosophy', 'humanities', 'Kyoto Prize in Arts and Philosophy', 'Q6452192', 'Inamori Foundation', 'https://www.kyotoprize.org/en/laureates/', 1985, 'body', 'A one-line summary per laureate.'),
  wd('schock-philosophy', 'humanities', 'Rolf Schock Prize in Logic and Philosophy', 'Q23070437', 'Royal Swedish Academy of Sciences', 'https://www.kva.se/en/prizes/rolf-schock-prizes/', 1993, 'result', 'A named contribution ("concerning personal identity…").'),
  wd('erasmus', 'humanities', 'Erasmus Prize', 'Q974780', 'Praemium Erasmianum Foundation', 'https://erasmusprijs.org/en/laureates/', 1958, 'body', 'An annual theme.'),

  wd('wolfson', 'history', 'Wolfson History Prize', 'Q4020686', 'Wolfson Foundation', 'https://www.wolfsonhistoryprize.org.uk/past-winners/all-winners/', 1972, 'book', 'Every year lists the winning titles and publishers.'),
  wd('pulitzer-history', 'history', 'Pulitzer Prize for History', 'Q599254', 'Columbia University', 'https://www.pulitzer.org/prize-winners-by-category/219', 1917, 'book', 'One-line citation per book.'),
  wd('bancroft', 'history', 'Bancroft Prize', 'Q724144', 'Columbia University Libraries', 'https://library.columbia.edu/about/awards/bancroft/previous_awards.html', 1948, 'book', 'Title, author, publisher and year on the list.'),

  wd('skytte', 'social', 'Johan Skytte Prize in Political Science', 'Q738091', 'Johan Skytte Foundation, Uppsala', 'https://skytteprize.com/prize-winners/', 1995, 'body', 'A one-sentence motivation.'),
  // The Stockholm Prize in Criminology (Q2350723) is left out: Wikidata dates one of its nine awards, so there is nothing to draw an era from.

  wd('crafoord', 'cross', 'Crafoord Prize', 'Q583069', 'Royal Swedish Academy of Sciences', 'https://www.crafoordprize.se/laureates/', 1982, 'result', 'An achievement, in astronomy and mathematics, geosciences, biosciences or polyarthritis by turns.'),
  wd('japan-prize', 'cross', 'Japan Prize', 'Q908745', 'Japan Prize Foundation', 'https://www.japanprize.jp/en/prize_past.html', 1985, 'result', 'An achievement in a field that changes each year.'),
  wd('tyler', 'cross', 'Tyler Prize for Environmental Achievement', 'Q1892257', 'University of Southern California', 'https://tylerprize.org/laureates/', 1974, 'body', 'A body of environmental science or policy work.'),
  wd('kyoto-basic-sciences', 'cross', 'Kyoto Prize in Basic Sciences', 'Q18344281', 'Inamori Foundation', 'https://www.kyotoprize.org/en/laureates/', 1985, 'body', 'A one-line summary per laureate.'),
  wd('kyoto-advanced-technology', 'cross', 'Kyoto Prize in Advanced Technology', 'Q6452191', 'Inamori Foundation', 'https://www.kyotoprize.org/en/laureates/', 1985, 'body', 'A one-line summary per laureate.'),
  wd('kavli-nanoscience', 'cross', 'Kavli Prize in Nanoscience', 'Q18889779', 'Norwegian Academy of Science and Letters', 'https://www.kavliprize.org/prizes', 2008, 'result', 'A discovery.'),
]

/** What the story does with the work (playbook lenses, landmark variant). */
const SEED_LENSES: NamedOption[] = [
  {
    name: 'Why it won',
    description:
      'Put the official motivation beside the work itself: what exactly the committee rewarded, where in the paper or book that result is, and what the motivation leaves out. The motivation is quoted verbatim, never paraphrased.',
  },
  {
    name: 'One figure',
    description:
      'Find the central figure, table, theorem or passage of the work and rebuild it as one chart from its own numbers (or the numbers it argues from), with the page or section cited.',
  },
  {
    name: 'What it replaced',
    description:
      'What the field believed before this work, the evidence that turned it over, and who held the old view, from the record. State the old view fairly.',
  },
  {
    name: 'Read it today',
    description:
      'A reader\'s guide to the work itself: its structure, the one passage or equation to read first, what a reader needs to know going in, and where to read it free of charge.',
  },
  {
    name: 'Citation trail',
    description:
      'How the work travelled: citations by year, the lag from publication to prize, who built on it and in which fields, from OpenAlex and the work\'s own references.',
  },
  {
    name: 'Missing names',
    description:
      'Who else did the work: the co-authors, the rivals and the predecessors the citation does not name, stated from the record and labelled where it is contested.',
  },
  {
    name: "Explain like I'm 5",
    description:
      'Explain the result to a five-year-old: one everyday object or scene stands in for it, no symbol or term a child would not know, and then say where the picture stops being true, with the work as the source for the real thing.',
  },
]

async function get<T>(url: string, accept = 'application/json'): Promise<T> {
  const res = await fetch(url, { headers: { accept, 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const eraOf = (year: number) => ERAS.find((e) => year >= e.from && year <= e.to)?.id ?? null

interface NobelPrizeRow {
  awardYear: string
  laureates?: Array<{ id?: string; orgName?: unknown }>
}

/** Awards per era for a Nobel category: every laureate of every year, from the API (one call). */
async function nobelCounts(category: string): Promise<{ awards: Record<string, number>; undated: number }> {
  const body = await get<{ nobelPrizes: NobelPrizeRow[]; meta?: { count?: number } }>(`${NOBEL_API}/nobelPrizes?nobelPrizeCategory=${category}&limit=500`)
  if (body.meta?.count !== undefined && body.nobelPrizes.length !== body.meta.count) {
    throw new Error(`nobel ${category}: got ${body.nobelPrizes.length} of ${body.meta.count} prizes`)
  }
  const awards: Record<string, number> = Object.fromEntries(ERAS.map((e) => [e.id, 0]))
  for (const p of body.nobelPrizes) {
    const era = eraOf(Number(p.awardYear))
    if (!era) continue
    awards[era] = (awards[era] ?? 0) + (p.laureates ?? []).length
  }
  return { awards, undated: 0 }
}

interface SparqlRow {
  prize: { value: string }
  year?: { value: string }
  n: { value: string }
  named: { value: string }
}

/** Awards per prize and year on Wikidata, humans only, in one query. */
async function wikidataCounts(items: string[]): Promise<Map<string, { awards: Record<string, number>; undated: number; named: number }>> {
  const query = `
SELECT ?prize ?year (COUNT(?st) AS ?n) (SUM(IF(BOUND(?work), 1, 0)) AS ?named) WHERE {
  VALUES ?prize { ${items.map((q) => `wd:${q}`).join(' ')} }
  ?person p:P166 ?st . ?st ps:P166 ?prize . ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P585 ?date }
  OPTIONAL { ?st pq:P1686 ?work }
  BIND(YEAR(?date) AS ?year)
} GROUP BY ?prize ?year`
  const body = await get<{ results: { bindings: SparqlRow[] } }>(`${SPARQL}?query=${encodeURIComponent(query)}`, 'application/sparql-results+json')
  const out = new Map<string, { awards: Record<string, number>; undated: number; named: number }>()
  for (const q of items) out.set(q, { awards: Object.fromEntries(ERAS.map((e) => [e.id, 0])), undated: 0, named: 0 })
  for (const row of body.results.bindings) {
    const q = row.prize.value.split('/').pop()!
    const rec = out.get(q)!
    const n = Number(row.n.value)
    rec.named += Number(row.named.value)
    const year = row.year?.value ? Number(row.year.value) : NaN
    const era = Number.isFinite(year) ? eraOf(year) : null
    if (era) rec.awards[era] = (rec.awards[era] ?? 0) + n
    else rec.undated += n
  }
  return out
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const existing: LandmarkDataset | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as LandmarkDataset) : null

  const ids = new Set<string>()
  for (const p of PRIZES) {
    if (ids.has(p.id)) throw new Error(`duplicate prize id ${p.id}`)
    ids.add(p.id)
    if (!FIELDS.some((f) => f.id === p.field)) throw new Error(`${p.id}: unknown field ${p.field}`)
  }
  for (const f of FIELDS) if (!PRIZES.some((p) => p.field === f.id)) throw new Error(`field without prizes: ${f.name}`)

  const wdItems = PRIZES.flatMap((p) => (p.source.kind === 'wikidata' ? [p.source.item] : []))
  const [wdCounts, ...nobelResults] = await Promise.all([
    wikidataCounts(wdItems),
    ...PRIZES.filter((p) => p.source.kind === 'nobel').map((p) => nobelCounts((p.source as { category: string }).category)),
  ])
  const nobelById = new Map(PRIZES.filter((p) => p.source.kind === 'nobel').map((p, i) => [p.id, nobelResults[i]!]))

  const prizes: LandmarkPrize[] = PRIZES.map((p) => {
    if (p.source.kind === 'nobel') {
      const c = nobelById.get(p.id)!
      return { ...p, awards: c.awards, named_works: 0, undated: c.undated }
    }
    const c = wdCounts.get(p.source.item)!
    const total = Object.values(c.awards).reduce((a, b) => a + b, 0)
    if (!total) throw new Error(`${p.id} (${p.source.item}) has no dated awards to humans on Wikidata: wrong item?`)
    return { ...p, awards: c.awards, named_works: c.named, undated: c.undated }
  })

  const lenses = existing?.lenses ?? SEED_LENSES
  const next: LandmarkDataset = { fields: FIELDS, eras: ERAS, prizes, lenses }
  const text = `${JSON.stringify(next, null, 2)}\n`
  const prizeList = (list: LandmarkPrize[] | PrizeSeed[]) => JSON.stringify(list.map((p) => [p.id, p.field, p.name, p.source, p.works, p.work_level]))
  // Counts drift as prizes are awarded and are not what --check is for; the prize list is.
  const stale = !existing || JSON.stringify(existing.fields) !== JSON.stringify(FIELDS) || JSON.stringify(existing.eras) !== JSON.stringify(ERAS) || prizeList(existing.prizes) !== prizeList(PRIZES)
  const total = prizes.reduce((n, p) => n + Object.values(p.awards).reduce((a, b) => a + b, 0), 0)
  const empty = prizes.flatMap((p) => ERAS.filter((e) => !p.awards[e.id]).map((e) => `${p.id}/${e.id}`))

  if (check) {
    if (stale) {
      console.error(`${OUT} is stale: run pnpm randomizer:landmark-taxonomy`)
      process.exit(1)
    }
    console.log(`landmark.json is current: ${FIELDS.length} fields, ${prizes.length} prizes, ${ERAS.length} eras, ${total} dated awards, ${lenses.length} lenses`)
    return
  }
  writeFileSync(OUT, text)
  console.log(
    `wrote ${join('packages/randomizer/src/data', 'landmark.json')}: ${FIELDS.length} fields, ${prizes.length} prizes, ${ERAS.length} eras, ${total} dated awards (${empty.length} of ${prizes.length * ERAS.length} prize-and-era pairs empty), ${lenses.length} lenses${stale ? '' : ' (prize list unchanged)'}`,
  )
  for (const p of prizes) {
    const n = Object.values(p.awards).reduce((a, b) => a + b, 0)
    console.log(`  ${p.id.padEnd(28)} ${String(n).padStart(4)} awards, ${String(p.named_works).padStart(3)} naming the work, ${String(p.undated).padStart(3)} undated`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
