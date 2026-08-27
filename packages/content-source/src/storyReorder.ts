import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { buildYamlModel } from './yamlSections'
import { moveJsonSection } from './jsonSections'
import type { ConfigFormat } from './contentSource'

/**
 * Reorder a story's sections after materialization — the structural
 * counterpart to `storySection`'s append helpers.
 *
 * A story's slide order IS the order of its config `sections[]` array; the
 * markdown never needs to move because each config entry finds its prose by
 * `text` anchor, not by position. So a reorder is (1) an array move in the
 * config document, plus (2) an index remap in the sidecar files that address
 * sections positionally:
 *
 *   map.yaml    overrides[].target.parentIndex
 *   tts.yaml    units[].unit.parentIndex
 *   report.yaml slides.pages[].unit.parentIndex + report.pages[].unit.parentIndex
 *
 * (share.yaml keys its overrides by section *id*, so it survives a reorder
 * untouched — except for sections with no id, whose `section-<index>`
 * fallback key was never stable across structural edits anyway.)
 *
 * The config move is format-aware like `appendStorySection`: YAML goes
 * through `yamlSections`' line model so comments and coordinate tables
 * travel with their section; JSON goes through the parsed-tree move. The
 * sidecar remaps are parse → mutate → stringify (those files carry no
 * hand-written comments worth preserving — same tradeoff `seedTtsUnit`
 * already accepts) and return null when nothing referenced a moved index,
 * so callers can skip the write entirely.
 */

/** Move the section at `from` to position `to` (clamped) in a config
 *  document. Returns the new config text; a no-op move returns the input. */
export function moveStorySection(
  configText: string,
  from: number,
  to: number,
  format: ConfigFormat = 'yaml',
): string {
  if (format === 'json') return moveJsonSection(configText, from, to)

  const model = buildYamlModel(configText)
  if (model.parseError) {
    throw new Error(`cannot reorder sections of invalid config YAML: ${model.parseError}`)
  }
  const n = model.sections.length
  if (from < 0 || from >= n) throw new Error(`section index ${from} out of range`)
  const dest = Math.max(0, Math.min(to, n - 1))
  if (dest === from) return configText

  // The section blocks tile the region [first.startLine, sectionsEndLine)
  // contiguously (each block absorbs its leading comments/blank separator),
  // so reordering the blocks and reassembling the region is a pure permutation
  // of existing lines — nothing outside the sections block is touched.
  const lines = configText.split('\n')
  const order = [...model.sections]
  const [moved] = order.splice(from, 1)
  order.splice(dest, 0, moved!)
  const regionStart = model.sections[0]!.startLine
  const region = order.flatMap((b) => lines.slice(b.startLine, b.endLine))
  const out = [
    ...lines.slice(0, regionStart),
    ...region,
    ...lines.slice(model.sectionsEndLine),
  ].join('\n')

  // A handful of configs share values via YAML anchors (`&x` / `*x`), and an
  // alias is only valid AFTER its anchor — so moving the defining section
  // below a referencing one produces a document that no longer parses. The
  // save endpoint writes configs even when validation fails, so refuse here
  // rather than corrupt the story.
  try {
    parseYaml(out)
  } catch (e) {
    throw new Error(
      `this move would break the config (likely a YAML anchor/alias that must stay before its reference): ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }
  return out
}

/**
 * The old-index → new-index mapping a `moveStorySection(_, from, to)` implies,
 * as an array (`map[oldIndex] === newIndex`). Feed it to the sidecar remap
 * helpers below. `count` is the number of sections AFTER the move — so for a
 * plain reorder it's the section count, and for an append-then-move insert
 * it's count + 1 (the mapping then covers the pre-insert indices 0..count-1
 * plus the appended one).
 */
export function sectionMoveIndexMap(count: number, from: number, to: number): number[] {
  const dest = Math.max(0, Math.min(to, count - 1))
  const map: number[] = []
  for (let i = 0; i < count; i++) {
    if (i === from) map[i] = dest
    else if (from < dest && i > from && i <= dest) map[i] = i - 1
    else if (dest < from && i >= dest && i < from) map[i] = i + 1
    else map[i] = i
  }
  return map
}

/** Remap `overrides[].target.parentIndex` in a map.yaml document.
 *  Returns the rewritten YAML, or null when no index changed. */
export function remapMapOverrides(mapYaml: string | null, indexMap: number[]): string | null {
  return remapSidecar(mapYaml, (doc) => {
    const overrides = doc.overrides
    if (!Array.isArray(overrides)) return []
    return overrides.map((o) =>
      o && typeof o === 'object' ? ((o as Record<string, unknown>).target as unknown) : undefined,
    )
  }, indexMap)
}

/** Remap `units[].unit.parentIndex` in a tts.yaml document.
 *  Returns the rewritten YAML, or null when no index changed. */
export function remapTtsUnits(ttsYaml: string | null, indexMap: number[]): string | null {
  return remapSidecar(ttsYaml, (doc) => {
    const units = doc.units
    if (!Array.isArray(units)) return []
    return units.map((u) =>
      u && typeof u === 'object' ? ((u as Record<string, unknown>).unit as unknown) : undefined,
    )
  }, indexMap)
}

/** Remap `slides.pages[].unit.parentIndex` and `report.pages[].unit.parentIndex`
 *  in a report.yaml document. Returns the rewritten YAML, or null when no
 *  index changed. */
export function remapReportPages(reportYaml: string | null, indexMap: number[]): string | null {
  return remapSidecar(reportYaml, (doc) => {
    const refs: unknown[] = []
    for (const key of ['slides', 'report'] as const) {
      const section = doc[key]
      const pages =
        section && typeof section === 'object'
          ? (section as { pages?: unknown }).pages
          : undefined
      if (!Array.isArray(pages)) continue
      for (const p of pages) {
        if (p && typeof p === 'object') refs.push((p as Record<string, unknown>).unit)
      }
    }
    return refs
  }, indexMap)
}

/**
 * Shared engine: parse the sidecar, collect the `{ parentIndex }` holder
 * objects via `getRefs`, rewrite each in-range index through `indexMap`, and
 * stringify only if something actually changed. Out-of-range or non-numeric
 * indices (stale refs from before a section was deleted) are left as-is —
 * they were already dangling and remapping can't repair them.
 */
function remapSidecar(
  raw: string | null,
  getRefs: (doc: Record<string, unknown>) => unknown[],
  indexMap: number[],
): string | null {
  if (!raw || !raw.trim()) return null
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null

  let changed = false
  for (const ref of getRefs(doc as Record<string, unknown>)) {
    if (!ref || typeof ref !== 'object') continue
    const holder = ref as { parentIndex?: unknown }
    const old = holder.parentIndex
    if (typeof old !== 'number' || !Number.isInteger(old)) continue
    const next = indexMap[old]
    if (next === undefined || next === old) continue
    holder.parentIndex = next
    changed = true
  }
  return changed ? stringifyYaml(doc, { lineWidth: 0 }) : null
}
