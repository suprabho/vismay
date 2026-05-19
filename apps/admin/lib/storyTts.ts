/**
 * Per-story TTS narration override.
 *
 * Lives in `content/stories/<slug>.tts.yaml` (fs) or `stories.tts_yaml` (db) —
 * see `contentSource.readTtsYaml`.
 *
 * Schema:
 *
 *   units:
 *     - unit: { parentIndex: 1, subIndex: 0, sliceIndex: 0 }
 *       script: "Custom narration for this unit."
 *
 * Unit identity is `(parentIndex, subIndex, sliceIndex)` and matches the
 * mobile-unit shape produced by `resolveUnits`. `sliceIndex` defaults to 0
 * when omitted, so non-split units can leave it out.
 *
 * Out of scope: voice/tone tweaks, per-chunk overrides. Add a new top-level
 * key (e.g. `voice:`) when those land — keep `units:` stable.
 */

import { parse as parseYaml } from 'yaml'

export interface TtsUnitOverride {
  parentIndex: number
  subIndex: number
  sliceIndex: number
  script: string
}

export interface TtsConfig {
  units: TtsUnitOverride[]
}

export function parseTtsConfig(raw: string | null): TtsConfig | null {
  if (!raw || !raw.trim()) return null
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  const unitsRaw = (doc as { units?: unknown }).units
  if (!Array.isArray(unitsRaw)) return { units: [] }

  const units: TtsUnitOverride[] = []
  for (const entry of unitsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const u = e.unit as { parentIndex?: unknown; subIndex?: unknown; sliceIndex?: unknown } | undefined
    const script = e.script
    if (
      !u ||
      typeof u.parentIndex !== 'number' ||
      typeof u.subIndex !== 'number' ||
      typeof script !== 'string' ||
      !script.trim()
    ) {
      continue
    }
    const sliceIndex = typeof u.sliceIndex === 'number' ? u.sliceIndex : 0
    units.push({
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      sliceIndex,
      script,
    })
  }
  return { units }
}

export function findTtsOverride(
  config: TtsConfig | null,
  parentIndex: number,
  subIndex: number,
  sliceIndex: number
): TtsUnitOverride | undefined {
  if (!config) return undefined
  return config.units.find(
    (u) =>
      u.parentIndex === parentIndex &&
      u.subIndex === subIndex &&
      u.sliceIndex === sliceIndex
  )
}

/**
 * Compute the default narration text for a mobile unit. Mirrors the logic in
 * `scripts/generate-audio.ts` so the admin Narration tab can show the exact
 * string that would be sent to Gemini if no override is set.
 *
 * Hero: dek + byline (no heading — the title half is silent / display-only).
 * Stat: paragraphs joined verbatim.
 * Other: heading (if present) + paragraphs with markdown bold/italic stripped.
 */
export function defaultNarrationText(unit: {
  heading?: string
  paragraphs: string[]
  parentConfig: { kind?: string }
  heroPart?: 'title' | 'dek'
}): string {
  const kind = unit.parentConfig.kind ?? 'text'
  const parts: string[] = []
  if (unit.heading) parts.push(unit.heading)

  if (kind === 'hero') {
    const dek = unit.paragraphs
      .find((p) => /^\*[^*]/.test(p))
      ?.replace(/^\*+|\*+$/g, '')
      .trim()
    const byline = unit.paragraphs
      .find((p) => p.startsWith('**'))
      ?.replace(/^\*+|\*+$/g, '')
      .trim()
    if (dek) parts.push(dek)
    if (byline) parts.push(byline)
  } else if (kind === 'stat') {
    parts.push(unit.paragraphs.join(' '))
  } else {
    const cleaned = unit.paragraphs.map((p) =>
      p.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
    )
    parts.push(...cleaned)
  }

  return parts.filter(Boolean).join('. ')
}

/**
 * Section IDs whose mobile units are skipped at TTS time. Mirrors
 * `TTS_SKIP_IDS` in scripts/generate-audio.ts — kept in sync so the admin
 * panel can label these units and disable their override input.
 */
export const TTS_SKIP_IDS = new Set(['methodology'])
