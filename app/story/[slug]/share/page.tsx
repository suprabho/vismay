import { notFound } from 'next/navigation'
import { getStoryContent } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig, loadShareConfig } from '@/lib/storyConfig'
import { getContentSource } from '@/lib/contentSource'
import { resolveUnits } from '@/lib/resolveUnits'
import { getFontImportUrl } from '@/lib/getFontImports'
import { themedLogoDataUrl } from '@/lib/themeLogo'
import { buildShareSampleYaml } from '@/lib/shareSampleYaml'
import ThemeProvider from '@/components/story/ThemeProvider'
import ShareShell from '@/components/share/ShareShell'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ratio?: string }>
}

export default async function SharePage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  const sp = await searchParams
  const initialRatio: '1:1' | '3:4' | '4:3' =
    sp.ratio === '1:1' || sp.ratio === '4:3' ? sp.ratio : '3:4'

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units, shareUnits, hasShareOverrides } = resolveUnits(slug, story.sections, config)
  const [shareConfig, shareYamlText] = await Promise.all([
    loadShareConfig(slug),
    getContentSource().readShareYaml(slug),
  ])
  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)
  const logo = await themedLogoDataUrl(shareConfig?.logo, story.frontmatter.theme)
  const sampleYaml = buildShareSampleYaml(units)

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <style>{`.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl{margin:0 0 4px 4px}.mapboxgl-ctrl-logo{transform:scale(0.45);transform-origin:bottom left}.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl{margin:0 4px 4px 0}`}</style>
      <ShareShell
        slug={slug}
        units={hasShareOverrides ? shareUnits : units}
        config={config}
        title={story.frontmatter.title}
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
        shareOverrides={shareConfig?.sections ?? null}
        shareYamlText={shareYamlText ?? ''}
        sampleYaml={sampleYaml}
        logo={logo}
        initialRatio={initialRatio}
      />
    </ThemeProvider>
  )
}
