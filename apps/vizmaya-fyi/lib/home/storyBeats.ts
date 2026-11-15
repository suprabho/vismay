import { createServiceClient } from '@vismay/content-source/supabase'
import type { BeatReel } from './beats'

/** The spin behind a published story: its desk and the reels it drew. */
export interface StorySpin {
  desk: string
  reels: Record<string, BeatReel | undefined>
}

/**
 * Each published HTML story's spin, by story slug (`randomizer_spins`,
 * migration 088: a spin is `published` with its `story_slug` once its story
 * is). Read here and not through @vismay/randomizer/spins, which loads every
 * desk's dataset. A story with more than one spin keeps the newest.
 *
 * Best-effort: without the service env or the table, no story has a beat and
 * the home page shows the wall and the epics alone.
 */
export async function loadStorySpins(): Promise<Map<string, StorySpin>> {
  const out = new Map<string, StorySpin>()
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out
  try {
    const { data, error } = await createServiceClient()
      .from('randomizer_spins')
      .select('story_slug, randomizer, reels')
      .eq('status', 'published')
      .not('story_slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1000)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      if (r.story_slug && !out.has(r.story_slug)) out.set(r.story_slug, { desk: r.randomizer, reels: r.reels ?? {} })
    }
  } catch (err) {
    console.error('[home] story beats failed:', err)
  }
  return out
}
