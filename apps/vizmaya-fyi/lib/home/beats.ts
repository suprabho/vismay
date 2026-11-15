/**
 * The home page's beats: the sections under the wall, one per kind of story
 * vizmaya publishes. A beat is one or more randomizer desks (a published HTML
 * story is tied to the spin that picked its topic, `randomizer_spins`), so a
 * story lands in its beat with no tagging by hand. Each beat has its own
 * layout and accent, so the page changes pace as it goes down.
 *
 * Pure, so the client can import it. The order here is the order on the page.
 */

/**
 * How a beat is laid out:
 * - `feature`: one large live tile beside a list of headlines.
 * - `strip`: a row of tall tiles that scrolls sideways.
 * - `trio`: three live tiles on a raised band.
 * - `ledger`: a numbered list with no previews, on paper or on the dark surface.
 */
export type BeatLayout = 'feature' | 'strip' | 'trio' | 'ledger'

export interface Beat {
  id: string
  /** The heading: plain words, then the word set in italic in the beat's accent. */
  title: [string, string]
  /** One line under the heading on what the beat covers. */
  line: string
  /** The short name in the beat index and the bar. */
  label: string
  layout: BeatLayout
  /** The lead tile on the right (feature) or the dark surface instead of paper (ledger). */
  alt?: boolean
  /** One of the scheme's three logo colours. */
  accent: 'signal' | 'second' | 'third'
  /**
   * The desks whose stories belong here, each with the reel that names a
   * story's subject in its meta line (the country, the prize, the field).
   */
  desks: Record<string, string>
}

export const BEATS: Beat[] = [
  {
    id: 'industries',
    title: ['The', 'industries'],
    line: 'One industry at a time, through one lens, with the numbers behind it.',
    label: 'Industries',
    layout: 'feature',
    accent: 'signal',
    desks: { desk: 'industry' },
  },
  {
    id: 'atlas',
    title: ['The', 'atlas'],
    line: 'A country and one thread of its culture, traced on the map.',
    label: 'Atlas',
    layout: 'strip',
    accent: 'second',
    desks: { atlas: 'country' },
  },
  {
    id: 'hundred',
    title: ['The', 'hundred'],
    line: "Michael Hart's ranking of the most influential people in history, tested against the record.",
    label: 'The 100',
    layout: 'ledger',
    accent: 'signal',
    desks: { hundred: 'domain' },
  },
  {
    id: 'myths',
    title: ['Myths,', 'mapped'],
    line: 'The routes of the old epics, place by place.',
    label: 'Myths',
    layout: 'trio',
    accent: 'third',
    desks: { epics: 'epic' },
  },
  {
    id: 'ideas',
    title: ['Big', 'ideas'],
    line: 'Prize-winning research and lecture notes, one idea at a time.',
    label: 'Ideas',
    layout: 'feature',
    alt: true,
    accent: 'second',
    desks: { landmark: 'prize', ocw: 'field' },
  },
  {
    id: 'frontier',
    title: ['The AI', 'frontier'],
    line: 'New papers from arXiv, read past the abstract.',
    label: 'Frontier',
    layout: 'strip',
    accent: 'third',
    desks: { frontier: 'area' },
  },
  {
    id: 'checked',
    title: ['Claims,', 'checked'],
    line: 'What the studies and the sources can support, and what they cannot.',
    label: 'Checked',
    layout: 'ledger',
    alt: true,
    accent: 'second',
    desks: { evidence: 'theme', curious: 'theme' },
  },
]

/** A beat needs this many stories to get a section. */
export const BEAT_MIN = 3

/** How many stories each layout shows. */
export const BEAT_LIMIT: Record<BeatLayout, number> = { feature: 5, strip: 8, trio: 3, ledger: 8 }

const BY_DESK = new Map(BEATS.flatMap((b) => Object.keys(b.desks).map((d) => [d, b] as const)))

/** The beat a desk's stories belong to. */
export function beatForDesk(desk: string): Beat | undefined {
  return BY_DESK.get(desk)
}

/** A reel as a spin stores it. */
export interface BeatReel {
  value?: string
  sub?: string
}

/**
 * What a spin says about its story: the subject for the meta line, and, where
 * the desk has one, a mark for the ledger (a rank in The 100, a claim's grade).
 */
export function spinLabels(desk: string, reels: Record<string, BeatReel | undefined>): { topic?: string; mark?: string } {
  const beat = BY_DESK.get(desk)
  if (!beat) return {}
  const topic = reels[beat.desks[desk]]?.value?.trim() || undefined
  if (desk === 'hundred') {
    const rank = /^#(\d{1,3})\b/.exec(reels.person?.sub ?? '')?.[1]
    return { topic, mark: rank }
  }
  if (desk === 'curious') {
    const grade = /^Grade ([A-E])\b/.exec(reels.claim?.sub ?? '')?.[1]
    return { topic: grade ? [topic, `Grade ${grade}`].filter(Boolean).join(' · ') : topic }
  }
  return { topic }
}
