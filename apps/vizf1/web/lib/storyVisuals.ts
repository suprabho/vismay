'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { flagUrl } from '@vismay/f1-viz/grands-prix'
import { countryCode } from './formatStats'

/**
 * Stand-in artwork for stories whose source article has no image — the F1
 * take on Footshorts' crest placeholder (see apps/footshorts/web FeedCard):
 * the tagged driver's headshot, their constructor's mark and team colour, and
 * the host country's flag for a tagged circuit.
 */
export type StoryVisual = {
  driver: { name: string; headshotUrl: string } | null
  team: { name: string; logoUrl: string | null; color: string | null } | null
  flag: { country: string; url: string } | null
}

type EntityType = 'driver' | 'constructor' | 'circuit'

/** Embedded `vizf1_article_entities(...)` rows on an article select. */
export type ArticleEntityRow = { entity_type: EntityType; entity_id: string; confidence: number }

export const ARTICLE_ENTITIES_SELECT = 'vizf1_article_entities(entity_type, entity_id, confidence)'

type ImagelessArticle = { id: string; image_url: string | null; vizf1_article_entities?: ArticleEntityRow[] | null }

/** Preferred entity — the ring a story viewer is showing wins over tag confidence. */
export type PreferEntity = { type: 'driver' | 'constructor'; id: string }

function topId(
  tags: ArticleEntityRow[],
  type: EntityType,
  prefer?: PreferEntity,
): string | null {
  const ofType = tags.filter((t) => t.entity_type === type)
  if (prefer?.type === type && ofType.some((t) => t.entity_id === prefer.id)) return prefer.id
  return ofType.sort((a, b) => b.confidence - a.confidence)[0]?.entity_id ?? null
}

/**
 * Resolve placeholder visuals for every article in `rows` that has no image.
 * Three batched lookups at most (drivers, constructors, circuits) regardless
 * of how many articles need a placeholder.
 */
export async function resolveStoryVisuals(
  sb: SupabaseClient,
  rows: ImagelessArticle[],
  prefer?: PreferEntity,
): Promise<Map<string, StoryVisual>> {
  const picks = rows
    .filter((r) => !r.image_url)
    .map((r) => {
      const tags = r.vizf1_article_entities ?? []
      return {
        id: r.id,
        driverId: topId(tags, 'driver', prefer),
        constructorId: topId(tags, 'constructor', prefer),
        circuitId: topId(tags, 'circuit'),
      }
    })
    .filter((p) => p.driverId || p.constructorId || p.circuitId)
  const out = new Map<string, StoryVisual>()
  if (picks.length === 0) return out

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))]
  const driverIds = uniq(picks.map((p) => p.driverId))
  const circuitIds = uniq(picks.map((p) => p.circuitId))

  const [drivers, circuits] = await Promise.all([
    driverIds.length
      ? sb
          .from('vizf1_drivers')
          .select('driver_id, given_name, family_name, headshot_url, constructor_id')
          .in('driver_id', driverIds)
      : null,
    circuitIds.length
      ? sb.from('vizf1_circuits').select('circuit_id, country').in('circuit_id', circuitIds)
      : null,
  ])
  const driverById = new Map(
    ((drivers?.data ?? []) as {
      driver_id: string
      given_name: string
      family_name: string
      headshot_url: string | null
      constructor_id: string | null
    }[]).map((d) => [d.driver_id, d]),
  )
  const countryByCircuit = new Map(
    ((circuits?.data ?? []) as { circuit_id: string; country: string | null }[]).map((c) => [
      c.circuit_id,
      c.country,
    ]),
  )

  // A driver-only story still gets team colour + mark via the driver's seat.
  const teamFor = (p: (typeof picks)[number]) =>
    p.constructorId ?? (p.driverId ? driverById.get(p.driverId)?.constructor_id ?? null : null)
  const constructorIds = uniq(picks.map(teamFor))
  const constructors = constructorIds.length
    ? await sb
        .from('vizf1_constructors')
        .select('constructor_id, name, logo_url, primary_color')
        .in('constructor_id', constructorIds)
    : null
  const constructorById = new Map(
    ((constructors?.data ?? []) as {
      constructor_id: string
      name: string
      logo_url: string | null
      primary_color: string | null
    }[]).map((c) => [c.constructor_id, c]),
  )

  for (const p of picks) {
    const d = p.driverId ? driverById.get(p.driverId) : undefined
    const teamId = teamFor(p)
    const c = teamId ? constructorById.get(teamId) : undefined
    const country = p.circuitId ? countryByCircuit.get(p.circuitId) : null
    const code = countryCode(country)
    const visual: StoryVisual = {
      driver: d?.headshot_url
        ? { name: `${d.given_name} ${d.family_name}`, headshotUrl: d.headshot_url }
        : null,
      team: c ? { name: c.name, logoUrl: c.logo_url, color: c.primary_color } : null,
      flag: code && country ? { country, url: flagUrl(code, 640) } : null,
    }
    if (visual.driver || visual.team || visual.flag) out.set(p.id, visual)
  }
  return out
}
