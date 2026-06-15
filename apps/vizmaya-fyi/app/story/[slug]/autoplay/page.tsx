// Middleware gates this route via signed URL; anyone reaching the page
// is an admin viewer. Dynamic because the signed URL is per-request and
// the page reads override yaml unconditionally.
//
// Thin mount: the route body lives in `@vismay/render-surface` so apps/render
// can serve the identical surface. This file owns only the route segment
// config (`dynamic` + `generateStaticParams`) and the env/branding injection —
// including the app-local MapPickerModal (it depends on mapbox-gl, an app
// runtime concern, so the package accepts it as a prop).
export const dynamic = 'force-dynamic'

import { getViewableStorySlugs } from '@vismay/content-source/content'
import { hasStoryConfig } from '@vismay/content-source/storyConfig'
import { AutoplaySurface } from '@vismay/render-surface/surfaces'
import { adminBaseUrl } from '@/lib/adminBaseUrl'
import MapPickerModal from '@/components/MapPickerModal'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ aspect?: string; start?: string }>
}

export async function generateStaticParams() {
  const slugs = await getViewableStorySlugs()
  const withConfig = await Promise.all(
    slugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  return withConfig.filter((s): s is string => s !== null).map((slug) => ({ slug }))
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
