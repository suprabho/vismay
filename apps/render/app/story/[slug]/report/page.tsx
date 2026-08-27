/**
 * Bespoke portrait report layout for headless PDF capture.
 *
 * Thin mount: the route body lives in `@vismay/render-surface` so apps/render
 * serves the identical surface as vizmaya-fyi. This file owns only the route
 * segment config (`dynamic`) and the env injection.
 */

import { ReportSurface } from '@vismay/render-surface/surfaces'
import { mapboxToken } from '@/lib/env'

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
      mapboxToken={mapboxToken()}
    />
  )
}
