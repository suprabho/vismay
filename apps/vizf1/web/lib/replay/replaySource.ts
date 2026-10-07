import { createFixtureDataSource, type ReplayDataSource } from '@vismay/f1-viz/web/replay'

/**
 * Where the 3D replay loads a session from: the Supabase-backed replay route
 * when NEXT_PUBLIC_VIZF1_REPLAY_SOURCE=supabase, else the static fixtures. A
 * session that isn't there falls back to the demo race, which is always the
 * bundled fixture (the replay route has no "demo").
 */
export function replaySource(): ReplayDataSource {
  const supabase = process.env.NEXT_PUBLIC_VIZF1_REPLAY_SOURCE === 'supabase'
  return createFixtureDataSource({
    resolveUrl: (ref) =>
      supabase && ref !== 'demo' ? `/api/replay/${encodeURIComponent(ref)}` : `/fixtures/replay-${ref}.json`,
    fallbackRef: 'demo',
  })
}
