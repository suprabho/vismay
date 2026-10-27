/**
 * Refresh The 100 Desk's taxonomy (packages/randomizer/src/data/hundred.json):
 * Michael H. Hart's ranking of the most influential persons in history (The
 * 100, revised edition, 1992), each person placed in a domain, an era and a
 * region, with their Wikidata item and life years.
 *
 * The ranking, the domains, eras and regions are hand-set here
 * (docs/hundred-randomizer-plan.md section 2): the rank and Hart's own
 * spelling of each name come from the book; the domain (what the person is
 * ranked for), the era (when the act Hart ranks them for happened) and the
 * region (where they were based) are the desk's own reading. Each run
 * resolves every English Wikipedia title to its Wikidata item and the
 * earliest birth and death years on record, in one SPARQL query, and fails
 * when a title no longer resolves (a page was moved: fix the title here).
 *
 * The file is committed so the slot machine's reel strips and the draw never
 * need the network; only the person's profile does, per spin
 * (packages/randomizer/src/hundredPool.ts).
 *
 * Usage:
 *   pnpm randomizer:hundred-taxonomy           # rewrite the file
 *   pnpm randomizer:hundred-taxonomy --check   # exit non-zero if the list in the file differs (CI)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'vismay-randomizer/0.1 (https://vizmaya.fyi; hundred taxonomy script)'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/randomizer/src/data/hundred.json')

type Flag = 'legendary' | 'no-portrait' | 'duo' | 'authorship' | 'harm'

interface NamedId {
  id: string
  name: string
}

interface HundredEra {
  id: string
  name: string
  /** First year of the era (negative is BCE); null for the open start. */
  from: number | null
  /** Last year; null for the open end. */
  to: number | null
}

interface HundredPerson {
  rank: number
  id: string
  name: string
  /** The name as Hart printed it, when it differs. */
  hart_name: string
  /** The English Wikipedia title. */
  wiki: string
  /** The Wikidata item, resolved from the title at the last refresh. */
  wikidata: string
  domain: string
  era: string
  region: string
  /** Earliest birth and death years on Wikidata (negative is BCE); null when not on record. */
  born: number | null
  died: number | null
  flags: Flag[]
  /** What the brief must say up front, when anything. */
  note?: string
}

interface NamedOption {
  name: string
  description: string
}

interface HundredDataset {
  book: {
    title: string
    author: string
    edition: string
    publisher: string
    year: number
    first_edition: number
    note: string
  }
  domains: NamedId[]
  eras: HundredEra[]
  regions: string[]
  people: HundredPerson[]
  lenses: NamedOption[]
}

const BOOK: HundredDataset['book'] = {
  title: 'The 100: A Ranking of the Most Influential Persons in History',
  author: 'Michael H. Hart',
  edition: 'Revised and updated for the nineties',
  publisher: 'Citadel Press',
  year: 1992,
  first_edition: 1978,
  note: 'Hart ranks people by how much they changed the course of history, not by greatness or goodness. The 1992 revision moved Lenin and Mao down after 1989, added Gorbachev, put Ernest Rutherford in place of Niels Bohr and Henri Becquerel, promoted Henry Ford from the honourable mentions, and credited the works of Shakespeare to Edward de Vere, Earl of Oxford.',
}

const DOMAINS: NamedId[] = [
  { id: 'faith', name: 'Religion and ethics' },
  { id: 'science', name: 'Science and mathematics' },
  { id: 'medicine', name: 'Medicine' },
  { id: 'invention', name: 'Invention and industry' },
  { id: 'exploration', name: 'Exploration and conquest' },
  { id: 'power', name: 'Rulers and statesmen' },
  { id: 'ideas', name: 'Philosophy and society' },
  { id: 'arts', name: 'Arts and letters' },
]

