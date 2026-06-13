/**
 * Synthetic timeline for a SILENT (no-narration) autoplay video.
 *
 * The narrated pipeline loads `story_audio_chunks` + `story_audio_cues` and the
 * headless walk dwells on each unit for `cue.end_ms - cue.start_ms`. With no
 * audio there's nothing to pace the walk, so we synthesize the same
 * `{ chunks, cues }` shape `renderStoryVideo`/`walkAndRecord` already consume —
 * a single notional chunk whose duration is the sum of every unit's dwell time,
 * and one cue per mobile unit laid back-to-back.
 *
 * Nothing here touches the audio tables: the timeline is computed in-memory at
 * render time and discarded. Dwell times come from `<slug>.timing.yaml`
 * (`storyTiming`); units with no entry fall back to the file's `defaultMs`.
 *
 * Every mobile unit gets a cue — unlike narration, which skips methodology
 * units (TTS_SKIP_IDS). A silent explainer should still pause on every section.
 */

import crypto from 'crypto'
import { resolveMobileUnits } from './resolveMobileUnits'
import { getContentSource } from './contentSource'
import { parseTimingConfig, unitDwellMs } from './storyTiming'
import { RENDER_PIPELINE_VERSION } from './storyVideo'

export interface SilentChunkRow {
  chunk_index: number
  public_url: string
  duration_ms: number
}

export interface SilentCueRow {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

export interface SilentTimeline {
  chunks: SilentChunkRow[]
  cues: SilentCueRow[]
  totalMs: number
  /**
   * Cache key for the silent render — analogous to `computeAudioRevisionHash`
   * for narrated videos. Hashes the resolved unit identities, their dwell
   * times, and the pipeline version, with a `silent` tag so it can never
   * collide with a narrated hash.
   */
  revisionHash: string
}

export async function buildSilentTimeline(slug: string): Promise<SilentTimeline> {
  const units = await resolveMobileUnits(slug)
  const timing = parseTimingConfig(await getContentSource().readTimingYaml(slug))

  const cues: SilentCueRow[] = []
  const identity: Array<[number, number, number, number, number]> = []
  let cursor = 0
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    const ms = unitDwellMs(timing, u.parentIndex, u.subIndex, u.sliceIndex ?? 0)
    cues.push({ unit_index: i, chunk_index: 0, start_ms: cursor, end_ms: cursor + ms })
    identity.push([i, u.parentIndex, u.subIndex, u.sliceIndex ?? 0, ms])
    cursor += ms
  }

  const totalMs = cursor
  // One notional chunk covering the whole walk — `computeTimeline` prefix-sums
  // chunk durations, and a single chunk at offset 0 with duration=totalMs gives
  // the cues an absolute timeline identical to their cumulative start/end.
  const chunks: SilentChunkRow[] = [
    { chunk_index: 0, public_url: '', duration_ms: totalMs },
  ]

  const revisionHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        pipeline: RENDER_PIPELINE_VERSION,
        mode: 'silent',
        units: identity,
      })
    )
    .digest('hex')

  return { chunks, cues, totalMs, revisionHash }
}
