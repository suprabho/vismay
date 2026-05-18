import { DriverProfile } from '@/components/DriverProfile'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function DriverPage({ params }: RouteParams) {
  const { id } = await params
  return <DriverProfile driverId={id} />
}
