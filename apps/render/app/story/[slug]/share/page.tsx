import { ShareSurface } from '@vismay/render-surface/surfaces'
import { adminBaseUrl, mapboxToken } from '@/lib/env'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ratio?: string; section?: string }>
}

export default async function SharePage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  return (
    <ShareSurface
      slug={slug}
      searchParams={await searchParams}
      adminBaseUrl={adminBaseUrl()}
      mapboxToken={mapboxToken()}
    />
  )
}