const ERAS: HundredEra[] = [
  { id: 'ancient', name: 'Ancient world (to 500 CE)', from: null, to: 499 },
  { id: 'medieval', name: 'Middle Ages (500 to 1450)', from: 500, to: 1449 },
  { id: 'early-modern', name: 'Early modern (1450 to 1750)', from: 1450, to: 1749 },
  { id: 'revolutions', name: 'Age of revolutions (1750 to 1900)', from: 1750, to: 1899 },
  { id: 'modern', name: 'Twentieth century (1900 on)', from: 1900, to: null },
]

const REGIONS = ['Europe', 'Middle East and North Africa', 'South Asia', 'East Asia', 'Americas']

type Seed = Omit<HundredPerson, 'id' | 'wikidata' | 'born' | 'died' | 'flags' | 'hart_name'> & { hart_name?: string; flags?: Flag[] }

const EU = 'Europe'
const ME = 'Middle East and North Africa'
const SA = 'South Asia'
const EA = 'East Asia'
const AM = 'Americas'

/** The ranking, as printed in the 1992 edition (checked against a reproduction of its table on 2026-10-27). */
const PEOPLE: Seed[] = [
  { rank: 1, name: 'Muhammad', wiki: 'Muhammad', domain: 'faith', era: 'medieval', region: ME, flags: ['no-portrait'], note: 'Most Muslims hold that the Prophet should not be depicted: no portrait, figure or likeness of him on the page; use calligraphy, places or maps instead.' },
  { rank: 2, name: 'Isaac Newton', wiki: 'Isaac Newton', domain: 'science', era: 'early-modern', region: EU },
  { rank: 3, name: 'Jesus', hart_name: 'Jesus Christ', wiki: 'Jesus', domain: 'faith', era: 'ancient', region: ME },
  { rank: 4, name: 'Gautama Buddha', hart_name: 'Buddha', wiki: 'The Buddha', domain: 'faith', era: 'ancient', region: SA },
  { rank: 5, name: 'Confucius', wiki: 'Confucius', domain: 'faith', era: 'ancient', region: EA },
  { rank: 6, name: 'Paul the Apostle', hart_name: 'St. Paul', wiki: 'Paul the Apostle', domain: 'faith', era: 'ancient', region: ME },
  { rank: 7, name: 'Cai Lun', hart_name: "Ts'ai Lun", wiki: 'Cai Lun', domain: 'invention', era: 'ancient', region: EA },
  { rank: 8, name: 'Johannes Gutenberg', hart_name: 'Johann Gutenberg', wiki: 'Johannes Gutenberg', domain: 'invention', era: 'early-modern', region: EU },
  { rank: 9, name: 'Christopher Columbus', wiki: 'Christopher Columbus', domain: 'exploration', era: 'early-modern', region: EU, flags: ['harm'] },
  { rank: 10, name: 'Albert Einstein', wiki: 'Albert Einstein', domain: 'science', era: 'modern', region: EU },
  { rank: 11, name: 'Louis Pasteur', wiki: 'Louis Pasteur', domain: 'medicine', era: 'revolutions', region: EU },
  { rank: 12, name: 'Galileo Galilei', wiki: 'Galileo Galilei', domain: 'science', era: 'early-modern', region: EU },
  { rank: 13, name: 'Aristotle', wiki: 'Aristotle', domain: 'ideas', era: 'ancient', region: EU },
  { rank: 14, name: 'Euclid', wiki: 'Euclid', domain: 'science', era: 'ancient', region: ME },
  { rank: 15, name: 'Moses', wiki: 'Moses', domain: 'faith', era: 'ancient', region: ME, flags: ['legendary'] },
  { rank: 16, name: 'Charles Darwin', wiki: 'Charles Darwin', domain: 'science', era: 'revolutions', region: EU },
  { rank: 17, name: 'Qin Shi Huang', hart_name: 'Shih Huang Ti', wiki: 'Qin Shi Huang', domain: 'power', era: 'ancient', region: EA, flags: ['harm'] },
  { rank: 18, name: 'Augustus', hart_name: 'Augustus Caesar', wiki: 'Augustus', domain: 'power', era: 'ancient', region: EU },
  { rank: 19, name: 'Nicolaus Copernicus', wiki: 'Nicolaus Copernicus', domain: 'science', era: 'early-modern', region: EU },
  { rank: 20, name: 'Antoine Lavoisier', hart_name: 'Antoine Laurent Lavoisier', wiki: 'Antoine Lavoisier', domain: 'science', era: 'revolutions', region: EU },
  { rank: 21, name: 'Constantine the Great', hart_name: 'Constantine', wiki: 'Constantine the Great', domain: 'power', era: 'ancient', region: EU },
  { rank: 22, name: 'James Watt', wiki: 'James Watt', domain: 'invention', era: 'revolutions', region: EU },
  { rank: 23, name: 'Michael Faraday', wiki: 'Michael Faraday', domain: 'science', era: 'revolutions', region: EU },
  { rank: 24, name: 'James Clerk Maxwell', wiki: 'James Clerk Maxwell', domain: 'science', era: 'revolutions', region: EU },
  { rank: 25, name: 'Martin Luther', wiki: 'Martin Luther', domain: 'faith', era: 'early-modern', region: EU },
  { rank: 26, name: 'George Washington', wiki: 'George Washington', domain: 'power', era: 'revolutions', region: AM },
  { rank: 27, name: 'Karl Marx', wiki: 'Karl Marx', domain: 'ideas', era: 'revolutions', region: EU },
  { rank: 28, name: 'The Wright brothers', hart_name: 'Orville and Wilbur Wright', wiki: 'Wright brothers', domain: 'invention', era: 'modern', region: AM, flags: ['duo'], note: 'One entry for two people, Orville and Wilbur Wright: the page covers both and says which did what where the record tells them apart.' },
  { rank: 29, name: 'Genghis Khan', wiki: 'Genghis Khan', domain: 'power', era: 'medieval', region: EA, flags: ['harm'] },
  { rank: 30, name: 'Adam Smith', wiki: 'Adam Smith', domain: 'ideas', era: 'revolutions', region: EU },
  { rank: 31, name: 'William Shakespeare', wiki: 'William Shakespeare', domain: 'arts', era: 'early-modern', region: EU, flags: ['authorship'], note: "Hart's 1992 edition ranks the author of Shakespeare's works and credits them to Edward de Vere, Earl of Oxford. That is a minority view: mainstream scholarship attributes the works to William Shakespeare of Stratford. Say so, and label the authorship question as contested with the evidence on each side." },
  { rank: 32, name: 'John Dalton', wiki: 'John Dalton', domain: 'science', era: 'revolutions', region: EU },
  { rank: 33, name: 'Alexander the Great', wiki: 'Alexander the Great', domain: 'power', era: 'ancient', region: EU },
  { rank: 34, name: 'Napoleon', hart_name: 'Napoleon Bonaparte', wiki: 'Napoleon', domain: 'power', era: 'revolutions', region: EU },
  { rank: 35, name: 'Thomas Edison', wiki: 'Thomas Edison', domain: 'invention', era: 'revolutions', region: AM },
  { rank: 36, name: 'Antonie van Leeuwenhoek', hart_name: 'Antony van Leeuwenhoek', wiki: 'Antonie van Leeuwenhoek', domain: 'science', era: 'early-modern', region: EU },
  { rank: 37, name: 'William T. G. Morton', hart_name: 'William T.G. Morton', wiki: 'William T. G. Morton', domain: 'medicine', era: 'revolutions', region: AM },
  { rank: 38, name: 'Guglielmo Marconi', wiki: 'Guglielmo Marconi', domain: 'invention', era: 'modern', region: EU },
  { rank: 39, name: 'Adolf Hitler', wiki: 'Adolf Hitler', domain: 'power', era: 'modern', region: EU, flags: ['harm'] },
  { rank: 40, name: 'Plato', wiki: 'Plato', domain: 'ideas', era: 'ancient', region: EU },
  { rank: 41, name: 'Oliver Cromwell', wiki: 'Oliver Cromwell', domain: 'power', era: 'early-modern', region: EU },
  { rank: 42, name: 'Alexander Graham Bell', wiki: 'Alexander Graham Bell', domain: 'invention', era: 'revolutions', region: AM },
  { rank: 43, name: 'Alexander Fleming', wiki: 'Alexander Fleming', domain: 'medicine', era: 'modern', region: EU },
  { rank: 44, name: 'John Locke', wiki: 'John Locke', domain: 'ideas', era: 'early-modern', region: EU },
  { rank: 45, name: 'Ludwig van Beethoven', wiki: 'Ludwig van Beethoven', domain: 'arts', era: 'revolutions', region: EU },
  { rank: 46, name: 'Werner Heisenberg', wiki: 'Werner Heisenberg', domain: 'science', era: 'modern', region: EU },
  { rank: 47, name: 'Louis Daguerre', wiki: 'Louis Daguerre', domain: 'invention', era: 'revolutions', region: EU },
  { rank: 48, name: 'Simón Bolívar', hart_name: 'Simon Bolivar', wiki: 'Simón Bolívar', domain: 'power', era: 'revolutions', region: AM },
  { rank: 49, name: 'René Descartes', hart_name: 'Rene Descartes', wiki: 'René Descartes', domain: 'ideas', era: 'early-modern', region: EU },
  { rank: 50, name: 'Michelangelo', wiki: 'Michelangelo', domain: 'arts', era: 'early-modern', region: EU },
  { rank: 51, name: 'Pope Urban II', wiki: 'Pope Urban II', domain: 'faith', era: 'medieval', region: EU },
  { rank: 52, name: 'Umar', hart_name: "'Umar ibn al-Khattab", wiki: 'Umar', domain: 'power', era: 'medieval', region: ME, flags: ['no-portrait'], note: 'Many Muslims hold that the companions of the Prophet should not be depicted: no portrait or likeness of Umar on the page.' },
  { rank: 53, name: 'Ashoka', hart_name: 'Asoka', wiki: 'Ashoka', domain: 'power', era: 'ancient', region: SA },
  { rank: 54, name: 'Augustine of Hippo', hart_name: 'St. Augustine', wiki: 'Augustine of Hippo', domain: 'faith', era: 'ancient', region: ME },
  { rank: 55, name: 'William Harvey', wiki: 'William Harvey', domain: 'medicine', era: 'early-modern', region: EU },
  { rank: 56, name: 'Ernest Rutherford', wiki: 'Ernest Rutherford', domain: 'science', era: 'modern', region: EU },
  { rank: 57, name: 'John Calvin', wiki: 'John Calvin', domain: 'faith', era: 'early-modern', region: EU },
  { rank: 58, name: 'Gregor Mendel', wiki: 'Gregor Mendel', domain: 'science', era: 'revolutions', region: EU },
  { rank: 59, name: 'Max Planck', wiki: 'Max Planck', domain: 'science', era: 'modern', region: EU },
  { rank: 60, name: 'Joseph Lister', wiki: 'Joseph Lister', domain: 'medicine', era: 'revolutions', region: EU },
  { rank: 61, name: 'Nicolaus Otto', hart_name: 'Nikolaus August Otto', wiki: 'Nicolaus Otto', domain: 'invention', era: 'revolutions', region: EU },
  { rank: 62, name: 'Francisco Pizarro', wiki: 'Francisco Pizarro', domain: 'exploration', era: 'early-modern', region: EU, flags: ['harm'] },
  { rank: 63, name: 'Hernán Cortés', hart_name: 'Hernando Cortes', wiki: 'Hernán Cortés', domain: 'exploration', era: 'early-modern', region: EU, flags: ['harm'] },
  { rank: 64, name: 'Thomas Jefferson', wiki: 'Thomas Jefferson', domain: 'power', era: 'revolutions', region: AM },
  { rank: 65, name: 'Isabella I of Castile', hart_name: 'Queen Isabella I', wiki: 'Isabella I of Castile', domain: 'power', era: 'early-modern', region: EU },
  { rank: 66, name: 'Joseph Stalin', wiki: 'Joseph Stalin', domain: 'power', era: 'modern', region: EU, flags: ['harm'] },
  { rank: 67, name: 'Julius Caesar', wiki: 'Julius Caesar', domain: 'power', era: 'ancient', region: EU },
  { rank: 68, name: 'William the Conqueror', wiki: 'William the Conqueror', domain: 'power', era: 'medieval', region: EU },
  { rank: 69, name: 'Sigmund Freud', wiki: 'Sigmund Freud', domain: 'medicine', era: 'modern', region: EU },
  { rank: 70, name: 'Edward Jenner', wiki: 'Edward Jenner', domain: 'medicine', era: 'revolutions', region: EU },
  { rank: 71, name: 'Wilhelm Röntgen', hart_name: 'Wilhelm Conrad Roentgen', wiki: 'Wilhelm Röntgen', domain: 'science', era: 'revolutions', region: EU },
  { rank: 72, name: 'Johann Sebastian Bach', wiki: 'Johann Sebastian Bach', domain: 'arts', era: 'early-modern', region: EU },
  { rank: 73, name: 'Laozi', hart_name: 'Lao Tzu', wiki: 'Laozi', domain: 'faith', era: 'ancient', region: EA, flags: ['legendary'] },
  { rank: 74, name: 'Voltaire', wiki: 'Voltaire', domain: 'ideas', era: 'early-modern', region: EU },
  { rank: 75, name: 'Johannes Kepler', wiki: 'Johannes Kepler', domain: 'science', era: 'early-modern', region: EU },
  { rank: 76, name: 'Enrico Fermi', wiki: 'Enrico Fermi', domain: 'science', era: 'modern', region: AM },
  { rank: 77, name: 'Leonhard Euler', wiki: 'Leonhard Euler', domain: 'science', era: 'early-modern', region: EU },
  { rank: 78, name: 'Jean-Jacques Rousseau', wiki: 'Jean-Jacques Rousseau', domain: 'ideas', era: 'revolutions', region: EU },
  { rank: 79, name: 'Niccolò Machiavelli', hart_name: 'Nicolo Machiavelli', wiki: 'Niccolò Machiavelli', domain: 'ideas', era: 'early-modern', region: EU },
  { rank: 80, name: 'Thomas Malthus', wiki: 'Thomas Robert Malthus', domain: 'ideas', era: 'revolutions', region: EU },
  { rank: 81, name: 'John F. Kennedy', wiki: 'John F. Kennedy', domain: 'power', era: 'modern', region: AM },
  { rank: 82, name: 'Gregory Pincus', wiki: 'Gregory G. Pincus', domain: 'medicine', era: 'modern', region: AM },
  { rank: 83, name: 'Mani', wiki: 'Mani (prophet)', domain: 'faith', era: 'ancient', region: ME },
  { rank: 84, name: 'Vladimir Lenin', hart_name: 'Lenin', wiki: 'Vladimir Lenin', domain: 'power', era: 'modern', region: EU, flags: ['harm'] },
  { rank: 85, name: 'Emperor Wen of Sui', hart_name: 'Sui Wen Ti', wiki: 'Emperor Wen of Sui', domain: 'power', era: 'medieval', region: EA },
  { rank: 86, name: 'Vasco da Gama', wiki: 'Vasco da Gama', domain: 'exploration', era: 'early-modern', region: EU },
  { rank: 87, name: 'Cyrus the Great', wiki: 'Cyrus the Great', domain: 'power', era: 'ancient', region: ME },
  { rank: 88, name: 'Peter the Great', wiki: 'Peter the Great', domain: 'power', era: 'early-modern', region: EU },
  { rank: 89, name: 'Mao Zedong', wiki: 'Mao Zedong', domain: 'power', era: 'modern', region: EA, flags: ['harm'] },
  { rank: 90, name: 'Francis Bacon', wiki: 'Francis Bacon', domain: 'ideas', era: 'early-modern', region: EU },
  { rank: 91, name: 'Henry Ford', wiki: 'Henry Ford', domain: 'invention', era: 'modern', region: AM },
  { rank: 92, name: 'Mencius', wiki: 'Mencius', domain: 'faith', era: 'ancient', region: EA },
  { rank: 93, name: 'Zoroaster', wiki: 'Zoroaster', domain: 'faith', era: 'ancient', region: ME, flags: ['legendary'] },
  { rank: 94, name: 'Elizabeth I', hart_name: 'Queen Elizabeth I', wiki: 'Elizabeth I', domain: 'power', era: 'early-modern', region: EU },
  { rank: 95, name: 'Mikhail Gorbachev', wiki: 'Mikhail Gorbachev', domain: 'power', era: 'modern', region: EU },
  { rank: 96, name: 'Menes', wiki: 'Menes', domain: 'power', era: 'ancient', region: ME, flags: ['legendary'] },
  { rank: 97, name: 'Charlemagne', wiki: 'Charlemagne', domain: 'power', era: 'medieval', region: EU },
  { rank: 98, name: 'Homer', wiki: 'Homer', domain: 'arts', era: 'ancient', region: EU, flags: ['legendary'] },
  { rank: 99, name: 'Justinian I', wiki: 'Justinian I', domain: 'power', era: 'medieval', region: EU },
  { rank: 100, name: 'Mahavira', wiki: 'Mahavira', domain: 'faith', era: 'ancient', region: SA },
]

