import EditorialReader from './EditorialReader'

export default async function EditorialStoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <EditorialReader slug={slug} />
}
