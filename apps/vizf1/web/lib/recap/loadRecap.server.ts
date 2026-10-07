import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadRecap as loadRecapRows, type RaceRecap } from '@vismay/f1-viz/recap'
import { loadRaceEvents } from '@/lib/raceEvents.server'

/**
 * The race's recap (@vismay/f1-viz/recap), with its pit stops and flag
 * periods from the race events (OpenF1, else the ingested flags). Null when
 * the session isn't ingested.
 */
export function loadRecap(db: SupabaseClient, sessionKey: string): Promise<RaceRecap | null> {
  return loadRecapRows(db, sessionKey, () => loadRaceEvents(db, sessionKey))
}
