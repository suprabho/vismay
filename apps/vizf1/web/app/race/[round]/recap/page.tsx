import type { Metadata } from 'next'
import RecapView from './RecapView'

interface RouteParams {
  params: Promise<{ round: string }>
}

export const metadata: Metadata = {
  title: 'Race recap · VizF1',
}

// Full-screen story with its own header: outside the (shell) group, so no AppHeader.
export default async function RaceRecapPage({ params }: RouteParams) {
  const { round } = await params
  return <RecapView round={Number(round)} />
}
