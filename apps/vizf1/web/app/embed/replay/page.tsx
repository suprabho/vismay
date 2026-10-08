import type { Metadata } from 'next'
import { isCameraMode } from '@vismay/f1-viz/web/replay'
import ReplayEmbed from './ReplayEmbed'

export const metadata: Metadata = {
  title: 'Race replay · VizF1',
  robots: { index: false },
}

const num = (v: string | string[] | undefined) => {
  const n = typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

/**
 * /embed/replay?session=<session_key>[&lap=&at=&cam=&focus=&laps=]
 *
 * The 3D race replay alone, full window, for embedding: the recap story
 * format frames it and drives it with postMessage cues (see ReplayEmbed).
 * The query sets the first cue. An unknown session plays the demo race.
 */
export default async function ReplayEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const q = await searchParams
  const session = typeof q.session === 'string' && q.session ? q.session : 'demo'
  return (
    <ReplayEmbed
      session={session}
      initial={{
        lap: num(q.lap),
        at: num(q.at),
        cam: isCameraMode(q.cam) ? q.cam : undefined,
        focus: typeof q.focus === 'string' ? q.focus : undefined,
        laps: num(q.laps),
      }}
    />
  )
}
