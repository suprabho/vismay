/**
 * Capture stage for the HTML newsletter render.
 *
 * The render worker hits this route with `?print=1`, waits for
 * `window.__pdfReady__`, and element-screenshots every
 * `[data-newsletter-visual]` block. Navigable in a normal browser for dev
 * preview of the capture stage; the assembled newsletter HTML lives in the
 * `story-newsletter` bucket, not here.
 *
 * Thin mount: the route body lives in `@vismay/render-surface` so apps/render
 * can serve the identical surface. This file owns only the route segment
 * config (`dynamic`) and the env/branding injection.
 */

import { NewsletterSurface } from '@vismay/render-surface/surfaces'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ print?: string }>
}

export const dynamic = 'force-dynamic'

export default async function StoryNewsletterPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  return (
    <NewsletterSurface
      slug={slug}
      searchParams={(await searchParams) ?? {}}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
