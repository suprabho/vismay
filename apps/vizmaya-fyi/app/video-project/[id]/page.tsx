export const dynamic = 'force-dynamic'

import { VideoProjectSurface } from '@vismay/render-surface/surfaces'

interface RouteParams {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ capture?: string }>
}

/**
 * Render target for a freeform video project. `?capture=1` arms the
 * deterministic seek API the headless renderer drives. Thin mount: the body
 * lives in `@vismay/render-surface` so apps/render can serve the identical
 * surface; this file owns only the route segment config (`dynamic`).
 */
export default async function VideoProjectPage({ params, searchParams }: RouteParams) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  return <VideoProjectSurface id={id} capture={sp.capture === '1'} />
}
