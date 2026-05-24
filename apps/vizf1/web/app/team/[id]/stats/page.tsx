import { ConstructorSeasonStats } from '@/components/ConstructorSeasonStats'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function TeamStatsPage({ params }: RouteParams) {
  const { id } = await params
  return <ConstructorSeasonStats constructorId={id} />
}
