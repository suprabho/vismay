import type { Metadata } from 'next'
import EditorialReader from './EditorialReader'

// The page is an iframe of the render service (noindex, canonical on
// vizmaya.fyi), so there is no text here for a crawler; keep the shell out of
// the index but let it follow the links.
export const metadata: Metadata = { robots: { index: false, follow: true } }

interface RouteParams {
  params: Promise<{ slug: string }>
}

export default async function EditorialReaderPage({ params }: RouteParams) {
  const { slug } = await params
  return <EditorialReader slug={slug} />
}
