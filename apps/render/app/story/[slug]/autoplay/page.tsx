// Middleware gates this route via signed URL; anyone reaching the page
// is an admin viewer. Dynamic because the signed URL is per-request and
// the page reads override yaml unconditionally.
//
// Thin mount: the route body lives in `@vismay/render-surface` so apps/render
// serves the identical surface as vizmaya-fyi. This file owns only the route
// segment config (`dynamic`) and the env injection — including the app-local
// MapPickerModal (it depends on mapbox-gl, an app runtime concern, so the
// package accepts it as a prop).
export const dynamic = 'force-dynamic'

import { AutoplaySurface } from '@vismay/render-surface/surfaces'
import { adminBaseUrl, mapboxToken } from '@/lib/env'
import MapPickerModal from '@/components/MapPickerModal'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ aspect?: string; start?: string }>
}

export default async function AutoplayPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  return (
    <AutoplaySurface
      slug={slug}
      searchParams={(await searchParams) ?? {}}
      adminBaseUrl={adminBaseUrl()}
      mapboxToken={mapboxToken()}
      MapPickerModalComponent={MapPickerModal}
    />
  )
}
