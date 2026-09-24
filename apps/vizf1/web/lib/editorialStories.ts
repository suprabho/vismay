import 'server-only'

import { parseFrontmatter } from '@vismay/content-source/frontmatter'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import type { StoryCardData } from '@vismay/ui'
import type { Theme } from '@vismay/viz-engine'
import { parse as parseYaml } from 'yaml'
import { supabaseServer } from './supabaseServer'

// VizF1 shares the project-wide Supabase project with vizmaya.fyi, so the
// Editorial grid reads vizmaya's `stories` table scoped to `app_slug='vizf1'` —
// stories assigned to this app in the admin. Card fields (subtitle, theme,
// cover) live in the markdown frontmatter, so it's parsed here on the server
// rather than shipping every story's markdown to the browser.

type StoryRow = {
  slug: string
  title: string
  published_at: string | null
  aura: string | null
  markdown: string | null
  config_yaml: string | null
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

/** `defaults.storyBackground` aura slug from a story config, if it sets one. */
function configAura(configYaml: string | null): string | undefined {
  if (!configYaml) return undefined
  try {
    const cfg = parseYaml(configYaml) as { defaults?: { storyBackground?: { type?: string; slug?: string } } }
    const bg = cfg?.defaults?.storyBackground
    return bg?.type === 'aura' ? str(bg.slug) : undefined
  } catch {
    return undefined
  }
}

export type EditorialGrid = { stories: StoryCardData[]; fontUrls: string[] }

export async function loadEditorialStories(limit = 24): Promise<EditorialGrid> {
  const { data, error } = await supabaseServer()
    .from('stories')
    .select('slug, title, published_at, aura, markdown, config_yaml')
    .eq('status', 'published')
    .eq('listed', true)
    .eq('app_slug', 'vizf1')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error

  const stories = (data as StoryRow[]).map((r): StoryCardData => {
    const fm = r.markdown ? parseFrontmatter(r.markdown).data : {}
    const theme = fm.theme as Theme | undefined
    return {
      slug: r.slug,
      title: str(fm.title) ?? r.title,
      subtitle: str(fm.subtitle) ?? '',
      date: str(fm.date) ?? r.published_at ?? new Date().toISOString(),
      byline: str(fm.byline),
      topic: str(fm.topic),
      // Cover image first, then the story's aura (frontmatter, the
      // denormalized column, or the config's page-level aura background).
      thumbnail: str(fm.thumbnail),
      thumbnailTextColor: str(fm.thumbnailTextColor),
      aura: str(fm.aura) ?? str(r.aura) ?? configAura(r.config_yaml),
      theme: theme?.colors && theme?.fonts ? theme : undefined,
    }
  })

  const fontUrls = Array.from(
    new Set(
      stories
        .map((s) => (s.theme?.fonts ? getFontImportUrl(s.theme.fonts) : null))
        .filter((u): u is string => Boolean(u)),
    ),
  )
  return { stories, fontUrls }
}
