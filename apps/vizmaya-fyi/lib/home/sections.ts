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
 * - `figures`: one large live tile beside headlines led by the number in each title.
 * - `strip`: a row of tall live tiles that scrolls sideways, with arrows, on a dotted ground.
 * - `ledger`: a numbered list, type only, on paper.
 * - `mosaic`: one large live tile with two smaller ones stacked beside it.
 * - `plates`: framed live previews in a row, captioned underneath like plates in a book.
 * - `columns`: newspaper columns, type only, between rules.
 */
export type SectionLayout = 'figures' | 'strip' | 'ledger' | 'mosaic' | 'plates' | 'columns'

export interface HomeSectionDef {
  category: StoryCategoryId
  /** The heading: plain words, then the word set in italic in the section's accent. */
  title: [string, string]
  /** One line under the heading on what the section covers. */
  line: string
  /** The short name in the section index. */
  label: string
  layout: SectionLayout
  /** One of the scheme's three logo colours. */
  accent: 'signal' | 'second' | 'third'
}

export const HOME_SECTIONS: HomeSectionDef[] = [
  {
    category: 'economy',
    title: ['Money &', 'markets'],
    line: 'Companies, filings, trade and commodities: who makes the money, and how.',
    label: 'Economy',
    layout: 'figures',
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
    layout: 'mosaic',
    accent: 'third',
  },
  {
    category: 'history',
    title: ['History &', 'culture'],
    line: 'The past, its people and places, and the record behind the legend.',
    label: 'History',
    layout: 'plates',
    accent: 'second',
  },
  {
    category: 'society',
    title: ['Society &', 'health'],
    line: 'How people live, learn, work and stay well, in the studies that measured it.',
    label: 'Society',
    layout: 'columns',
    accent: 'third',
  },
]

/** A category needs this many stories below the wall to get a section. */
export const SECTION_MIN = 3

/** How many stories each layout shows. */
export const SECTION_LIMIT: Record<SectionLayout, number> = { figures: 5, strip: 8, ledger: 6, mosaic: 3, plates: 4, columns: 6 }

const FIGURE = /(?:[$₹£€]\s?\d[\d,.]*\d?(?:\s?(?:bn|tn|trillion|billion|million|[BMKk]\b))?|\d[\d,.]*\d?(?:%|x\b|\s?(?:bn|tn|trillion|billion|million|GW|MW)\b|[BM]\b))/

/**
 * The number a headline is built on ("$490B", "18%", "0.36x"), for the
 * `figures` layout: an amount of money, a share, a multiple or a quantity
 * with its unit. A bare number (a year, a count) is not one.
 */
export function headlineFigure(title: string): string | undefined {
  return FIGURE.exec(title)?.[0].replace(/\s+/g, ' ')
}

/** The archive filtered to one category. */
export function categoryArchiveHref(category: StoryCategoryId): string {
  return `/stories?category=${category}`
}
