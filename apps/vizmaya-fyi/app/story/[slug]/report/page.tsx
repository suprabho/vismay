/**
 * Bespoke portrait report layout for headless PDF capture.
 *
 * Letter-sized booklet, one parent section per "spread" with `break-before:
 * page`. Playwright hits this route with `?print=1`, waits for
 * `window.__pdfReady__`, and calls `page.pdf()`. In a normal browser the route
 * is also navigable for dev preview; the `print=1` flag hides any non-print
 * chrome the shell layers on top.
 *
 * Thin mount: the route body lives in `@vismay/render-surface` so apps/render
 * can serve the identical surface. This file owns only the route segment
 * config (`dynamic`) and the env/branding injection.
 */

import { ReportSurface } from '@vismay/render-surface/surfaces'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ print?: string; embed?: string; section?: string }>
}

export const dynamic = 'force-dynamic'

export default async function StoryReportPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  return (
    <ReportSurface
      slug={slug}
      searchParams={(await searchParams) ?? {}}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
