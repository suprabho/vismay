import 'server-only'

import { parseFrontmatter } from '@vismay/content-source/frontmatter'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import type { StoryCardData } from '@vismay/ui'
import { resolveAssetUrl, type Theme } from '@vismay/viz-engine'
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

type ConfigSection = {
  id?: string
  kind?: string
  foreground?: unknown
  background?: unknown
  subsections?: ConfigSection[]
}
type StoryConfigLite = {
  defaults?: { storyBackground?: { type?: string; slug?: string } }
  sections?: ConfigSection[]
}

function parseConfig(configYaml: string | null): StoryConfigLite | null {
  if (!configYaml) return null
  try {
    // YAML is a superset of JSON, so this reads both config formats.
    const cfg = parseYaml(configYaml) as StoryConfigLite | null
    return cfg && typeof cfg === 'object' ? cfg : null
  } catch {
    return null
  }
}

/** `defaults.storyBackground` aura slug from a story config, if it sets one. */
function configAura(cfg: StoryConfigLite | null): string | undefined {
  const bg = cfg?.defaults?.storyBackground
  return bg?.type === 'aura' ? str(bg.slug) : undefined
}

/** First `type: image` layer src anywhere in a foreground/background slot. */
function firstImageSrc(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const src = firstImageSrc(n)
      if (src) return src
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  const obj = node as Record<string, unknown>
  if (obj.type === 'image') return str(obj.src)
  // Regions map (`{ layout, regions: { name: layers | { layers } } }`).
  if (obj.regions && typeof obj.regions === 'object') {
    return firstImageSrc(Object.values(obj.regions as Record<string, unknown>))
  }
  if ('layers' in obj) return firstImageSrc(obj.layers)
  return undefined
}

function sectionImage(section: ConfigSection): string | undefined {
  return (
    firstImageSrc(section.foreground) ??
    firstImageSrc(section.background) ??
    section.subsections?.map(sectionImage).find(Boolean)
  )
}

/**
 * The story's cover image from its config: the deck `Cover` section's image
 * (generated stories put the hero there), else the first image in the story.
 */
function configCover(cfg: StoryConfigLite | null): string | undefined {
  const sections = cfg?.sections ?? []
  const cover = sections.find((s) => s.kind === 'cover' || s.id === 'cover')
  const src = (cover && sectionImage(cover)) ?? sections.map(sectionImage).find(Boolean)
  if (!src) return undefined
  try {
    return resolveAssetUrl(src)
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
    const cfg = parseConfig(r.config_yaml)
    const theme = fm.theme as Theme | undefined
    return {
      slug: r.slug,
      title: str(fm.title) ?? r.title,
      subtitle: str(fm.subtitle) ?? '',
      date: str(fm.date) ?? r.published_at ?? new Date().toISOString(),
      byline: str(fm.byline),
      topic: str(fm.topic),
      // Cover image first (frontmatter thumbnail, else the config's cover
      // image), then the story's aura (frontmatter, the denormalized column,
      // or the config's page-level aura background).
      thumbnail: str(fm.thumbnail) ?? configCover(cfg),
      thumbnailTextColor: str(fm.thumbnailTextColor),
      aura: str(fm.aura) ?? str(r.aura) ?? configAura(cfg),
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
