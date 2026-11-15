import type { StoryCategoryId } from '@vismay/html-stories/categories'

/**
 * The home page's category sections: under the wall, one section per story
 * category (@vismay/html-stories/categories), each with its own layout and
 * accent so the page changes pace as it goes down.
 *
 * Pure, so the client can import it. The order here is the order on the page.
 */

/**
 * How a section is laid out:
 * - `feature`: one large live tile beside a list of headlines.
 * - `strip`: a row of tall tiles that scrolls sideways.
 * - `trio`: three live tiles on a raised band.
 * - `ledger`: a numbered list with no previews, on paper or on the dark surface.
 */
export type SectionLayout = 'feature' | 'strip' | 'trio' | 'ledger'

export interface HomeSectionDef {
  category: StoryCategoryId
  /** The heading: plain words, then the word set in italic in the section's accent. */
  title: [string, string]
  /** One line under the heading on what the section covers. */
  line: string
  /** The short name in the section index. */
  label: string
  layout: SectionLayout
  /** The lead tile on the right (feature) or the dark surface instead of paper (ledger). */
  alt?: boolean
  /** One of the scheme's three logo colours. */
  accent: 'signal' | 'second' | 'third'
}

export const HOME_SECTIONS: HomeSectionDef[] = [
  {
    category: 'economy',
    title: ['Money &', 'markets'],
    line: 'Companies, filings, trade and commodities: who makes the money, and how.',
    label: 'Economy',
    layout: 'feature',
    accent: 'signal',
  },
  {
    category: 'ai-tech',
    title: ['AI &', 'technology'],
    line: 'Papers, chips and compute, and the machines being built on them.',
    label: 'AI & Tech',
    layout: 'strip',
    accent: 'second',
  },
  {
    category: 'science',
    title: ['The', 'science'],
    line: 'Physics, life, mathematics and space, one result at a time.',
    label: 'Science',
    layout: 'ledger',
    accent: 'signal',
  },
  {
    category: 'politics',
    title: ['Politics & the', 'world'],
    line: 'Elections, governments, wars and the deals between them.',
    label: 'Politics',
    layout: 'trio',
    accent: 'third',
  },
  {
    category: 'history',
    title: ['History &', 'culture'],
    line: 'The past, its people and places, and the record behind the legend.',
    label: 'History',
    layout: 'feature',
    alt: true,
    accent: 'second',
  },
  {
    category: 'society',
    title: ['Society &', 'health'],
    line: 'How people live, learn, work and stay well, in the studies that measured it.',
    label: 'Society',
    layout: 'ledger',
    alt: true,
    accent: 'third',
  },
]

/** A category needs this many stories below the wall to get a section. */
export const SECTION_MIN = 3

/** How many stories each layout shows. */
export const SECTION_LIMIT: Record<SectionLayout, number> = { feature: 5, strip: 8, trio: 3, ledger: 8 }
