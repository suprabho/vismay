import { isCollection, isMap, parseDocument } from 'yaml'
import type { StageConfig } from '@vismay/viz-engine'

/**
 * Splice only the CHANGED keyframes of `edited` (vs `baseline`) back into the
 * raw config text — the E2 save serializer.
 *
 * Uses `yaml`'s Document API (`parseDocument` + per-keyframe `setIn`), the
 * same comment-preserving round-trip `DeckComposerPanel`'s `spliceForeground`
 * uses, so every comment and formatting choice OUTSIDE the replaced keyframe
 * nodes survives verbatim — the demo config's stage block is dense with
 * authored comments between keyframes, and a whole-document
 * `parseYaml → stringify` would destroy all of them.
 *
 * Replaced keyframes re-emit in the config's authored idiom — block-style
 * keys with flow-style values (`- at: { section: maxq }` / `transform:
 * { position: … }` each on their own line) — and carry over their own
 * attached comments, so a one-field edit is a one-line git diff. E2 never
 * changes keyframe COUNT (moves rewrite `at` in place), so
 * `entities[e].keyframes[k]` indices stay aligned between baseline and
 * edited by construction.
 *
 * Operates on raw text only — never serialize the `loadStoryConfig` object,
 * which has engine defaults merged in and would inject them into the file.
 */
export function spliceStageIntoConfig(
  configText: string,
  baseline: StageConfig,
  edited: StageConfig
): string {
  const doc = parseDocument(configText)
  edited.entities.forEach((entity, e) => {
    entity.keyframes.forEach((kf, k) => {
      const before = baseline.entities[e]?.keyframes[k]
      if (JSON.stringify(before) === JSON.stringify(kf)) return
      const path = ['defaults', 'stage', 'entities', e, 'keyframes', k]
      const old = doc.getIn(path, true) as
        | { commentBefore?: string; comment?: string }
        | undefined
      const node = doc.createNode(kf)
      // Block keys, flow values (nested collections inside a flow value emit
      // flow automatically) — the file's authored keyframe idiom.
      if (isMap(node)) {
        for (const pair of node.items) {
          if (isCollection(pair.value)) pair.value.flow = true
        }
      }
      if (old?.commentBefore) node.commentBefore = old.commentBefore
      if (old?.comment) node.comment = old.comment
      doc.setIn(path, node)
    })
  })
  // lineWidth: 0 disables wrapping so the file's long single-line flow maps
  // re-emit byte-identical instead of being re-wrapped at 80 columns (same
  // reason canvasSlotEditing stringifies with lineWidth: 0).
  return doc.toString({ lineWidth: 0 })
}
