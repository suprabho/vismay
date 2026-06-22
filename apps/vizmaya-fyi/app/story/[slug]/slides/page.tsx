/**
 * Bespoke 16:9 slide-deck layout for headless PDF capture.
 *
 * One unit per slide at 1920×1080. Playwright hits this route with `?print=1`,
 * waits for `window.__pdfReady__`, and calls `page.pdf({ landscape: true,
 * width: 1920px, height: 1080px })`.
 *
 * Thin mount: the route body lives in `@vismay/render-surface` so apps/render
 * can serve the identical surface. This file owns only the route segment
 * config (`dynamic`) and the env/branding injection.
 */

import { SlidesSurface } from '@vismay/render-surface/surfaces'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ print?: string; embed?: string; section?: string }>
}

export const dynamic = 'force-dynamic'

export default async function StorySlidesPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  return (
    <SlidesSurface
      slug={slug}
      searchParams={(await searchParams) ?? {}}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
