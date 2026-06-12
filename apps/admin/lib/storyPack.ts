import matter from 'gray-matter'
import { packForVertical, type DomainPack } from '@vismay/story-pipeline'
import { getContentSource, verticalForApp } from '@vismay/content-source/contentSource'

/**
 * Resolve the story's editorial desk (DomainPack) — voice + vertical layer
 * menu for every desk-aware AI surface: the compose generation passes, the
 * canvas slot prompts, and the Ask-AI assistant grounding.
 *
 *   1. frontmatter `vertical` (Tier 1 seeds it on per-app drafts; read via
 *      raw markdown + gray-matter so drafts resolve too),
 *   2. else the stories-row appSlug → verticalForApp (covers stories assigned
 *      to an app before the vertical seeding existed),
 *   3. else the vizmaya desk.
 *
 * SERVER ONLY (reads the content source). Moved here from the compose routes'
 * `shared.ts` (which re-exports it) so non-compose surfaces share the exact
 * same resolution.
 */
export async function resolveStoryPack(slug: string): Promise<DomainPack> {
  const src = getContentSource()
  try {
    const md = await src.readMarkdown(slug)
    if (md) {
      const vertical = (matter(md).data as Record<string, unknown>).vertical
      if (typeof vertical === 'string' && vertical) return packForVertical(vertical)
    }
  } catch {
    // fall through to the app-slug mapping
  }
  try {
    const row = (await src.listStories()).find((s) => s.slug === slug)
    const vertical = verticalForApp(row?.appSlug)
    if (vertical) return packForVertical(vertical)
  } catch {
    // fall through to the default desk
  }
  return packForVertical(null)
}
