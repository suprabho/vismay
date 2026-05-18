import { TeamStoryView } from './TeamStoryView'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function TeamStoryRoute({ params }: RouteParams) {
  const { id } = await params
  return <TeamStoryView teamId={id} />
}
