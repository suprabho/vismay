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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
