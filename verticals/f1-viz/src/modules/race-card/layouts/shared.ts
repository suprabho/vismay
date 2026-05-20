import { findGrandPrix, flagUrl as bundledFlagUrl } from '../../../data/grands-prix'
import type { RaceCardConfig } from '../index'

export interface ResolvedRace {
  gpName: string
  country: string
  circuit: string
  accent: string
  flagSrc: string | null
  dateLabel: string | null
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function resolveRace(config: RaceCardConfig): ResolvedRace {
  const entry = findGrandPrix(config.grandPrix)
  const flag = config.flagUrl ?? (entry ? bundledFlagUrl(entry.code, 320) : null)
  return {
    gpName: entry?.name ?? config.grandPrix,
    country: entry?.country ?? '',
    circuit: config.circuit ?? entry?.circuit ?? '',
    accent: config.accent ?? entry?.accent ?? '#E10600',
    flagSrc: flag,
    dateLabel: config.dateLabel ?? formatDate(config.date),
  }
}

export function darken(hex: string, amount: number): string {
  const c = parseHex(hex)
  if (!c) return hex
  const t = Math.max(0, Math.min(1, amount))
  const r = Math.round(c.r * (1 - t))
  const g = Math.round(c.g * (1 - t))
  const b = Math.round(c.b * (1 - t))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function accentWash(accent: string): string {
  return `radial-gradient(120% 100% at 20% 10%, ${accent} 0%, ${darken(accent, 0.55)} 100%)`
}
