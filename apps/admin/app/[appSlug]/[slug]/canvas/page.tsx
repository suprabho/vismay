import CanvasPage from '@/components/canvas/CanvasPage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string; slug: string }>
}

/**
 * Universal canvas route — the generic-app mirror of
 * `app/vizmaya/[slug]/canvas`. Any vertical's story (footshorts, vizf1, …) is
 * edited here; the shared `CanvasPage` is vertical-agnostic and the consumer
 * `vizmaya-fyi` redirect in `[appSlug]/layout.tsx` keeps vizmaya stories on
 * their own `/vizmaya/...` tree.
 */
export default async function AppCanvasPage({ params }: Props) {
  const { appSlug, slug } = await params
  return <CanvasPage slug={slug} canvasPath={`/${appSlug}/${slug}/canvas`} />
}
