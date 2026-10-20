/**
 * The season-spread templates' geometry, transcribed from the six reference
 * spreads on the design canvas (Barcelona, Manchester United, Chelsea and
 * Arsenal 2003–04 team spreads; the Premier League spread *Nobody Beat
 * Arsenal*; the Champions League spread *The Outsiders*). Pure data: the
 * canvas, the shared page-1 frame, every module's region per template in
 * points, the type scale, the icons and the reference palettes. The builder's
 * `SPREAD_CANVAS` / `SPREAD_TEMPLATES` / `SPREAD_TYPE_SCALE` / `SPREAD_ICONS`
 * exports, kept here until system.ts moves to v2.
 */
import type { PaletteRole, SpreadKind } from './seasonSpreads'

/** 1190 × 842 pt, fold at x 595, margins 40, content x 40–555 and 625–1150, footer rule y 790. RGB proof, no bleed. */
export const SPREAD_CANVAS = {
  width: 1190,
  height: 842,
  fold: 595,
  margin: 40,
  pages: [{ x0: 40, x1: 555 }, { x0: 625, x1: 1150 }] as const,
  footerRule: 790,
  /** Nothing meaningful within this of the fold. */
  foldGap: 40,
  /** At least this between stacked blocks. */
  blockGap: 16,
  minType: 6.5,
} as const

export interface Region {
  /** Module id, or a frame part (`kicker`, `headline`, `mark`, `story-stat`, `story`, `footer`). */
  id: string
  page: 1 | 2
  x: number
  y: number
  w: number
  h: number
  /** Header set over the region, in the reference's wording. */
  title?: string
  /** Lower runs first when page 2 overflows. */
  reflow?: number
}

/** The page-1 frame every template shares. */
export const FRAME_REGIONS: readonly Region[] = [
  { id: 'kicker', page: 1, x: 40, y: 32, w: 400, h: 12 },
  { id: 'headline', page: 1, x: 38, y: 76, w: 420, h: 112 },
  { id: 'mark', page: 1, x: 470, y: 45, w: 76, h: 84 },
  { id: 'story-stat', page: 1, x: 40, y: 222, w: 200, h: 70 },
  { id: 'story', page: 1, x: 40, y: 300, w: 205, h: 85 },
  { id: 'marks-note', page: 1, x: 40, y: 777, w: 515, h: 8 },
  { id: 'footer', page: 1, x: 40, y: 790, w: 515, h: 20 },
  { id: 'sources', page: 2, x: 625, y: 790, w: 525, h: 20 },
]

/** Module regions per template, from the reference spreads. */
export const SPREAD_TEMPLATES: Record<SpreadKind, { version: string; reference: string; regions: readonly Region[] }> = {
  team: {
    version: 'team@1.2',
    reference: 'Barcelona, Manchester United, Chelsea and Arsenal 2003–04',
    regions: [
      { id: 'climb', page: 1, x: 250, y: 222, w: 305, h: 160, title: 'The climb / League position' },
      { id: 'calendar', page: 1, x: 40, y: 412, w: 515, h: 215, title: 'Season / All competitive games' },
      { id: 'key-moments', page: 1, x: 40, y: 642, w: 515, h: 28 },
      { id: 'season-record', page: 1, x: 40, y: 680, w: 515, h: 60, title: 'Season record' },
      { id: 'cup-runs', page: 2, x: 625, y: 32, w: 525, h: 225, reflow: 1 },
      { id: 'coach', page: 2, x: 625, y: 273, w: 150, h: 110, title: 'The side / Coach and most-used XI' },
      { id: 'xis', page: 2, x: 790, y: 295, w: 360, h: 100 },
      { id: 'bubble', page: 2, x: 625, y: 409, w: 525, h: 170, title: 'The people', reflow: 3 },
      { id: 'transfers', page: 2, x: 625, y: 593, w: 250, h: 180, title: 'The window / In and out' },
      { id: 'radar', page: 2, x: 895, y: 593, w: 255, h: 185, title: 'The team / Against the league' },
      { id: 'appearances', page: 2, x: 625, y: 593, w: 250, h: 180, reflow: 5 },
      { id: 'heatmap', page: 2, x: 625, y: 593, w: 525, h: 180, reflow: 4 },
    ],
  },
  league: {
    version: 'league@1.0',
    reference: 'Premier League 2003–04, Nobody Beat Arsenal',
    regions: [
      { id: 'race', page: 1, x: 275, y: 222, w: 280, h: 260, title: 'The race / League points' },
      { id: 'lead', page: 1, x: 40, y: 506, w: 515, h: 170, title: 'The lead / Top of the table, every matchday' },
      { id: 'season-record', page: 1, x: 40, y: 690, w: 515, h: 80, title: 'Season record / 380 league games' },
      { id: 'table', page: 2, x: 635, y: 32, w: 515, h: 340, title: 'The table / Final standings and every result in order' },
      { id: 'players', page: 2, x: 635, y: 386, w: 515, h: 200, title: 'The players / Awards and honours' },
      { id: 'signings', page: 2, x: 635, y: 606, w: 515, h: 170, title: 'The money' },
    ],
  },
  competition: {
    version: 'competition@1.0',
    reference: 'Champions League 2003–04, The Outsiders',
    regions: [
      { id: 'field', page: 1, x: 262, y: 222, w: 294, h: 176, title: 'The field' },
      { id: 'bracket', page: 1, x: 40, y: 414, w: 515, h: 246, title: 'The knockouts / Round of 16 to the final' },
      { id: 'season-record', page: 1, x: 40, y: 676, w: 515, h: 70, title: 'Season record' },
      { id: 'groups', page: 2, x: 625, y: 32, w: 525, h: 218, title: 'The groups' },
      { id: 'finalists', page: 2, x: 625, y: 262, w: 525, h: 130, title: 'The finalists' },
      { id: 'final', page: 2, x: 625, y: 404, w: 525, h: 208, title: 'The final' },
      { id: 'scorers', page: 2, x: 625, y: 624, w: 255, h: 158, title: 'The scorers / Five goals or more' },
      { id: 'oddities', page: 2, x: 900, y: 624, w: 250, h: 158, title: 'The oddities / Six things that happened' },
    ],
  },
}

