/**
 * Refresh The Evidence Desk's dataset (packages/randomizer/src/data/evidence.json)
 * from the annotated research collection it draws on:
 * scripts/randomizer/sources/social-media-research-2026.md ("Social Media and
 * Its Effects on People and Society: An Annotated Research Collection", 2026
 * edition, 83 papers and reports in 7 themes).
 *
 * The collection is the source of truth for every study's citation, DOI or
 * link, access flag, type and sample, findings and footnoted sources: this
 * script parses them out of the markdown, so editing the collection and
 * re-running it is how the desk changes. What the markdown does not say in a
 * machine-readable way is hand-set here (docs/evidence-randomizer-plan.md
 * section 2): each study's design (the design reel), its flags (contested,
 * preprint, failed replication, run with the platform, small sample, suicide
 * content, corrected), a short note where a flag needs words, the debates the
 * collection pairs (#2 against #3, #21 against #22 and #23...), and a few
 * short labels for institutional authors.
 *
 * Unless `--offline`, each DOI is looked up on OpenAlex (free, no key) to
 * record the OpenAlex work id and to warn when the title OpenAlex has for a
 * DOI does not match the collection's (a mistyped DOI). A DOI OpenAlex does
 * not know is kept, with a warning: the per-spin record (evidencePool.ts)
 * then says so.
 *
 * The file is committed so the slot machine's reel strips and the draw never
 * need the network; only the drawn study's live record does, per spin.
 *
 * Usage:
 *   pnpm randomizer:evidence-taxonomy             # rewrite the file
 *   pnpm randomizer:evidence-taxonomy --offline   # rewrite without the OpenAlex lookups (keeps known ids)
 *   pnpm randomizer:evidence-taxonomy --check     # exit non-zero if the file is stale against the collection (CI)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(HERE, 'sources/social-media-research-2026.md')
const OUT = resolve(HERE, '../../packages/randomizer/src/data/evidence.json')
const OPENALEX = 'https://api.openalex.org'
const USER_AGENT = 'vismay-randomizer/0.1 (https://vizmaya.fyi; evidence taxonomy script)'

type Flag = 'contested' | 'preprint' | 'replication' | 'platform' | 'small-sample' | 'suicide' | 'correction'

interface NamedOption {
  name: string
  description: string
}

interface Theme {
  id: string
  n: number
  name: string
  strength: string
  bottom_line: string
}

interface Design {
  id: string
  name: string
  /** What a study of this design can show, for the brief's evidence rule. */
  can_show: string
}

interface Link {
  n: number
  title: string
  url: string
}

interface Study {
  n: number
  id: string
  label: string
  authors: string | null
  year: number
  title: string
  venue: string | null
  citation: string
  doi: string | null
  url: string | null
  arxiv: string | null
  access: 'open' | 'free-copy' | null
  theme: string
  section: string | null
  section_name: string | null
  design: string
  type_sample: string | null
  findings: string
  related: number[]
  flags: Flag[]
  note?: string
  sources: Link[]
  openalex: string | null
}

interface Collection {
  title: string
  edition: number
  summary: string
  tldr: string[]
  key_findings: string[]
  caveats: string[]
  gaps: string
  source: string
}

interface Dataset {
  collection: Collection
  themes: Theme[]
  designs: Design[]
  studies: Study[]
  lenses: NamedOption[]
}

/* ---------- Hand-set: the desk's own reading of the collection ---------- */

const THEME_IDS: Record<number, string> = {
  1: 'mental-health',
  2: 'attention',
  3: 'politics',
  4: 'relationships',
  5: 'economy',
  6: 'benefits',
  7: 'policy',
}

