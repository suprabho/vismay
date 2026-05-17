import EditorialReader from './EditorialReader';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function EditorialReaderPage({ params }: RouteParams) {
  const { slug } = await params;
  return <EditorialReader slug={slug} />;
}
