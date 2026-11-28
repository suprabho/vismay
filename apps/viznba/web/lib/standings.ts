import type { Standings } from './espn'
import type { Team } from './teams'

export type ConfKey = 'west' | 'east'

/** "Western Conference" → 'west'. */
export function confKey(name: string): ConfKey {
  return name.toLowerCase().startsWith('west') ? 'west' : 'east'
}

export function confLabel(name: string): string {
  return name.replace(' Conference', '')
}

/** The tab to open: the one asked for, else the first followed team's conference, else West. */
export function pickConf(table: Standings, asked: string | undefined, followed: Team[]): ConfKey {
  if (asked === 'west' || asked === 'east') return asked
  for (const t of followed) {
    const c = table.conferences.find((x) => x.rows.some((r) => r.team.id === t.id))
    if (c) return confKey(c.name)
  }
  return 'west'
}

export function signed(n: number, digits = 0): string {
  const s = n.toFixed(digits)
  return n > 0 ? `+${s}` : s
}
