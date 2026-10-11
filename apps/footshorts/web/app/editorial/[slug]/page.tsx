import type { Metadata } from 'next';
import EditorialReader from './EditorialReader';

// A signed-in iframe of the render service (canonical on vizmaya.fyi): no text
// here for a crawler, so keep the shell out of the index but follow its links.
export const metadata: Metadata = { robots: { index: false, follow: true } };

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function EditorialReaderPage({ params }: RouteParams) {
  const { slug } = await params;
  return <EditorialReader slug={slug} />;
}
