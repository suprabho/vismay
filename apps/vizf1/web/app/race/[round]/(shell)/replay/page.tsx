import ReplayView from './ReplayView'

interface RouteParams {
  params: Promise<{ round: string }>
}

export default async function RaceReplayPage({ params }: RouteParams) {
  const { round } = await params
  return <ReplayView round={Number(round)} />
}