const DESIGNS: Design[] = [
  {
    id: 'experiment',
    name: 'Randomized experiment',
    can_show: 'cause, for the people in the sample, the platform and period studied, and the length of the intervention',
  },
  {
    id: 'natural',
    name: 'Natural experiment',
    can_show: 'cause, if the as-good-as-random assumption holds (say what it is and how it was tested)',
  },
  {
    id: 'cohort',
    name: 'Cohort and longitudinal',
    can_show: 'what comes before what, and within-person change; not cause on its own (confounders can still drive both)',
  },
  {
    id: 'observational',
    name: 'Observational and platform data',
    can_show: 'association, prevalence and spread; not cause',
  },
  {
    id: 'synthesis',
    name: 'Meta-analysis and review',
    can_show: 'what the studies it pools show together; no stronger than the designs it pools (say which it pooled)',
  },
  {
    id: 'report',
    name: 'Report and commentary',
    can_show: "an institution's or an expert's reading of the evidence: attribute it, and trace its claims to the studies behind them",
  },
]

/** Each study's design: how its finding was produced. */
const DESIGN_OF: Record<number, string> = {
  1: 'observational', 2: 'observational', 3: 'observational', 4: 'cohort', 5: 'report', 6: 'synthesis', 7: 'cohort',
  8: 'report', 9: 'report', 10: 'report',
  11: 'cohort', 12: 'cohort', 13: 'cohort', 14: 'cohort', 15: 'cohort', 16: 'cohort',
  17: 'natural', 18: 'experiment', 19: 'experiment', 20: 'experiment', 21: 'synthesis', 22: 'synthesis', 23: 'synthesis',
  24: 'synthesis', 25: 'synthesis',
  26: 'synthesis', 27: 'experiment', 28: 'experiment', 29: 'experiment', 30: 'cohort', 31: 'experiment', 32: 'synthesis', 33: 'natural',
  34: 'observational', 35: 'observational', 36: 'observational', 37: 'synthesis',
  38: 'observational', 39: 'experiment', 40: 'experiment', 41: 'experiment', 42: 'observational', 43: 'experiment', 44: 'experiment',
  45: 'experiment', 46: 'experiment', 47: 'experiment', 48: 'experiment', 49: 'observational',
  50: 'experiment', 51: 'natural', 52: 'natural', 53: 'experiment', 54: 'synthesis', 55: 'synthesis',
  56: 'cohort', 57: 'observational', 58: 'synthesis', 59: 'observational', 60: 'synthesis', 61: 'synthesis', 62: 'cohort', 63: 'natural',
  64: 'experiment', 65: 'experiment', 66: 'experiment', 67: 'experiment', 68: 'observational',
  69: 'synthesis', 70: 'synthesis', 71: 'synthesis',
  72: 'cohort', 73: 'cohort', 74: 'report', 75: 'observational',
  76: 'experiment', 77: 'experiment', 78: 'experiment',
  79: 'observational', 80: 'observational', 81: 'observational', 82: 'observational', 83: 'report',
}

const FLAGS: Record<number, Flag[]> = {
  1: ['contested', 'suicide'],
  2: ['contested'],
  3: ['contested'],
  5: ['contested'],
  7: ['small-sample'],
  14: ['suicide'],
  16: ['small-sample'],
  19: ['preprint', 'platform'],
  20: ['small-sample'],
  21: ['contested'],
  22: ['contested'],
  23: ['contested', 'preprint'],
  29: ['small-sample'],
  30: ['small-sample'],
  31: ['replication'],
  38: ['platform'],
  40: ['contested', 'platform'],
  41: ['platform'],
  42: ['platform'],
  43: ['platform'],
  44: ['platform', 'correction'],
  45: ['platform'],
  50: ['platform'],
  56: ['replication', 'small-sample'],
  60: ['suicide'],
  65: ['preprint'],
  81: ['preprint'],
}

