import { ShareSurface } from '@vismay/render-surface/surfaces'
import { adminBaseUrl } from '@/lib/adminBaseUrl'

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
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