export function regionOf(kind: SpreadKind, id: string): Region | undefined {
  return SPREAD_TEMPLATES[kind].regions.find(r => r.id === id) ?? FRAME_REGIONS.find(r => r.id === id)
}

export interface SpreadTypeStyle {
  role: string
  label: string
  sizePt: number
  leadingPt: number
  weight: number
  caps?: boolean
  tracking?: string
  stretch?: string
  use: string
}

/** Archivo throughout; sizes in pt on the 1190 × 842 canvas. */
export const SPREAD_TYPE_SCALE: readonly SpreadTypeStyle[] = [
  { role: 'headline', label: 'Headline', sizePt: 55, leadingPt: 56, weight: 800, caps: true, tracking: '-0.01em', use: 'The claim, two lines' },
  { role: 'story-number', label: 'Story number', sizePt: 53, leadingPt: 53, weight: 800, use: 'The one story statistic, in highlight' },
  { role: 'record-metric', label: 'Record metric', sizePt: 25, leadingPt: 26, weight: 800, use: 'Season record figures (38 pt on competition spreads)' },
  { role: 'body', label: 'Body', sizePt: 12, leadingPt: 17, weight: 400, use: 'Story copy, at most 30 words' },
  { role: 'section', label: 'Section', sizePt: 10, leadingPt: 12, weight: 700, caps: true, use: 'Module headers, with a 16 pt icon' },
  { role: 'label', label: 'Label', sizePt: 7.5, leadingPt: 9, weight: 500, caps: true, tracking: '0.04em', use: 'Stat labels, axis labels, legends' },
  { role: 'code', label: 'Code', sizePt: 13, leadingPt: 14, weight: 800, tracking: '0.06em', stretch: '75%', use: 'Club, league and competition codes under their marks' },
  { role: 'detail', label: 'Detail', sizePt: 6.5, leadingPt: 8, weight: 400, use: 'Notes, sources, marks line; never smaller' },
  { role: 'running', label: 'Running line', sizePt: 8.5, leadingPt: 10, weight: 400, tracking: '0.03em', use: 'Footer: subject / season • headline' },
]