/** What the brief must say up front, when a flag needs words. */
const NOTES: Record<number, string> = {
  2: 'The landmark "small effects" paper, and one side of the field\'s central dispute: #3 re-analyses the same data and finds larger associations for girls and social media specifically. Put both on the page.',
  3: 'A direct rebuttal of #2 on the same datasets: the disagreement is about analytic choices. Put both on the page.',
  5: 'An expert review, not a study: Haidt replied on his Substack (not peer-reviewed). Present it as one side of a dispute.',
  21: 'Contested by two later meta-analyses (#22, #23) that pool differently and find benefits. Put the dispute on the page.',
  22: 'A reanalysis of #21; Ferguson replied that the effects are of "limited practical or clinical value". Put the dispute on the page.',
  23: 'A medRxiv preprint, not yet peer-reviewed: say so on the page and in the share card.',
  31: 'A preregistered direct replication (Ruiz Pardo & Minda 2022, Acta Psychologica) did not reproduce the "brain drain" effect. The page leads with that.',
  40: 'Critics (Bagchi et al. 2024, Science eLetter) report 63 emergency "break-glass" changes Meta made to the feed during the study; the authors reply the results apply to the algorithm in use at the time. Put both on the page.',
  44: 'A correction was published in 2026 (DOI 10.1073/pnas.2607249123): read it before quoting any number.',
  56: 'The three-year follow-up (Kraut et al. 2002, "Internet Paradox Revisited") found the negative effects had dissipated. The page says so.',
  26: 'The collection lists this meta-analysis without a DOI: find it on the Psychological Bulletin (APA PsycNet) page and cite that, not a press summary.',
  65: 'An NBER working paper, not a peer-reviewed article: say so on the page.',
  81: 'An arXiv preprint: say so on the page.',
  19: 'An NBER working paper run inside the 2020 Meta election studies: say it is a working paper, and that Meta cooperated under an independence agreement.',
}

/** Debates the collection pairs, beyond the "#N" references in each entry's own text. */
const DEBATES: Array<number[]> = [
  [1, 2, 3, 5],
  [2, 3],
  [5, 9, 13, 17],
  [18, 19, 44, 66],
  [20, 67],
  [21, 22, 23],
  [26, 27, 14],
  [33, 75],
  [34, 35, 36],
  [38, 40, 41, 42, 43, 44],
  [40, 46, 47],
  [45, 46, 48],
  [64, 65],
  [72, 73, 74],
  [76, 77, 78],
  [79, 80, 81, 82, 83],
  [60, 61, 62],
  [57, 58, 7],
]

/** Short labels for authors the parser cannot shorten. */
const LABELS: Record<number, string> = {
  8: 'U.S. Surgeon General 2023',
  9: 'National Academies 2024',
  10: 'APA 2023',
  62: 'E-Risk Study team 2025',
  68: 'Media Ecosystem Observatory 2024',
  73: 'eSafety Commissioner 2026',
  83: 'Finally, Access 2026',
}

/**
 * DOIs for entries the collection lists only by a link (NBER, The Lancet's
 * page, arXiv), checked on OpenAlex on 2026-11-02. The entry's own link stays
 * its URL; the DOI only feeds the live citation record.
 */
const DOI_FILL: Record<number, string> = {
  19: '10.3386/w33697',
  62: '10.1016/S2352-4642(25)00311-6',
  65: '10.3386/w31771',
  81: '10.48550/arXiv.2312.04431',
}

/** Entries whose citation does not follow "Authors (year). Title. *Venue*". */
const OVERRIDES: Record<number, Partial<Pick<Study, 'authors' | 'title' | 'venue'>>> = {
  10: { venue: 'American Psychological Association' },
  57: { title: 'The benefits of Facebook "friends:" Social capital and college students\' use of online social network sites', venue: 'Journal of Computer-Mediated Communication' },
  81: { venue: 'arXiv preprint' },
  83: { authors: null, title: 'Finally, Access: How Article 40 DSA Changes Platform Research in Practice', venue: 'Political Communication' },
}

const SEED_LENSES: NamedOption[] = [
  {
    name: 'Read the number',
    description: 'What the headline effect size means in everyday terms: translate it (hours, people in a classroom, points on a thermometer), set it against the collection\'s benchmarks (0.05 to 0.1 SD; 0.4% of variance) and say whether it matters at population scale.',
  },
  {
    name: 'Cause or correlation',
    description: 'What this design can and cannot show: walk the reader through how the finding was produced, what would have to be true for it to mean cause, and the strongest alternative explanation.',
  },
  {
    name: 'The other side',
    description: 'The strongest study in the collection that points the other way, side by side with this one: same question, different answer, and why (data, design, analytic choices).',
  },
  {
    name: 'Who was studied',
    description: 'The sample under the microscope: who, where, when, which ages and platforms, and how far the finding can travel beyond them (other countries, other platforms, other years).',
  },
  {
    name: 'Since then',
    description: 'How later work, up to 2026, confirmed, refined or overturned this finding: a dated chain of studies, ending on where the question stands now.',
  },
  {
    name: 'What policy should take',
    description: 'What this finding does and does not justify for bans, age limits, design rules, schools and parents, set against the policy evidence in the collection.',
  },
  {
    name: "Explain like I'm 5",
    description: 'The finding as a picture story a five-year-old can follow, with the numbers and caveats kept for the grown-ups.',
  },
]

