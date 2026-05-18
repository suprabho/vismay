/**
 * Maps Gemini's free-text entity names (e.g. "Max Verstappen", "Red Bull",
 * "Silverstone") to canonical IDs in the drivers / constructors / circuits
 * tables. Pure normalisation — no fuzzy ML, just lowercased substring matching
 * against name + given_name+family_name + locality + circuit_id slug.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type EntityRef = {
  entity_type: 'driver' | 'constructor' | 'circuit'
  entity_id: string
}

type DriverRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
}
type ConstructorRow = { constructor_id: string; name: string }
type CircuitRow = {
  circuit_id: string
  name: string
  locality: string | null
  country: string | null
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

let cache: {
  drivers: DriverRow[]
  constructors: ConstructorRow[]
  circuits: CircuitRow[]
} | null = null

async function loadCache(sb: SupabaseClient) {
  if (cache) return cache
  const [drivers, constructors, circuits] = await Promise.all([
    sb.from('vizf1_drivers').select('driver_id, given_name, family_name, code'),
    sb.from('vizf1_constructors').select('constructor_id, name'),
    sb.from('vizf1_circuits').select('circuit_id, name, locality, country'),
  ])
  cache = {
    drivers: (drivers.data ?? []) as DriverRow[],
    constructors: (constructors.data ?? []) as ConstructorRow[],
    circuits: (circuits.data ?? []) as CircuitRow[],
  }
  return cache
}

function matchDriver(needle: string, drivers: DriverRow[]): string | null {
  const n = norm(needle)
  if (!n) return null
  // Exact "given family"
  for (const d of drivers) {
    const full = norm(`${d.given_name} ${d.family_name}`)
    if (full === n) return d.driver_id
  }
  // Exact family or code
  for (const d of drivers) {
    if (norm(d.family_name) === n) return d.driver_id
    if (d.code && norm(d.code) === n) return d.driver_id
  }
  // Substring on either side (handles "Verstappen retired")
  for (const d of drivers) {
    const full = norm(`${d.given_name} ${d.family_name}`)
    if (full.includes(n) || n.includes(norm(d.family_name))) return d.driver_id
  }
  return null
}

function matchConstructor(needle: string, teams: ConstructorRow[]): string | null {
  const n = norm(needle)
  if (!n) return null
  for (const t of teams) {
    if (norm(t.name) === n) return t.constructor_id
  }
  // "Mercedes-AMG Petronas" → "Mercedes"
  for (const t of teams) {
    const tn = norm(t.name)
    if (n.includes(tn) || tn.includes(n)) return t.constructor_id
  }
  return null
}

function matchCircuit(needle: string, circuits: CircuitRow[]): string | null {
  const n = norm(needle)
  if (!n) return null
  for (const c of circuits) {
    if (norm(c.circuit_id) === n) return c.circuit_id
    if (norm(c.name) === n) return c.circuit_id
    if (c.locality && norm(c.locality) === n) return c.circuit_id
    if (c.country && norm(c.country) === n) return c.circuit_id
  }
  for (const c of circuits) {
    if (n.includes(norm(c.locality ?? '')) && c.locality) return c.circuit_id
    if (n.includes(norm(c.name))) return c.circuit_id
  }
  return null
}

export async function resolveEntities(
  sb: SupabaseClient,
  gemini: { drivers: string[]; teams: string[]; circuits: string[] },
): Promise<EntityRef[]> {
  const { drivers, constructors, circuits } = await loadCache(sb)
  const out: EntityRef[] = []
  const seen = new Set<string>()
  const push = (entity_type: EntityRef['entity_type'], entity_id: string) => {
    const key = `${entity_type}:${entity_id}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ entity_type, entity_id })
    }
  }
  for (const name of gemini.drivers) {
    const id = matchDriver(name, drivers)
    if (id) push('driver', id)
  }
  for (const name of gemini.teams) {
    const id = matchConstructor(name, constructors)
    if (id) push('constructor', id)
  }
  for (const name of gemini.circuits) {
    const id = matchCircuit(name, circuits)
    if (id) push('circuit', id)
  }
  return out
}

export function resetCache() {
  cache = null
}