/** 16 pt outline icons, 1.1 pt stroke, drawn in the highlight colour. */
export const SPREAD_ICONS: Record<string, string> = {
  trend: 'M1.5 1.5 V14.5 H14.5 M3.5 11 L7 7 L9.5 9 L14 4',
  calendar: 'M1.5 3 h13 v11.5 h-13 Z M1.5 6.5 H14.5 M5 1.5 V4.5 M11 1.5 V4.5 M5 9.5 h0.01 M8 9.5 h0.01 M11 9.5 h0.01 M5 12 h0.01 M8 12 h0.01',
  trophy: 'M5 2 H11 V6 A3 3 0 0 1 5 6 Z M5 3 H2.5 A2.5 2.5 0 0 0 5 7.5 M11 3 H13.5 A2.5 2.5 0 0 1 11 7.5 M8 9 V12 M5 14 H11 M6 12 H10',
  people: 'M8 2.5 a2.5 2.5 0 1 0 0.01 0 M3.5 14 A4.5 4.5 0 0 1 12.5 14 M2.5 4.5 a1.5 1.5 0 1 0 0.01 0 M13.5 4.5 a1.5 1.5 0 1 0 0.01 0',
  transfer: 'M1.5 5 H13.5 M10.5 2 L13.5 5 L10.5 8 M14.5 11 H2.5 M5.5 8 L2.5 11 L5.5 14',
  radar: 'M8 1.5 L13.6 4.75 V11.25 L8 14.5 L2.4 11.25 V4.75 Z M8 4.5 L11 6.25 V9.75 L8 11.5 L5 9.75 V6.25 Z',
  map: 'M1.5 1.5 h5.5 v5.5 h-5.5 Z M9 1.5 h5.5 v5.5 h-5.5 Z M1.5 9 h5.5 v5.5 h-5.5 Z M9 9 h5.5 v5.5 h-5.5 Z',
  bracket: 'M1.5 3 H5 V8 H1.5 M5 5.5 H8 M14.5 3 H11 V8 H14.5 M11 5.5 H8 M8 5.5 V13',
  pitch: 'M1.5 2.5 h13 v11 h-13 Z M8 2.5 V13.5 M8 8 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
  clock: 'M8 1.5 a6.5 6.5 0 1 0 0.01 0 M8 4.5 V8 L10.5 9.5',
  table: 'M1.5 2.5 h13 v11 h-13 Z M1.5 6 H14.5 M1.5 9.5 H14.5 M6 2.5 V13.5',
  money: 'M8 1.5 a6.5 6.5 0 1 0 0.01 0 M8 4 V12 M10 6 H7 a1.5 1.5 0 0 0 0 3 h2 a1.5 1.5 0 0 1 0 3 H6',
}

/** Forward, midfield, defence, goalkeeper: fixed across the book. */
export const POSITION_COLOURS = { FW: '#E7B94C', MF: '#EF7594', DF: '#75BCE9', GK: '#FFFFFF' } as const

/** The reference spreads' palettes, by spread key. Per-club values belong in `admin_club_marks`; these six are the canvas references. */
export const REFERENCE_PALETTES: Record<string, Partial<Record<PaletteRole, string>>> = {
  'team:barcelona': { page1Ground: '#164F91', page2Ground: '#10243A', accent: '#A82045', eliminationCard: '#72243E', highlight: '#E7B94C' },
  'team:manchester-united': { page1Ground: '#B01E2B', page2Ground: '#2A0E12', accent: '#15161A', highlight: '#F2C14E' },
  'team:man-united': { page1Ground: '#B01E2B', page2Ground: '#2A0E12', accent: '#15161A', highlight: '#F2C14E' },
  'team:chelsea': { page1Ground: '#034694', page2Ground: '#0B1F3A', accent: '#D7263D', highlight: '#F2C94C' },
  'team:arsenal': { page1Ground: '#C8102E', page2Ground: '#0E1B33', accent: '#0A2A5C', highlight: '#F4C542' },
  'comp:champions-league': { page1Ground: '#0E1E5B', page2Ground: '#0A1440', accent: '#D7263D', highlight: '#F2C94C', draw: '#C9D1DC' },
  'league:premier-league': { page1Ground: '#3B1C6B', page2Ground: '#120F24', highlight: '#F4C542' },
}

/** The stand-in palette for spreads with no reference: the series navy with the series gold. */
export const DEFAULT_SPREAD_PALETTE: Record<PaletteRole, string> = {
  page1Ground: '#164F91',
  page2Ground: '#10243A',
  accent: '#A82045',
  eliminationCard: '#4A0D13',
  highlight: '#E7B94C',
  text: '#FFFFFF',
  draw: '#C9D1DC',
  grid: '#2E3F5E',
  card: '#22365A',
}

/** The result dot colours on a spread: win highlight, draw draw, loss accent. */
export function resultColours(p: Record<PaletteRole, string>): Record<'W' | 'D' | 'L', string> {
  return { W: p.highlight, D: p.draw, L: p.accent }
}