/* ---------- Parsing ---------- */

const FOOTNOTE = /\\\[(\d+)\\\]/g

/** Footnote numbers in a piece of the markdown. */
function footnotes(text: string): number[] {
  return [...text.matchAll(FOOTNOTE)].map((m) => Number(m[1]))
}

/** The markdown as plain text: no footnote markers, no emphasis, single spaces. */
function plain(text: string): string {
  return text
    .replace(FOOTNOTE, '')
    .replace(/\*\*/g, '')
    .replace(/(^|[\s(“"])\*([^*]+)\*/g, '$1$2')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
}

function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "Orben & Przybylski", "Twenge et al.", "Ferguson" from an APA author list. */
function shortAuthors(authors: string): string {
  const initials = /^(&\s*)?([A-Z][a-z]?\.(?:[\s-]?[A-Z][a-z]?\.)*)$/
  const surnames = authors
    .split(/,\s*/)
    .map((t) => t.replace(/^&\s*/, '').trim())
    .filter((t) => t && !initials.test(t) && !/^et al\.?$/.test(t))
  const etAl = /et al/.test(authors)
  if (!surnames.length) return authors
  if (etAl || surnames.length > 2) return `${surnames[0]} et al.`
  if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]}`
  return surnames[0]!
}

interface ParsedCitation {
  authors: string | null
  year: number
  title: string
  venue: string | null
}

function parseCitation(n: number, raw: string): ParsedCitation {
  const m = raw.match(/^(.*?) \((\d{4})(?:\/(\d{4}))?\)\. (.*)$/)
  if (!m) throw new Error(`#${n}: citation does not match "Authors (year). Title.": ${raw.slice(0, 80)}`)
  const authors = plain(m[1]!)
  const year = Number(m[2])
  const rest = m[4]!.trim()
  let title: string
  let venue: string | null = null
  const italicTitle = rest.match(/^\*([^*]+)\*\.?\s*(.*)$/)
  if (italicTitle) {
    title = italicTitle[1]!
    venue = plain(italicTitle[2]!).replace(/\.$/, '') || null
  } else {
    const withVenue = rest.match(/^(.*?[.?!])\s+\*([^*]+)\*/)
    if (withVenue) {
      title = withVenue[1]!.replace(/\.$/, '')
      venue = withVenue[2]!
    } else {
      const cut = rest.match(/^(.*?[.?!])\s+(.*)$/)
      title = (cut ? cut[1]! : rest).replace(/\.$/, '')
      venue = cut ? plain(cut[2]!).replace(/\.$/, '') || null : null
    }
  }
  const o = OVERRIDES[n] ?? {}
  return {
    authors: 'authors' in o ? (o.authors ?? null) : authors,
    year,
    title: plain(o.title ?? title),
    venue: 'venue' in o ? (o.venue ?? null) : venue ? plain(venue) : null,
  }
}

function parseSources(md: string): Map<number, Link> {
  const out = new Map<number, Link>()
  const at = md.indexOf('\n## Sources')
  if (at < 0) throw new Error('no "## Sources" section')
  for (const line of md.slice(at).split('\n')) {
    const m = line.match(/^(\d+)\. (.*)$/)
    if (!m) continue
    const n = Number(m[1])
    const body = m[2]!.trim()
    const md1 = body.match(/^\[(.*)\]\(<?(.+?)>?\)$/)
    const bare = body.match(/^<(.+)>$/)
    if (md1) out.set(n, { n, title: md1[1]!.replace(/\\([[\]])/g, '$1').trim(), url: md1[2]!.trim() })
    else if (bare) out.set(n, { n, title: bare[1]!.split('/').pop() || bare[1]!, url: bare[1]! })
    else throw new Error(`source ${n}: cannot read "${body.slice(0, 60)}"`)
  }
  return out
}

/** The bullets under a heading ("## Key Findings and Interpretation"), as plain text. */
function sectionItems(md: string, heading: string): string[] {
  const at = md.indexOf(`\n## ${heading}`)
  if (at < 0) throw new Error(`no "## ${heading}" section`)
  const body = md.slice(at + 4 + heading.length).split('\n## ')[0]!
  return body
    .split('\n')
    .map((l) => l.match(/^(?:\d+\.|-)\s+(.*)$/)?.[1])
    .filter((l): l is string => !!l)
    .map(plain)
}

/** Every "#N" and "#N–#M" a piece of text points to. */
function refs(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/#(\d+)(?:\s*[–-]\s*#(\d+))?/g)) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let i = a; i <= b; i++) out.push(i)
  }
  return out
}

function parse(md: string): Dataset {
  const lines = md.split('\n')
  const title = plain(lines[0]!.replace(/^#\s+/, ''))
  const summary = plain(lines.slice(1).join('\n').split('\n## ')[0]!.trim())

  // The overview table: theme number, name, strength of evidence, bottom line.
  const themes: Theme[] = []
  for (const l of lines) {
    const m = l.match(/^\| (\d)\. ([^|]+) \| ([^|]+) \| (.+) \|$/)
    if (!m) continue
    const n = Number(m[1])
    themes.push({ id: THEME_IDS[n]!, n, name: plain(m[2]!), strength: plain(m[3]!), bottom_line: plain(m[4]!) })
  }
  if (themes.length !== 7) throw new Error(`expected 7 themes in the overview table, found ${themes.length}`)

  const sources = parseSources(md)
  const studies: Study[] = []
  let theme: Theme | null = null
  let section: { id: string; name: string } | null = null
  let current: { n: number; head: string; tail: string; bullets: string[] } | null = null

  const flush = () => {
    if (!current || !theme) return
    const c = current
    current = null
    const cit = parseCitation(c.n, c.head)
    const allText = [c.head, c.tail, ...c.bullets].join(' ')
    const typeLine = c.bullets.find((b) => /^- \*\*Type(\/Sample)?:\*\*/.test(b))
    const findingsLine = c.bullets.find((b) => /^- \*\*Findings:\*\*/.test(b))
    if (!findingsLine) throw new Error(`#${c.n}: no Findings line`)
    const listed = c.tail.match(/DOI:\s*(10\.\d{4,9}\/[^\s\\[\]]+)/)?.[1]?.replace(/[.,]$/, '') ?? null
    const doi = listed ?? DOI_FILL[c.n] ?? null
    const link = c.tail.match(/<?(https?:\/\/[^\s>]+)>?/)?.[1] ?? null
    const arxiv = c.tail.match(/arXiv:(\d{4}\.\d{4,5})/)?.[1] ?? null
    const access = /\[OA(?: via PMC)?\]/.test(c.tail) ? 'open' : /\[Free copy/.test(c.tail) ? 'free-copy' : null
    const design = DESIGN_OF[c.n]
    if (!design) throw new Error(`#${c.n}: no design set in DESIGN_OF`)
    const study: Study = {
      n: c.n,
      id: '',
      label: '',
      authors: cit.authors,
      year: cit.year,
      title: cit.title,
      venue: cit.venue,
      citation: plain(c.head),
      doi,
      url: listed ? `https://doi.org/${listed}` : link ?? (arxiv ? `https://arxiv.org/abs/${arxiv}` : doi ? `https://doi.org/${doi}` : null),
      arxiv,
      access,
      theme: theme.id,
      section: section?.id ?? null,
      section_name: section?.name ?? null,
      design,
      type_sample: typeLine ? plain(typeLine.replace(/^- \*\*Type(\/Sample)?:\*\*/, '')) : null,
      findings: plain(findingsLine.replace(/^- \*\*Findings:\*\*/, '')),
      related: refs(allText).filter((r) => r !== c.n),
      flags: FLAGS[c.n] ?? [],
      sources: [...new Set(footnotes(allText))].map((f) => {
        const s = sources.get(f)
        if (!s) throw new Error(`#${c.n}: footnote ${f} is not in Sources`)
        return s
      }),
      openalex: null,
    }
    if (NOTES[c.n]) study.note = NOTES[c.n]
    studies.push(study)
  }

  for (const l of lines) {
    const t = l.match(/^## (\d)\. (.+)$/)
    if (t) {
      flush()
      theme = themes.find((x) => x.n === Number(t[1])) ?? null
      section = null
      continue
    }
    if (/^## /.test(l)) {
      flush()
      theme = null
      continue
    }
    const s = l.match(/^### (\d[a-z])\. (.+)$/)
    if (s) {
      flush()
      section = { id: s[1]!, name: plain(s[2]!) }
      continue
    }
    const e = l.match(/^\*\*(\d+)\. (.*)\*\*(.*)$/)
    if (e && theme) {
      flush()
      current = { n: Number(e[1]), head: e[2]!.trim(), tail: e[3]!.trim(), bullets: [] }
      continue
    }
    if (current && /^- \*\*/.test(l)) current.bullets.push(l)
  }
  flush()

  // Labels: "Orben & Przybylski 2019", with a/b where two share one.
  for (const s of studies) s.label = LABELS[s.n] ?? `${shortAuthors(s.authors ?? s.title)} ${s.year}`
  const count = new Map<string, number>()
  for (const s of studies) count.set(s.label, (count.get(s.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const s of studies) {
    if ((count.get(s.label) ?? 0) < 2) continue
    const i = seen.get(s.label) ?? 0
    seen.set(s.label, i + 1)
    s.label = `${s.label}${'abcdefgh'[i]}`
  }
  for (const s of studies) s.id = slug(s.label)

  // Related: the entry's own references, the references that point at it, and the hand-set debates.
  const rel = new Map<number, Set<number>>(studies.map((s) => [s.n, new Set(s.related)]))
  for (const s of studies) for (const r of s.related) rel.get(r)?.add(s.n)
  for (const group of DEBATES) for (const a of group) for (const b of group) if (a !== b) rel.get(a)?.add(b)
  for (const s of studies) s.related = [...rel.get(s.n)!].filter((r) => rel.has(r)).sort((a, b) => a - b)

  const gaps = sectionItems(md, 'Recommendations for Using This Collection').find((l) => /^Gaps to watch/i.test(l)) ?? ''
  return {
    collection: {
      title,
      edition: Number(title.match(/(\d{4}) edition/)?.[1] ?? 0),
      summary,
      tldr: sectionItems(md, 'TL;DR'),
      key_findings: sectionItems(md, 'Key Findings and Interpretation'),
      caveats: sectionItems(md, 'Caveats'),
      gaps: gaps.replace(/^Gaps to watch through \d{4}:\s*/i, ''),
      source: 'scripts/randomizer/sources/social-media-research-2026.md',
    },
    themes,
    designs: DESIGNS,
    studies,
    lenses: SEED_LENSES,
  }
}

/* ---------- OpenAlex ---------- */

const words = (s: string) => new Set(slug(s).split('-').filter((w) => w.length > 3))

/** Share of the collection title's longer words that OpenAlex's title also has. */
function titleOverlap(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size) return 1
  let hit = 0
  for (const w of wa) if (wb.has(w)) hit++
  return hit / wa.size
}

async function resolveOpenAlex(studies: Study[], known: Map<number, string | null>): Promise<string[]> {
  const warnings: string[] = []
  // One lookup per DOI: singleton lookups are free, list calls need OPENALEX_API_KEY.
  const key = process.env.OPENALEX_API_KEY?.trim()
  const queue = studies.filter((s) => s.doi)
  const one = async (s: Study) => {
    const url = `${OPENALEX}/works/doi:${encodeURIComponent(s.doi!)}?select=id,title${key ? `&api_key=${encodeURIComponent(key)}` : ''}`
    let res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
    for (let wait = 2_000; res.status === 429 && wait <= 16_000; wait *= 2) {
      await new Promise((r) => setTimeout(r, wait))
      res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
    }
    if (res.status === 404) {
      s.openalex = known.get(s.n) ?? null
      warnings.push(`#${s.n} ${s.label}: OpenAlex has no work for DOI ${s.doi}`)
      return
    }
    if (!res.ok) throw new Error(`OpenAlex answered HTTP ${res.status} for #${s.n}: run with --offline to keep the known ids`)
    const r = (await res.json()) as { id: string; title: string | null }
    s.openalex = r.id.split('/').pop() ?? null
    if (r.title && titleOverlap(s.title, r.title) < 0.5) warnings.push(`#${s.n} ${s.label}: OpenAlex's title for DOI ${s.doi} is "${r.title}": check the DOI`)
  }
  const workers = Array.from({ length: 2 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) await one(s)
  })
  await Promise.all(workers)
  return warnings
}

/* ---------- Main ---------- */

function validate(d: Dataset): void {
  if (d.studies.length !== 83) throw new Error(`expected 83 studies, found ${d.studies.length}`)
  d.studies.forEach((s, i) => {
    if (s.n !== i + 1) throw new Error(`entry ${i + 1} is numbered #${s.n}`)
    if (!d.designs.some((x) => x.id === s.design)) throw new Error(`#${s.n}: unknown design ${s.design}`)
    if (!s.url && !NOTES[s.n]) throw new Error(`#${s.n}: no DOI, link or arXiv id, and no note saying where to find it`)
  })
  if (new Set(d.studies.map((s) => s.id)).size !== d.studies.length) throw new Error('two studies share an id')
  for (const t of d.themes) if (!d.studies.some((s) => s.theme === t.id)) throw new Error(`theme without studies: ${t.name}`)
  for (const n of Object.keys(DESIGN_OF).map(Number)) if (n > d.studies.length) throw new Error(`DESIGN_OF has #${n}, which the collection does not`)
}

/** Everything but what the network fills (the OpenAlex ids) and what editors own (the lenses). */
function shape(d: Dataset): string {
  return JSON.stringify({ ...d, lenses: null, studies: d.studies.map((s) => ({ ...s, openalex: null })) })
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const offline = process.argv.includes('--offline')
  const existing: Dataset | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as Dataset) : null
  const next = parse(readFileSync(SOURCE, 'utf8'))
  validate(next)
  if (existing) next.lenses = existing.lenses

  const stale = !existing || shape(existing) !== shape(next)
  if (check) {
    if (stale) {
      console.error(`${OUT} is stale against ${SOURCE}: run pnpm randomizer:evidence-taxonomy`)
      process.exit(1)
    }
    console.log(`evidence.json is current: ${next.studies.length} studies, ${next.themes.length} themes, ${next.designs.length} designs, ${next.lenses.length} lenses`)
    return
  }

  const known = new Map((existing?.studies ?? []).map((s) => [s.n, s.openalex]))
  if (offline) {
    for (const s of next.studies) s.openalex = known.get(s.n) ?? null
  } else {
    for (const w of await resolveOpenAlex(next.studies, known)) console.warn(`  warning: ${w}`)
  }

  writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`wrote packages/randomizer/src/data/evidence.json: ${next.studies.length} studies, ${next.themes.length} themes, ${next.designs.length} designs, ${next.lenses.length} lenses${stale ? '' : ' (collection unchanged)'}`)
  for (const t of next.themes) {
    const row = next.designs.map((d) => `${d.id} ${next.studies.filter((s) => s.theme === t.id && s.design === d.id).length}`).join(', ')
    console.log(`  ${t.id.padEnd(14)} ${String(next.studies.filter((s) => s.theme === t.id).length).padStart(3)} (${row})`)
  }
  const noDoi = next.studies.filter((s) => !s.doi)
  console.log(`  no DOI (no live citation record): ${noDoi.map((s) => `#${s.n}`).join(', ')}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
