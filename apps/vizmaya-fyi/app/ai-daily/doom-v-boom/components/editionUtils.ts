/**
 * Small helpers shared by the edition's server and client components.
 * Keep this file free of DB imports — the client bundle pulls it in.
 */

import type { CSSProperties } from 'react'
import { timeHm } from '@vismay/content-source/dcEditionAssembly'
import { formatEditionDate, type DcEditionStory, type EditionGeo } from '@vismay/content-source/dcEditionTypes'
import { boomShare } from './particleRing'

/** Custom DOM event the canvas map and other client bits use to open the panel. */
export const PANEL_EVENT = 'dcd-panel'

export const CHAPTERS: { id: string; n: string; label: string }[] = [
  { id: 'glance', n: 'I', label: 'Doom v Boom' },
  { id: 'notes', n: 'II', label: 'Key notes' },
  { id: 'geo', n: 'III', label: 'By geography' },
  { id: 'layers', n: 'IV', label: 'By AI layer' },
  { id: 'papers', n: 'V', label: 'New research' },
  { id: 'energy', n: 'VI', label: 'AI + Energy' },
  { id: 'sources', n: 'VII', label: 'Sources' },
]

export function editionHref(date: string): string {
  return `/ai-daily/doom-v-boom/${date}`
}

/** The series landing: archive, trend and the link to the latest edition. */
export const SERIES_HREF = '/ai-daily/doom-v-boom'

/** The Doom v Boom reading (−1…+1) as the 0–100 Boom Score the hero ring shows. */
export function boomScore(score: number | null): number | null {
  return score == null ? null : Math.round(boomShare(score) * 100)
}

export const hm = timeHm

export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`
}

/** slug → {name, region} from the frozen geo block. */
export function placeIndex(geo: EditionGeo): Map<string, { name: string; region: string }> {
  return new Map(geo.places.map((p) => [p.slug, { name: p.name, region: p.region }]))
}

export function storyMinutes(s: DcEditionStory): number {
  const d = new Date(s.publishedAt)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** Inline style that hides an element's outline while keeping it focusable. */
export const noStyle: CSSProperties = {}

/**
 * Clip a label to what fits in `px` of an SVG timeline at its ~6.4 px/char
 * mono size. Returns '' when fewer than four characters would fit, so the
 * caller can move the text outside the bar instead.
 */
export function fitMono(text: string, px: number, charPx = 6.4): string {
  const max = Math.floor(px / charPx)
  if (text.length <= max) return text
  if (max < 4) return ''
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** '21 Sep 06:15 → 22 Sep 06:15 UTC' — hand-formatted so static output never depends on ICU data. */
export function windowLabel(windowStart: string, windowEnd: string): string {
  const f = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const day = formatEditionDate(d.toISOString().slice(0, 10), { weekday: false, year: false })
    return `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  return `${f(windowStart)} → ${f(windowEnd)} UTC`
}
