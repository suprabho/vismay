import { TeamProfile } from '@/components/TeamProfile'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function TeamPage({ params }: RouteParams) {
  const { id } = await params
  return <TeamProfile teamId={id} />
}
