import RaceDetail from './RaceDetail'

interface RouteParams {
  params: Promise<{ round: string }>
}

export default async function RacePage({ params }: RouteParams) {
  const { round } = await params
  return <RaceDetail round={Number(round)} />
}
