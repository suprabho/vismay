/**
 * Server-side data access for the umami app. One shared content DB serves all
 * Vismay apps (see apps/footshorts/web/lib/useEditorialStories.ts) — this app
 * reads it with the anon key only (`food_dishes` and published `stories` are
 * both public-read under RLS).
 *
 * Every helper swallows errors into an empty result on purpose: the app must
 * render (with empty states) when Supabase env is absent — local checkouts and
 * the CI sandbox build have no env, and the Vercel project may be created
 * before its env vars are.
 */
import { listFoodDishes, type FoodDish } from '@vismay/content-source/epics'
import { createBrowserClient } from '@vismay/content-source/supabase'

export const EPIC_SLUG = 'searching-for-umami'
export const APP_SLUG = 'umami'

export type { FoodDish }

export async function getDishes(): Promise<FoodDish[]> {
  try {
    return await listFoodDishes(EPIC_SLUG)
  } catch {
    return []
  }
}

export interface UmamiStory {
  slug: string
  title: string
  publishedAt: string | null
}

/** Published, listed stories tagged to the umami app, newest first. */
export async function getStories(): Promise<UmamiStory[]> {
  try {
    const sb = createBrowserClient()
    const { data, error } = await sb
      .from('stories')
      .select('slug, title, published_at')
      .eq('app_slug', APP_SLUG)
      .eq('status', 'published')
      .eq('listed', true)
      .order('published_at', { ascending: false })
      .limit(24)
    if (error) return []
    return (data ?? []).map((r) => ({
      slug: r.slug as string,
      title: (r.title as string | null) ?? (r.slug as string),
      publishedAt: (r.published_at as string | null) ?? null,
    }))
  } catch {
    return []
  }
}
