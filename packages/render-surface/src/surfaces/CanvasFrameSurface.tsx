import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { parseMapOverrides } from '@vismay/viz-engine'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { themeToMapPalette } from '../lib/themeToMapPalette'
import ThemeProvider from '../story/ThemeProvider'
import StoryShell from '../story/StoryShell'
import VerticalLoader from '../story/VerticalLoader'

export interface CanvasFrameSurfaceProps {
  slug: string
  id: string
  mapboxToken: string
}

/**
 * Single-section render target for the admin canvas. Mounts the same
 * StoryShell the public /story/[slug] page mounts — same providers,
 * same legacy text card, same hero panel — but with `units` shrunk to the
 * one focused section so the iframe shows exactly that section's render.
 *
 * Headless: no homepage logo, no aura/capture chrome, no nav. The iframe
 * in the admin canvas is meant to BE the section, not host page chrome
 * around it.
 *
 * Section identity: `id` matches `StorySectionConfig.id` when set,
 * otherwise the auto-generated `section-<parentIndex>` slug the canvas
 * uses. Bad ids fall through to a 404.
 */
export async function CanvasFrameSurface({
  slug,
  id,
  mapboxToken,
}: CanvasFrameSurfaceProps) {
  let story
  let config
  let mapYaml: string | null = null
  try {
    // The canvas frame is a signed, admin-only preview surface — render drafts
    // too. Without `allowDraft`, getStoryContent throws for draft stories on any
    // Vercel deploy (NODE_ENV==='production' even on previews), which the catch
    // below turns into a 404 "This page couldn't load".
    story = await getStoryContent(slug, { allowDraft: true })
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
    if (story.frontmatter.vertical === 'footshorts') {
      try {
        config = await hydrateFootshortsConfig(config)
      } catch {
        // Hydration must never block rendering — fall back silently.
      }
    }
    mapYaml = await getContentSource().readMapYaml(slug)
  } catch {
    notFound()
  }

  const mapOverrides = parseMapOverrides(mapYaml)
  const { units } = resolveUnits(slug, story.sections, config)

  // Find the section the admin asked for. Mirror the id derivation the
  // canvas uses (section.id, else `section-<parentIndex>`).
  const focusedUnits = units.filter(
    (u) =>
      u.subIndex === 0 &&
      (u.parentConfig.id === id || `section-${u.parentIndex}` === id)
  )
  // Outline-only section: the compose flow lets an author preview sections
  // whose content hasn't been generated yet. Such a section has an outline /
  // config entry but no resolvable body, so `resolveUnits` emits no unit for
  // it. Render a calm placeholder instead of a hard 404 — the canvas frame is
  // an admin-only preview surface, so a broken "this page couldn't load" error
  // there is never the right answer; "no content yet" is.
  if (focusedUnits.length === 0) {
    const outlineSection = config.sections.find(
      (s, i) => s.id === id || `section-${i}` === id
    )
    const heading =
      outlineSection?.heading ??
      outlineSection?.text ??
      id.replace(/^section-(\d+)$/, 'Section $1').replace(/-/g, ' ')
    return (
      <main
        style={{
          display: 'flex',
          height: '100svh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#0b0b0f',
          color: '#e7e5e4',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        <span
          style={{
            fontSize: '0.65rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7dd3fc',
          }}
        >
          Outline · no content yet
        </span>
        <h1 style={{ margin: 0, maxWidth: '24ch', fontSize: '1.4rem', fontWeight: 600 }}>
          {heading}
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: '34ch',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            color: '#a8a29e',
          }}
        >
          This section is still an outline. Generate its content from the
          Compose panel (Write), then reload the canvas to preview it here.
        </p>
      </main>
    )
  }

  // StoryShell handles units[] uniformly — passing a length-1 array makes
  // it a story-of-one. The IntersectionObserver, scroll snap, and active-unit
  // tracking all degenerate to "the one unit is always active".
  const focusedUnit = focusedUnits[0]
  // Carry every unit that shares this parent (e.g. subsections) so the unit
  // selector inside StoryShell still has chart/scroll context to work
  // with. The shell will render the first one as active.
  const parentUnits = units.filter((u) => u.parentIndex === focusedUnit.parentIndex)

  const defaults = {
    ...config.defaults,
    mapPalette:
      config.defaults.mapPalette ?? themeToMapPalette(story.frontmatter.theme),
  }

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <VerticalLoader vertical={story.frontmatter.vertical}>
        <StoryShell
          units={parentUnits}
          accessToken={mapboxToken}
          defaults={defaults}
          slug={slug}
          mapOverrides={mapOverrides}
          // Match the public /story/[slug] page: a deck-format story must
          // render through the deck foreground layout, not the legacy
          // map chart-panel path. Omitting this defaulted to 'map', which
          // shoved deck vizslots (bigStat, bodyText, …) into the fixed
          // chart panel — drawing a stray gray rounded card behind them.
          format={story.frontmatter.format ?? 'map'}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
