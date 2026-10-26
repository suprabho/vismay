'use client'

import { useEffect, useMemo } from 'react'
import { leagueMatches, resultsStrip, standings, type MatchRow, type StandingRow } from '@/lib/seasonBooks/matches'
import {
  bookSpreads, COMPETITIONS_WITH_MATCHES, leagueClubs, proposeHonourable, sameClub,
  type HonourableProposal, type PlannedSpread, type PlanV2,
} from '@/lib/seasonBooks/seasonSpreads'
import { useMatchData, type MatchEntry } from '../MatchData'

export interface LeagueData {
  league: string
  entry: MatchEntry | undefined
  /** Clubs in final-table order, once the matches are in. */
  clubs: string[]
  table: StandingRow[]
}

/** Every in-scope competition's matches, loaded once each; clubs per league in final-table order. */
export function useLeagueData(leagues: readonly string[]): Map<string, LeagueData> {
  const { get, load } = useMatchData()
  useEffect(() => { for (const l of leagues) if (COMPETITIONS_WITH_MATCHES.has(l)) load(l) }, [leagues, load])
  return useMemo(() => {
    const out = new Map<string, LeagueData>()
    for (const league of leagues) {
      const entry = COMPETITIONS_WITH_MATCHES.has(league) ? get(league) : { status: 'error' as const, error: 'No match data for this competition in the admin yet.' }
      const rows = entry?.status === 'ready' ? entry.matches : []
      out.set(league, { league, entry, clubs: entry?.status === 'ready' ? leagueClubs(rows) : [], table: entry?.status === 'ready' ? standings(leagueMatches(rows)) : [] })
    }
    return out
  }, [leagues, get])
}

/** The clubs the match data knows per in-scope league (only leagues whose matches have loaded). */
export function clubsByLeague(data: Map<string, LeagueData>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [league, d] of data) if (d.entry?.status === 'ready' && d.clubs.length) out.set(league, d.clubs)
  return out
}

/** Honourable-mention proposals from the European competitions with match data, minus clubs already in a league part. */
export function useHonourableProposals(plan: PlanV2): HonourableProposal[] {
  const { get, load } = useMatchData()
  const european = useMemo(() => plan.scope.european.filter(c => COMPETITIONS_WITH_MATCHES.has(c)), [plan.scope.european])
  useEffect(() => { for (const c of european) load(c) }, [european, load])
  const inScope = useMemo(() => plan.parts.flatMap(p => p.kind === 'league' ? [...p.teams, ...p.excluded.map(e => e.teamId)] : []), [plan.parts])
  return useMemo(() => {
    const out: HonourableProposal[] = []
    for (const c of european) {
      const entry = get(c)
      if (entry?.status !== 'ready') continue
      for (const p of proposeHonourable(c, entry.matches, inScope)) if (!out.some(o => sameClub(o.teamId, p.teamId))) out.push(p)
    }
    return out
  }, [european, get, inScope])
}

export interface SubjectData {
  /** The competition whose matches the subject lives in (a team's league, or the competition itself). */
  competition: string | null
  entry: MatchEntry | undefined
  rows: MatchRow[]
  /** For a team: its league games in order. */
  strip: ReturnType<typeof resultsStrip>
  /** For a team or league: the final table. */
  table: StandingRow[]
}

/** A spread subject's match data: a team's league games, a league's table, a competition's matches. */
export function useSubjectData(spread: PlannedSpread | null): SubjectData {
  const competition = spread ? (spread.kind === 'team' ? spread.league ?? null : spread.subjectId) : null
  const { get, load } = useMatchData()
  const known = !!competition && COMPETITIONS_WITH_MATCHES.has(competition)
  useEffect(() => { if (competition && known) load(competition) }, [competition, known, load])
  return useMemo(() => {
    const entry = competition ? (known ? get(competition) : { status: 'error' as const, error: 'No match data for this competition in the admin yet.' }) : undefined
    const rows = entry?.status === 'ready' ? entry.matches : []
    const league = spread?.kind === 'competition' ? rows : leagueMatches(rows)
    return {
      competition,
      entry,
      rows,
      strip: spread?.kind === 'team' ? resultsStrip(league, spread.subjectId) : [],
      table: spread?.kind === 'competition' ? [] : standings(league),
    }
  }, [competition, known, get, spread])
}

/** The spreads of a plan, memoised. */
export function usePlannedSpreads(plan: PlanV2): PlannedSpread[] {
  return useMemo(() => bookSpreads(plan), [plan])
}
