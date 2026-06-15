import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getContentSource } from '@vismay/content-source/contentSource'
import { buildMapTargets } from '@vismay/viz-engine'
import { signActionToken } from '@vismay/admin-core/actionToken'
import type { ComponentType } from 'react'
import ThemeProvider from '../story/ThemeProvider'
import AutoplayShell from '../autoplay/AutoplayShell'
import type { MapPickerModalProps } from '../autoplay/AutoplayMapEditor'

export interface AutoplaySurfaceProps {
  slug: string
  searchParams: { aspect?: string; start?: string }
  adminBaseUrl: string
  mapboxToken: string
  /**
   * Host-injected interactive Mapbox picker. The package can't own this — it
   * depends on `mapbox-gl`, an app-level runtime — so the host passes its own
   * MapPickerModal, threaded down to AutoplayMapEditor.
   */
  MapPickerModalComponent: ComponentType<MapPickerModalProps>
}

export async function AutoplaySurface({
  slug,
  searchParams,
  adminBaseUrl,
  mapboxToken,
  MapPickerModalComponent,
}: AutoplaySurfaceProps) {
  const sp = searchParams
  const initialRatio: '9:16' | '16:9' = sp.aspect === '16:9' ? '16:9' : '9:16'
  const initialSectionId = typeof sp.start === 'string' ? sp.start : null

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units, mobileUnits, desktopToMobile, hasMobileOverrides } = resolveUnits(
    slug,
    story.sections,
    config
  )

  // The middleware gate guarantees anyone reaching this page is an admin
  // viewer (signed URL required). Always load the map editor side panel
  // payload — there's no public-viewer case anymore.
  const mapTargets = buildMapTargets(config)
  const initialMapYaml = await getContentSource().readMapYaml(slug)

  // Cross-TLD save credentials. The page itself was reached via a signed
  // URL (middleware-verified); we mint two narrow action tokens here so
  // the editor can save back to admin's API directly without proxying.
  // Both tokens share the page's TTL window; on expiry the user sees a 401
  // and reloads the page (which re-mints them). See docs/auth.md Phase 2a.
  const editStoryMapToken = signActionToken({
    scope: 'edit-story-map',
    subject: slug,
  })
  const editStoryCuesToken = signActionToken({
    scope: 'edit-story-cues',
    subject: slug,
  })

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      <AutoplayShell
        slug={slug}
        title={story.frontmatter.title}
        units={units}
        mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
        desktopToMobile={desktopToMobile}
        accessToken={mapboxToken}
        defaults={config.defaults}
        isAdmin={true}
        mapTargets={mapTargets}
        mapStyle={config.defaults.mapStyle}
        initialMapYaml={initialMapYaml}
        initialRatio={initialRatio}
        initialSectionId={initialSectionId}
        adminBaseUrl={adminBaseUrl}
        editStoryMapToken={editStoryMapToken}
        editStoryCuesToken={editStoryCuesToken}
        MapPickerModalComponent={MapPickerModalComponent}
      />
    </ThemeProvider>
  )
}
