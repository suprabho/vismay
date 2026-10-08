export const TEAMS_COOKIE = 'viznba_teams'
export const TZ_COOKIE = 'viznba_tz'

/** One year; preferences are not sensitive. */
export function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}
