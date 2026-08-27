// Middleware gates this route via signed URL; anyone reaching the page
// is an admin viewer. Dynamic because the signed URL is per-request and
// the page reads override yaml unconditionally.
//
// Thin mount: the route body lives in `@vismay/render-surface` so apps/render
// can serve the identical surface. This file owns only the route segment
// config and the env/branding injection — including the app-local
// MapPickerModal (it depends on mapbox-gl, an app runtime concern, so the
// package accepts it as a prop). No generateStaticParams: force-dynamic means
// nothing is prerendered, so enumerating slugs here would only slow the build.
export const dynamic = 'force-dynamic'

import { AutoplaySurface } from '@vismay/render-surface/surfaces'
import { adminBaseUrl } from '@/lib/adminBaseUrl'
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
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
      MapPickerModalComponent={MapPickerModal}
    />
  )
}
