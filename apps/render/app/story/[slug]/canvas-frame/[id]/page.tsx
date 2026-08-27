export const dynamic = 'force-dynamic'

import { CanvasFrameSurface } from '@vismay/render-surface/surfaces'
import { mapboxToken } from '@/lib/env'

interface RouteParams {
  params: Promise<{ slug: string; id: string }>
}

/**
 * Single-section render target for the admin canvas. Thin mount: the route
 * body lives in `@vismay/render-surface` so apps/render serves the identical
 * surface as vizmaya-fyi. This file owns only the route segment config
 * (`dynamic`) and the env injection.
 */
export default async function CanvasFramePage({ params }: RouteParams) {
  const { slug, id } = await params
  return (
    <CanvasFrameSurface
      slug={slug}
      id={id}
      mapboxToken={mapboxToken()}
    />
  )
}
