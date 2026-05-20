import EditorialEpic from './EditorialEpic';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function EditorialEpicPage({ params }: RouteParams) {
  const { slug } = await params;
  return <EditorialEpic slug={slug} />;
}
