import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_FOLLOWED, teamById, type Team } from './teams'
import { ET, isValidTimeZone } from './time'
import { TEAMS_COOKIE, TZ_COOKIE } from './prefsShared'

/**
 * Viewer preferences live in two cookies so server components can render the
 * personalised pages directly: followed teams and the browser's time zone
 * (written by <TimeZoneSync/> on first load). No account needed.
 */
export async function getPrefs(): Promise<{ followed: Team[]; tz: string; tzDetected: boolean }> {
  const jar = await cookies()
  const rawTeams = jar.get(TEAMS_COOKIE)?.value
  const ids = rawTeams != null ? rawTeams.split(',').filter(Boolean) : DEFAULT_FOLLOWED
  const followed = ids.map(teamById).filter((t): t is Team => !!t)
  const rawTz = jar.get(TZ_COOKIE)?.value
  const tz = rawTz && isValidTimeZone(rawTz) ? rawTz : ET
  return { followed, tz, tzDetected: tz === rawTz }
}
