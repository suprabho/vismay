export const dynamic = 'force-dynamic'

import { CanvasFrameSurface } from '@vismay/render-surface/surfaces'

interface RouteParams {
  params: Promise<{ slug: string; id: string }>
}

/**
 * Single-section render target for the admin canvas. Thin mount: the route
 * body lives in `@vismay/render-surface` so apps/render can serve the
 * identical surface. This file owns only the route segment config (`dynamic`)
 * and the env injection.
 */
export default async function CanvasFramePage({ params }: RouteParams) {
  const { slug, id } = await params
  return (
    <CanvasFrameSurface
      slug={slug}
      id={id}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