/** The lenses the first file was written with; a refresh keeps the file's own (they are editorial). */
const SEED_LENSES: NamedOption[] = [
  {
    name: 'The case for the rank',
    description: "Test Hart's argument for this rank against the record: what the person changed, how many people it reached, and for how long. Say where the evidence supports the rank and where it would move them up or down.",
  },
  {
    name: 'Without them',
    description: "Hart's own test: what would have happened anyway. Name who else was close to the same idea, invention or conquest, and how much of the change needed this person.",
  },
  {
    name: 'Reach in numbers',
    description: 'Put the influence in numbers: followers, users, territory, people under the laws or institutions they made, works printed or performed, and how those numbers moved over time.',
  },
  {
    name: 'Map of a life',
    description: 'Where they were born, worked, travelled and died, and where their influence spread after them, on a map with dated points.',
  },
  {
    name: 'Myth and record',
    description: 'Separate what contemporary or near-contemporary sources document from what later tradition, legend or biography added, and show when each layer appeared.',
  },
  {
    name: 'Who is missing',
    description: "The collaborators, rivals, predecessors and the people the change happened to, whom the ranking leaves out, and what the list's choices say about who gets counted as influential.",
  },
  {
    name: "Explain like I'm 5",
    description: 'Explain what this person changed to a five-year-old: one everyday object or scene stands in for it, no word a child would not know, and then say where the picture stops being true, with the record as the source for the real thing.',
  },
]

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface SparqlRow {
  title: { value: string }
  item: { value: string }
  born?: { value: string }
  died?: { value: string }
}

