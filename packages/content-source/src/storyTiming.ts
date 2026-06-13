/**
 * Per-story per-unit dwell times for SILENT (no-narration) autoplay video.
 *
 * Lives in `content/stories/<slug>.timing.yaml` (fs) or `stories.timing_yaml`
 * (db) — see `contentSource.readTimingYaml`.
 *
 * A narrated video derives the headless walk's per-unit hold time from the TTS
 * audio cues (`cue.end_ms - cue.start_ms`). A silent video has no audio, so
 * this config supplies the hold time instead. Any unit without an explicit
 * entry falls back to `defaultMs` (or `DEFAULT_UNIT_MS` when the file omits
 * it).
 *
 * Schema:
 *
 *   defaultMs: 5000
 *   units:
 *     - unit: { parentIndex: 1, subIndex: 0, sliceIndex: 0 }
 *       ms: 3500
 *
 * Unit identity is `(parentIndex, subIndex, sliceIndex)` and matches the
 * mobile-unit shape produced by `resolveUnits` — the same identity `storyTts`
 * uses. `sliceIndex` defaults to 0 when omitted.
 */

import { parse as parseYaml } from 'yaml'

/** Hold time for a unit with no override and no file-level default. */
export const DEFAULT_UNIT_MS = 5000

export interface TimingUnitOverride {
  parentIndex: number
  subIndex: number
  sliceIndex: number
  ms: number
}

export interface TimingConfig {
  /** Fallback dwell (ms) for units without an explicit entry. */
  defaultMs: number
  units: TimingUnitOverride[]
}

export function parseTimingConfig(raw: string | null): TimingConfig | null {
  if (!raw || !raw.trim()) return null
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  const d = doc as Record<string, unknown>

  const defaultMs =
    typeof d.defaultMs === 'number' && d.defaultMs > 0
      ? Math.round(d.defaultMs)
      : DEFAULT_UNIT_MS

  const units: TimingUnitOverride[] = []
  const unitsRaw = d.units
  if (Array.isArray(unitsRaw)) {
    for (const entry of unitsRaw) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const u = e.unit as
        | { parentIndex?: unknown; subIndex?: unknown; sliceIndex?: unknown }
        | undefined
      const ms = e.ms
      if (
        !u ||
        typeof u.parentIndex !== 'number' ||
        typeof u.subIndex !== 'number' ||
        typeof ms !== 'number' ||
        ms <= 0
      ) {
        continue
      }
      const sliceIndex = typeof u.sliceIndex === 'number' ? u.sliceIndex : 0
      units.push({
        parentIndex: u.parentIndex,
        subIndex: u.subIndex,
        sliceIndex,
        ms: Math.round(ms),
      })
    }
  }

  return { defaultMs, units }
}

export function findTimingOverride(
  config: TimingConfig | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number
): TimingUnitOverride | undefined {
  if (!config) return undefined
  return config.units.find(
    (u) =>
      u.parentIndex === parentIndex &&
      u.subIndex === subIndex &&
      u.sliceIndex === sliceIndex
  )
}

/**
 * Resolve a unit's dwell time: explicit override wins, else the file-level
 * `defaultMs`, else `DEFAULT_UNIT_MS` (when there's no timing config at all).
 */
export function unitDwellMs(
  config: TimingConfig | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number
): number {
  const override = findTimingOverride(config, parentIndex, subIndex, sliceIndex)
  if (override) return override.ms
  return config?.defaultMs ?? DEFAULT_UNIT_MS
}
