import { z } from 'zod'

/**
 * Zod schemas for the Jolpica-F1 (Ergast-compatible) API surface.
 *
 * Jolpica returns an `MRData` envelope around every payload. Each schema here
 * matches the deepest object the app actually consumes; the envelope is
 * unwrapped in apps/vizf1/web/lib/jolpica.ts before parsing.
 *
 * Docs: https://github.com/jolpica/jolpica-f1
 */

// =====================================================
// Schedule
// =====================================================

export const RaceLocationSchema = z.object({
  lat: z.string(),
  long: z.string(),
  locality: z.string(),
  country: z.string(),
})

export const CircuitSchema = z.object({
  circuitId: z.string(),
  url: z.string().url().optional(),
  circuitName: z.string(),
  Location: RaceLocationSchema,
})

export const RaceSchema = z.object({
  season: z.string(),
  round: z.string(),
  url: z.string().url().optional(),
  raceName: z.string(),
  Circuit: CircuitSchema,
  date: z.string(), // YYYY-MM-DD
  time: z.string().optional(), // HH:MM:SSZ
  // Sprint metadata is present only on sprint weekends.
  Sprint: z
    .object({
      date: z.string(),
      time: z.string().optional(),
    })
    .optional(),
})
export type RaceApi = z.infer<typeof RaceSchema>

// =====================================================
// Driver standings
// =====================================================

export const DriverSchema = z.object({
  driverId: z.string(),
  permanentNumber: z.string().optional(),
  code: z.string().optional(),
  url: z.string().url().optional(),
  givenName: z.string(),
  familyName: z.string(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
})
export type DriverApi = z.infer<typeof DriverSchema>

export const ConstructorSchema = z.object({
  constructorId: z.string(),
  url: z.string().url().optional(),
  name: z.string(),
  nationality: z.string().optional(),
})
export type ConstructorApi = z.infer<typeof ConstructorSchema>

export const DriverStandingSchema = z.object({
  position: z.string(),
  positionText: z.string().optional(),
  points: z.string(),
  wins: z.string(),
  Driver: DriverSchema,
  Constructors: z.array(ConstructorSchema),
})
export type DriverStandingApi = z.infer<typeof DriverStandingSchema>

// =====================================================
// Constructor standings
// =====================================================

export const ConstructorStandingSchema = z.object({
  position: z.string(),
  positionText: z.string().optional(),
  points: z.string(),
  wins: z.string(),
  Constructor: ConstructorSchema,
})
export type ConstructorStandingApi = z.infer<typeof ConstructorStandingSchema>

// =====================================================
// Race results
// =====================================================

export const RaceResultSchema = z.object({
  number: z.string().optional(),
  position: z.string(),
  positionText: z.string().optional(),
  points: z.string(),
  Driver: DriverSchema,
  Constructor: ConstructorSchema,
  grid: z.string(),
  laps: z.string(),
  status: z.string(),
  Time: z
    .object({
      millis: z.string().optional(),
      time: z.string(),
    })
    .optional(),
})
export type RaceResultApi = z.infer<typeof RaceResultSchema>

// =====================================================
// Qualifying
// =====================================================

export const QualifyingResultSchema = z.object({
  number: z.string().optional(),
  position: z.string(),
  Driver: DriverSchema,
  Constructor: ConstructorSchema,
  Q1: z.string().optional(),
  Q2: z.string().optional(),
  Q3: z.string().optional(),
})
export type QualifyingResultApi = z.infer<typeof QualifyingResultSchema>

// =====================================================
// Laps
// =====================================================

export const LapTimingSchema = z.object({
  driverId: z.string(),
  position: z.string(),
  time: z.string().optional(),
})
export type LapTimingApi = z.infer<typeof LapTimingSchema>

export const LapSchema = z.object({
  number: z.string(),
  Timings: z.array(LapTimingSchema),
})
export type LapApi = z.infer<typeof LapSchema>
