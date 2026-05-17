/**
 * Shared types + helpers across VizF1 apps.
 *
 * Mirrors apps/footshort/shared. Holds Supabase client factory, F1 domain
 * types (Race, Driver, Constructor, LapTime, …) once they exist.
 */

export interface RaceMeta {
  season: number
  round: number
  grandPrix: string
  date: string
}

export interface DriverMeta {
  id: string
  name: string
  constructor: string
}
