import { DriverSeasonStats } from '@/components/DriverSeasonStats'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function DriverStatsPage({ params }: RouteParams) {
  const { id } = await params
  return <DriverSeasonStats driverId={id} />
}
