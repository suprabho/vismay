import { isCollection, isMap, isSeq, parseDocument } from 'yaml'
import type { Document } from 'yaml'
import type { StageConfig, StageEntity, StageKeyframe } from '@vismay/viz-engine'

/**
 * Splice the edited stage back into the raw config text — the editor's save
 * serializer. W3 generalization: an id-matched entity diff supporting entity
 * add/remove and keyframe add/remove, not just in-place keyframe edits.
 *
 * Uses `yaml`'s Document API (`parseDocument` + targeted `setIn`), the same
 * comment-preserving round-trip `DeckComposerPanel`'s `spliceForeground`
 * uses, so comments and formatting OUTSIDE the replaced nodes survive
 * verbatim. Replaced nodes re-emit in the config's authored idiom —
 * block-style keys with flow-style values (`- at: { section: maxq }` /
 * `transform: { position: … }` each on their own line).
 *
 * Algorithm (entities matched by id):
 *  1. REMOVALS — baseline entities missing from `edited`: `deleteIn` by
 *     DESCENDING index so earlier indices never shift.
 *  2. MATCHES — for each edited entity that survives in the doc:
 *     (a) deep-equal to baseline → untouched (all comments intact);
 *     (b) entity-level fields equal AND same keyframe count → per-CHANGED-
 *         keyframe replace (each keyframe's own attached comments carried);
 *     (c) anything else (keyframe count changed, content/enter/exit/… edits)
 *         → whole-entity replace, carrying the entity node's own comments.
 *         DOCUMENTED COST: comments attached to that entity's INTERNAL
 *         keyframes are lost — that entity only.
 *  3. ADDITIONS — appended in edited order; a story with no stage at all
 *     gets `defaults.stage.entities` created.
 *
 * ORDER INVARIANT (what makes the id-diff sound): edited entity order =
 * baseline order minus removals, with additions appended. The stageEditing
 * helpers enforce this by construction (`addEntity` appends, `removeEntity`
 * filters, nothing reorders).
 *
 * Operates on raw text only — never serialize the `loadStoryConfig` object,
 * which has engine defaults merged in and would inject them into the file.
 */

const ENT = ['defaults', 'stage', 'entities'] as const

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

type CommentedNode = { commentBefore?: string; comment?: string }

/** Block keys, flow values — one keyframe map (`- at: {…}` idiom). */
function formatKeyframeNode(node: unknown) {
  if (!isMap(node)) return
  for (const pair of node.items) {
    if (isCollection(pair.value)) pair.value.flow = true
  }
}

/** The file's authored entity idiom: entity map block; every non-`keyframes`
 *  collection value flow; `keyframes` a block seq of flow-valued maps. */
function formatEntityNode(node: unknown) {
  if (!isMap(node)) return
  for (const pair of node.items) {
    const key = String((pair.key as { value?: unknown })?.value ?? pair.key)
    if (key === 'keyframes' && isSeq(pair.value)) {
      for (const item of pair.value.items) formatKeyframeNode(item)
    } else if (isCollection(pair.value)) {
      pair.value.flow = true
    }
  }
}

function carryComments(doc: Document, path: unknown[], node: CommentedNode) {
  const old = doc.getIn(path, true) as CommentedNode | undefined
  if (old?.commentBefore) node.commentBefore = old.commentBefore
  if (old?.comment) node.comment = old.comment
}

function spliceKeyframe(doc: Document, yamlIdx: number, k: number, kf: StageKeyframe) {
  const path = [...ENT, yamlIdx, 'keyframes', k]
  const node = doc.createNode(kf) as CommentedNode
  formatKeyframeNode(node)
  carryComments(doc, path, node)
  doc.setIn(path, node)
}

function spliceWholeEntity(doc: Document, yamlIdx: number, entity: StageEntity) {
  const path = [...ENT, yamlIdx]
  const node = doc.createNode(entity) as CommentedNode
  formatEntityNode(node)
  carryComments(doc, path, node)
  doc.setIn(path, node)
}

/** Entity-level fields equal (everything but the keyframes array)? */
function entityShellEqual(a: StageEntity, b: StageEntity): boolean {
  const { keyframes: _a, ...aRest } = a
  const { keyframes: _b, ...bRest } = b
  return deepEq(aRest, bRest)
}

export function spliceStageIntoConfig(
  configText: string,
  baseline: StageConfig | null,
  edited: StageConfig
): string {
  const doc = parseDocument(configText)
  const baseEntities = baseline?.entities ?? []
  const editedIds = new Set(edited.entities.map((e) => e.id))
  const baseIds = new Set(baseEntities.map((e) => e.id))

  // 1. Removals, descending index.
  const removedIdx = baseEntities
    .map((e, i) => (editedIds.has(e.id) ? -1 : i))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a)
  for (const i of removedIdx) doc.deleteIn([...ENT, i])

  // Surviving baseline order → current doc index per id.
  const survivors = baseEntities.filter((e) => editedIds.has(e.id))
  const yamlIdxById = new Map(survivors.map((e, i) => [e.id, i]))
  const baseById = new Map(baseEntities.map((e) => [e.id, e]))

  // 2. Matches.
  for (const entity of edited.entities) {
    const b = baseById.get(entity.id)
    if (!b) continue
    const yamlIdx = yamlIdxById.get(entity.id)!
    if (deepEq(b, entity)) continue
    if (entityShellEqual(b, entity) && b.keyframes.length === entity.keyframes.length) {
      entity.keyframes.forEach((kf, k) => {
        if (!deepEq(b.keyframes[k], kf)) spliceKeyframe(doc, yamlIdx, k, kf)
      })
    } else {
      spliceWholeEntity(doc, yamlIdx, entity)
    }
  }

  // 3. Additions, appended in edited order.
  const additions = edited.entities.filter((e) => !baseIds.has(e.id))
  if (additions.length > 0) {
    if (!isSeq(doc.getIn(ENT as unknown as unknown[]))) {
      doc.setIn([...ENT], doc.createNode([]))
    }
    for (const entity of additions) {
      const node = doc.createNode(entity)
      formatEntityNode(node)
      doc.addIn([...ENT], node)
    }
  }

  // lineWidth: 0 disables wrapping so the file's long single-line flow maps
  // re-emit byte-identical instead of being re-wrapped at 80 columns (same
  // reason canvasSlotEditing stringifies with lineWidth: 0).
  return doc.toString({ lineWidth: 0 })
}