/** The Wikidata item and the earliest birth and death years for each English Wikipedia title, in one query. */
async function resolveTitles(titles: string[]): Promise<Map<string, { item: string; born: number | null; died: number | null }>> {
  const literal = (t: string) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`
  const query = `
SELECT ?title ?item (MIN(YEAR(?b)) AS ?born) (MIN(YEAR(?d)) AS ?died) WHERE {
  VALUES ?title { ${titles.map(literal).join(' ')} }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?item wdt:P569 ?b }
  OPTIONAL { ?item wdt:P570 ?d }
} GROUP BY ?title ?item`
  const res = await fetch(SPARQL, {
    method: 'POST',
    headers: { accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`${SPARQL}: HTTP ${res.status}`)
  const body = (await res.json()) as { results: { bindings: SparqlRow[] } }
  const out = new Map<string, { item: string; born: number | null; died: number | null }>()
  const year = (v?: { value: string }) => (v?.value && Number.isFinite(Number(v.value)) ? Number(v.value) : null)
  for (const row of body.results.bindings) {
    out.set(row.title.value, { item: row.item.value.split('/').pop()!, born: year(row.born), died: year(row.died) })
  }
  return out
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const existing: HundredDataset | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as HundredDataset) : null

  if (PEOPLE.length !== 100) throw new Error(`expected 100 people, have ${PEOPLE.length}`)
  PEOPLE.forEach((p, i) => {
    if (p.rank !== i + 1) throw new Error(`rank ${i + 1} is ${p.name} (rank ${p.rank})`)
    if (!DOMAINS.some((d) => d.id === p.domain)) throw new Error(`${p.name}: unknown domain ${p.domain}`)
    if (!ERAS.some((e) => e.id === p.era)) throw new Error(`${p.name}: unknown era ${p.era}`)
    if (!REGIONS.includes(p.region)) throw new Error(`${p.name}: unknown region ${p.region}`)
  })
  for (const d of DOMAINS) if (!PEOPLE.some((p) => p.domain === d.id)) throw new Error(`domain without people: ${d.name}`)

  const listOf = (people: Array<Pick<HundredPerson, 'rank' | 'name' | 'wiki' | 'domain' | 'era' | 'region'> & { flags?: Flag[]; note?: string }>) =>
    JSON.stringify(people.map((p) => [p.rank, p.name, p.wiki, p.domain, p.era, p.region, p.flags ?? [], p.note ?? null]))
  const stale =
    !existing ||
    JSON.stringify(existing.domains) !== JSON.stringify(DOMAINS) ||
    JSON.stringify(existing.eras) !== JSON.stringify(ERAS) ||
    JSON.stringify(existing.book) !== JSON.stringify(BOOK) ||
    listOf(existing.people) !== listOf(PEOPLE)
  if (check) {
    if (stale) {
      console.error(`${OUT} is stale: run pnpm randomizer:hundred-taxonomy`)
      process.exit(1)
    }
    console.log(`hundred.json is current: ${existing!.people.length} people, ${DOMAINS.length} domains, ${ERAS.length} eras, ${existing!.lenses.length} lenses`)
    return
  }

  const resolved = await resolveTitles(PEOPLE.map((p) => p.wiki))
  const missing = PEOPLE.filter((p) => !resolved.has(p.wiki))
  if (missing.length) throw new Error(`these English Wikipedia titles do not resolve on Wikidata (moved or renamed?): ${missing.map((p) => `#${p.rank} "${p.wiki}"`).join(', ')}`)

  const people: HundredPerson[] = PEOPLE.map((p) => {
    const r = resolved.get(p.wiki)!
    const out: HundredPerson = {
      rank: p.rank,
      id: slug(p.name),
      name: p.name,
      hart_name: p.hart_name ?? p.name,
      wiki: p.wiki,
      wikidata: r.item,
      domain: p.domain,
      era: p.era,
      region: p.region,
      born: r.born,
      died: r.died,
      flags: p.flags ?? [],
    }
    if (p.note) out.note = p.note
    return out
  })
  const ids = new Set(people.map((p) => p.id))
  if (ids.size !== people.length) throw new Error('two people share an id')

  const lenses = existing?.lenses ?? SEED_LENSES
  const next: HundredDataset = { book: BOOK, domains: DOMAINS, eras: ERAS, regions: REGIONS, people, lenses }
  writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`wrote ${join('packages/randomizer/src/data', 'hundred.json')}: ${people.length} people, ${DOMAINS.length} domains, ${ERAS.length} eras, ${lenses.length} lenses${stale ? '' : ' (list unchanged)'}`)
  for (const d of DOMAINS) {
    const row = ERAS.map((e) => `${e.id} ${people.filter((p) => p.domain === d.id && p.era === e.id).length}`).join(', ')
    console.log(`  ${d.id.padEnd(12)} ${String(people.filter((p) => p.domain === d.id).length).padStart(3)} people (${row})`)
  }
  const undated = people.filter((p) => p.born === null)
  if (undated.length) console.log(`  no birth year on Wikidata: ${undated.map((p) => p.name).join(', ')}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
