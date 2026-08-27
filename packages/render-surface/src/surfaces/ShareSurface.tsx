import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig, loadShareConfig } from '@vismay/content-source/storyConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { signActionToken } from '@vismay/admin-core/actionToken'
import type { ResolvedUnit } from '@vismay/viz-engine'
import { themedLogoDataUrl } from '../lib/themeLogo'
import { applyShareBrandFonts } from '../lib/shareTheme'
import { buildShareSampleYaml } from '../lib/shareSampleYaml'
import ThemeProvider from '../story/ThemeProvider'
import VerticalLoader from '../story/VerticalLoader'
import ShareShell from '../share/ShareShell'

function filterBySection(units: ResolvedUnit[], sectionId: string): ResolvedUnit[] {
  return units.filter(
    (u) =>
      u.parentConfig.id === sectionId ||
      `section-${u.parentIndex}` === sectionId
  )
}

export interface ShareSurfaceProps {
  slug: string
  searchParams: { ratio?: string; section?: string }
  adminBaseUrl: string
  mapboxToken: string
}

export async function ShareSurface({
  slug,
  searchParams,
  adminBaseUrl,
  mapboxToken,
}: ShareSurfaceProps) {
  const sp = searchParams
  const initialRatio: '1:1' | '4:5' | '3:4' | '4:3' =
    sp.ratio === '1:1' || sp.ratio === '4:5' || sp.ratio === '4:3'
      ? sp.ratio
      : '3:4'
  const sectionFilter = typeof sp.section === 'string' ? sp.section : null

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units: allUnits, shareUnits: allShareUnits, hasShareOverrides } =
    resolveUnits(slug, story.sections, config)
  // `?section=<id>` scopes the page to a single section. Matches the
  // canvas-frame route's identity rule — `parentConfig.id` if set,
  // otherwise the auto-generated `section-<parentIndex>` slug.
  const units = sectionFilter ? filterBySection(allUnits, sectionFilter) : allUnits
  const shareUnits = sectionFilter
    ? filterBySection(allShareUnits, sectionFilter)
    : allShareUnits
  const [shareConfig, shareYamlText] = await Promise.all([
    loadShareConfig(slug),
    getContentSource().readShareYaml(slug),
  ])
  // Share cards adopt the vertical's brand type families (footshorts → Forum /
  // Manrope / Space Mono) while keeping the story's own colours. Driven off the
  // vertical so it covers every footshorts story, including DB-backed ones whose
  // `theme.fonts` aren't edited by hand.
  const shareTheme = applyShareBrandFonts(story.frontmatter.theme, story.frontmatter.vertical)
  const fontImportUrl = getFontImportUrl(shareTheme.fonts)
  const logo = await themedLogoDataUrl(shareConfig?.logo, shareTheme)
  const sampleYaml = buildShareSampleYaml(units)

  // Cross-TLD save credential. The page itself was reached via a signed
  // URL (middleware-verified); we mint a narrow action token here so the
  // editor can save back to admin's API directly. On expiry the user sees
  // a 401 and reloads to re-mint. See docs/auth.md Phase 2a.
  const editStoryContentToken = signActionToken({
    scope: 'edit-story-content',
    subject: slug,
  })

  return (
    <ThemeProvider theme={shareTheme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <style>{`.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl{margin:0 0 4px 4px}.mapboxgl-ctrl-logo{transform:scale(0.45);transform-origin:bottom left}.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl{margin:0 4px 4px 0}`}</style>
      <VerticalLoader vertical={story.frontmatter.vertical}>
        <ShareShell
          slug={slug}
          units={hasShareOverrides ? shareUnits : units}
          config={config}
          title={story.frontmatter.title}
          vertical={story.frontmatter.vertical}
          accessToken={mapboxToken}
          shareOverrides={shareConfig?.sections ?? null}
          shareYamlText={shareYamlText ?? ''}
          sampleYaml={sampleYaml}
          logo={logo}
          initialRatio={initialRatio}
          adminBaseUrl={adminBaseUrl}
          editStoryContentToken={editStoryContentToken}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
