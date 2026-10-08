/**
 * Thin client for ESPN's public NBA site API (no key). Only the fields the
 * roster seed needs are typed; ESPN returns a lot more.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

export type EspnTeam = {
  id: string
  abbreviation: string
  location: string
  name: string
  displayName: string
  color?: string
  alternateColor?: string
  logos?: Array<{ href: string; rel?: string[] }>
}

export type EspnAthlete = {
  id: string
  firstName: string
  lastName: string
  displayName: string
  jersey?: string
  dateOfBirth?: string
  position?: { abbreviation?: string }
  headshot?: { href?: string }
}

export type EspnCoach = { id: string; firstName: string; lastName: string }

async function getJson<T>(path: string, base = BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VizNBA/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`ESPN ${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function fetchTeams(): Promise<EspnTeam[]> {
  const data = await getJson<{
    sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeam }> }> }>
  }>('/teams')
  return data.sports[0]?.leagues[0]?.teams.map((t) => t.team) ?? []
}

export async function fetchRoster(
  espnTeamId: string,
): Promise<{ athletes: EspnAthlete[]; coaches: EspnCoach[] }> {
  const data = await getJson<{ athletes?: EspnAthlete[]; coach?: EspnCoach[] }>(
    `/teams/${espnTeamId}/roster`,
  )
  return { athletes: data.athletes ?? [], coaches: data.coach ?? [] }
}

const SEARCH = 'https://site.web.api.espn.com/apis/search/v2'
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'
/** NBA athletes carry uids like `s:40~l:46~a:4140`. */
const NBA_UID = /^s:40~l:46~a:(\d+)$/

/**
 * ESPN athlete for a name, current or historical — ESPN keeps retired players
 * (and coaches who played, e.g. Gregg Popovich) as inactive athletes. Only an
 * exact display-name match counts; null when the search has none.
 */
export async function findAthlete(name: string): Promise<EspnAthlete | null> {
  const data = await getJson<{
    results?: Array<{ contents?: Array<{ displayName?: string; uid?: string }> }>
  }>(`?query=${encodeURIComponent(name)}&limit=10`, SEARCH)
  const want = name.toLowerCase()
  for (const group of data.results ?? []) {
    for (const c of group.contents ?? []) {
      const id = c.uid?.match(NBA_UID)?.[1]
      if (id && c.displayName?.toLowerCase() === want) {
        return getJson<EspnAthlete>(`/athletes/${id}`, CORE)
      }
    }
  }
  return null
}
