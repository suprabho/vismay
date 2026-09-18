import { createServiceClient } from '@vismay/content-source/supabase'
import { ESPN_CUPS, ESPN_CUP_TABLE, type CupFixture } from '@footshorts/shared/espnCups'

// Do not send the raw archive payload to the browser. This data path is only
// called after the admin allowlist gate; consumer routes never import it.
const COLUMNS = 'espn_event_id,competition_slug,espn_competition_code,season_start,round_label,kickoff_at,kickoff_time_confirmed,status,status_detail,home_espn_id,away_espn_id,home_team_name,away_team_name,home_score,away_score,home_penalties,away_penalties,winner_espn_id,venue,notes,source_url,fetched_at'

export function findEspnCup(slug: string) {
  return ESPN_CUPS.find(c => c.slug === slug)
}

export async function listEspnCups(season: number, competition?: string): Promise<CupFixture[]> {
  const sb = createServiceClient()
  const rows: CupFixture[] = []
  for (let offset = 0; offset < 5000; offset += 1000) {
    let query = sb.from(ESPN_CUP_TABLE).select(COLUMNS).eq('season_start', season)
      .order('kickoff_at', { ascending: true, nullsFirst: false }).order('espn_event_id')
      .range(offset, offset + 999)
    if (competition) query = query.eq('competition_slug', competition)
    const { data, error } = await query
    if (error) throw new Error(`Could not load cup fixtures: ${error.message}`)
    rows.push(...(data ?? []) as CupFixture[])
    if ((data?.length ?? 0) < 1000) return rows
  }
  throw new Error('Too many matches to display together. Select one competition.')
}
