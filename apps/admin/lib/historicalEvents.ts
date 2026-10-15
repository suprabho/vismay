import { createServiceClient } from '@vismay/content-source/supabase'
import { HISTORY_EVENTS_TABLE, type HistoryEvent, type HistoryVerdict } from '@footshorts/shared/historicalEvents'

// Private admin data: this path is only called after the admin allowlist gate;
// consumer routes never import it.
const COLUMNS = 'id,season,date,month,type,importance,competition,teams,team_names,people,summary,fee,source_url,origin,source_page,evidence,verified,notes,checked_by,checked_at'

/** True when the table has not been created yet (migration 20261015000000 not applied). */
function isMissingTable(message: string): boolean {
  return /admin_historical_events/.test(message) && /does not exist|schema cache|not find/i.test(message)
}
const MISSING_HINT = 'Season events are not set up yet. Apply the admin_historical_events migration, then push events with history:events-sync.'

/** Seasons that have events, newest first. */
export async function listHistorySeasons(): Promise<string[]> {
  const { data, error } = await createServiceClient().from(HISTORY_EVENTS_TABLE).select('season').order('season', { ascending: false }).limit(5000)
  if (error) throw new Error(isMissingTable(error.message) ? MISSING_HINT : `Could not load seasons: ${error.message}`)
  return [...new Set((data ?? []).map(r => r.season as string))]
}

export async function listHistoryEvents(season: string): Promise<HistoryEvent[]> {
  const { data, error } = await createServiceClient().from(HISTORY_EVENTS_TABLE).select(COLUMNS)
    .eq('season', season).order('date').order('importance', { ascending: false }).limit(2000)
  if (error) throw new Error(isMissingTable(error.message) ? MISSING_HINT : `Could not load events: ${error.message}`)
  return (data ?? []) as HistoryEvent[]
}

/** Save a verdict and/or note. A verdict change stamps who checked it and when. */
export async function updateHistoryEvent(
  id: string,
  patch: { verified?: '' | HistoryVerdict; notes?: string },
  checkedBy: string | null,
): Promise<HistoryEvent> {
  const update: Record<string, unknown> = { ...patch }
  if (patch.verified !== undefined) {
    update.checked_by = patch.verified ? checkedBy : null
    update.checked_at = patch.verified ? new Date().toISOString() : null
  }
  const { data, error } = await createServiceClient().from(HISTORY_EVENTS_TABLE).update(update).eq('id', id).select(COLUMNS).maybeSingle()
  if (error) throw new Error(isMissingTable(error.message) ? MISSING_HINT : `Could not save: ${error.message}`)
  if (!data) throw new Error('That event no longer exists. Reload the page.')
  return data as HistoryEvent
}
