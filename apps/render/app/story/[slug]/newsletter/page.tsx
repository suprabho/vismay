/**
 * Capture stage for the HTML newsletter render.
 *
 * Thin mount: the route body lives in `@vismay/render-surface` so apps/render
 * serves the identical surface as vizmaya-fyi. This file owns only the route
 * segment config (`dynamic`) and the env injection.
 */

import { NewsletterSurface } from '@vismay/render-surface/surfaces'
import { mapboxToken } from '@/lib/env'

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
      mapboxToken={mapboxToken()}
    />
  )
}
