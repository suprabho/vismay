import { DriverStoryView } from './DriverStoryView'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function DriverStoryRoute({ params }: RouteParams) {
  const { id } = await params
  return <DriverStoryView driverId={id} />
}
