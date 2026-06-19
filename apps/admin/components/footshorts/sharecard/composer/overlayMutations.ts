import type { Overlay, OverlayGroup } from '../types'

/**
 * Pure overlay/group mutations for the footshorts share-card composer. Adapted
 * from the vizmaya composer's `mutations.ts`, retyped to footshorts' FLAT
 * `Overlay` ({xPct,yPct,…} directly, not `{transform:{…}}`). Grouping is an
 * editor-only concept: membership is on each overlay's `groupId`, members are
 * kept CONTIGUOUS in the array (so the panel renders one block per group and
 * z-order stays coherent), and group transforms rewrite each member's own flat
 * fields (the renderer has no group awareness).
 */

/** The slice these functions operate on. */
export interface OverlayDoc {
  overlays: Overlay[]
  groups: OverlayGroup[]
}

/** What the panel / canvas is currently editing. */
export type Selection = { kind: 'overlay'; id: string } | { kind: 'group'; id: string }

let seq = 0
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`
}

export const clampPct = (n: number) => Math.min(100, Math.max(0, n))

export function groupName(g: OverlayGroup | undefined): string {
  return g?.name || 'Group'
}

// ── basic overlay ops ───────────────────────────────────────────────────────
export function addOverlay(doc: OverlayDoc, overlay: Overlay): OverlayDoc {
  return { ...doc, overlays: [...doc.overlays, overlay] }
}

export function updateOverlay(doc: OverlayDoc, id: string, patch: Partial<Overlay>): OverlayDoc {
  return { ...doc, overlays: doc.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }
}

export function removeOverlay(doc: OverlayDoc, id: string): OverlayDoc {
  const o = doc.overlays.find((e) => e.id === id)
  let overlays = doc.overlays.filter((e) => e.id !== id)
  const gid = o?.groupId
  if (gid) {
    const remaining = overlays.filter((e) => e.groupId === gid)
    // A group needs ≥2 members — never leave a "group of one". Strip the lone
    // survivor's groupId and drop the registry entry.
    if (remaining.length < 2) {
      if (remaining.length === 1)
        overlays = overlays.map((e) => (e.groupId === gid ? { ...e, groupId: undefined } : e))
      return { overlays, groups: doc.groups.filter((g) => g.id !== gid) }
    }
  }
  return { ...doc, overlays }
}

/** Duplicate one overlay as a STANDALONE copy (no group), nudged 3%. A grouped
 *  source's copy is inserted after the whole group block to keep members
 *  contiguous. Returns the new id so the caller can select it. */
export function duplicateOverlay(doc: OverlayDoc, id: string): { doc: OverlayDoc; newId: string | null } {
  const src = doc.overlays.find((e) => e.id === id)
  if (!src) return { doc, newId: null }
  const newId = uid('ov')
  const copy: Overlay = {
    ...src,
    id: newId,
    groupId: undefined,
    label: `${src.label} copy`,
    xPct: clampPct(src.xPct + 3),
    yPct: clampPct(src.yPct + 3),
  }
  const i = doc.overlays.findIndex((e) => e.id === id)
  const at = src.groupId ? groupRange(doc.overlays, src.groupId).end + 1 : i + 1
  const overlays = [...doc.overlays.slice(0, at), copy, ...doc.overlays.slice(at)]
  return { doc: { ...doc, overlays }, newId }
}

// ── blocks / contiguity ─────────────────────────────────────────────────────
/** First/last index of a group's contiguous run (−1/−1 if absent). */
function groupRange(els: Overlay[], gid: string): { start: number; end: number } {
  let start = -1
  let end = -1
  els.forEach((e, i) => {
    if (e.groupId === gid) {
      if (start < 0) start = i
      end = i
    }
  })
  return { start, end }
}

interface Block {
  groupId: string | null
  ids: string[]
}
function toBlocks(els: Overlay[]): Block[] {
  const blocks: Block[] = []
  for (const el of els) {
    const gid = el.groupId ?? null
    const last = blocks[blocks.length - 1]
    if (gid != null && last && last.groupId === gid) last.ids.push(el.id)
    else blocks.push({ groupId: gid, ids: [el.id] })
  }
  return blocks
}
function rebuildFromBlocks(doc: OverlayDoc, blocks: Block[]): OverlayDoc {
  const byId = new Map(doc.overlays.map((e) => [e.id, e]))
  const overlays = blocks.flatMap((b) => b.ids.map((id) => byId.get(id)!).filter(Boolean))
  return { ...doc, overlays }
}
function swapBlock(doc: OverlayDoc, match: (b: Block) => boolean, dir: 1 | -1): OverlayDoc {
  const blocks = toBlocks(doc.overlays)
  const bi = blocks.findIndex(match)
  if (bi < 0) return doc
  const bj = bi + dir
  if (bj < 0 || bj >= blocks.length) return doc
  const next = [...blocks]
  ;[next[bi], next[bj]] = [next[bj], next[bi]]
  return rebuildFromBlocks(doc, next)
}

/** Top-level z-order blocks for the panel: each is either a single ungrouped
 *  overlay (`group: null`) or a group with its ordered members. */
export function listBlocks(
  doc: OverlayDoc,
): Array<{ group: OverlayGroup | null; overlays: Overlay[] }> {
  const byId = new Map(doc.overlays.map((e) => [e.id, e]))
  const groupById = new Map(doc.groups.map((g) => [g.id, g]))
  return toBlocks(doc.overlays).map((b) => ({
    group: b.groupId ? (groupById.get(b.groupId) ?? { id: b.groupId, name: 'Group' }) : null,
    overlays: b.ids.map((id) => byId.get(id)!).filter(Boolean),
  }))
}

function defaultGroupName(doc: OverlayDoc): string {
  return `Group ${doc.groups.length + 1}`
}

// ── groups ──────────────────────────────────────────────────────────────────
/** Combine ≥2 overlays into a new group: tag them with a shared id and reorder
 *  them into one contiguous block at the topmost member's position. */
export function groupOverlays(
  doc: OverlayDoc,
  ids: string[],
  name?: string,
): { doc: OverlayDoc; groupId: string | null } {
  const idset = new Set(ids)
  const members = doc.overlays.filter((e) => idset.has(e.id))
  if (members.length < 2) return { doc, groupId: null }
  const gid = uid('grp')
  const firstIdx = doc.overlays.findIndex((e) => idset.has(e.id))
  const tagged = members.map((e) => ({ ...e, groupId: gid }))
  const overlays: Overlay[] = []
  doc.overlays.forEach((e, i) => {
    if (idset.has(e.id)) {
      if (i === firstIdx) overlays.push(...tagged) // emit the whole block once
      return
    }
    overlays.push(e)
  })
  const group: OverlayGroup = { id: gid, name: name?.trim() || defaultGroupName(doc) }
  return { doc: { overlays, groups: [...doc.groups, group] }, groupId: gid }
}

/** Disband a group: strip `groupId` from members and drop the registry entry. */
export function ungroupGroup(doc: OverlayDoc, gid: string): OverlayDoc {
  return {
    overlays: doc.overlays.map((e) => (e.groupId === gid ? { ...e, groupId: undefined } : e)),
    groups: doc.groups.filter((g) => g.id !== gid),
  }
}

export function renameGroup(doc: OverlayDoc, gid: string, name: string): OverlayDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.id === gid ? { ...g, name } : g)) }
}

export function setGroupCollapsed(doc: OverlayDoc, gid: string, collapsed: boolean): OverlayDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.id === gid ? { ...g, collapsed } : g)) }
}

/** Set every member's visibility (group eye toggle). */
export function setGroupVisible(doc: OverlayDoc, gid: string, visible: boolean): OverlayDoc {
  return { ...doc, overlays: doc.overlays.map((e) => (e.groupId === gid ? { ...e, visible } : e)) }
}

/** Delete a group AND all its members. */
export function removeGroup(doc: OverlayDoc, gid: string): OverlayDoc {
  return {
    overlays: doc.overlays.filter((e) => e.groupId !== gid),
    groups: doc.groups.filter((g) => g.id !== gid),
  }
}

/** Duplicate a whole group, nudged 3%, inserted right after the source block. */
export function duplicateGroup(doc: OverlayDoc, gid: string): { doc: OverlayDoc; groupId: string | null } {
  const members = doc.overlays.filter((e) => e.groupId === gid)
  if (!members.length) return { doc, groupId: null }
  const newGid = uid('grp')
  const copies: Overlay[] = members.map((m) => ({
    ...m,
    id: uid('ov'),
    groupId: newGid,
    xPct: clampPct(m.xPct + 3),
    yPct: clampPct(m.yPct + 3),
  }))
  const end = groupRange(doc.overlays, gid).end
  const overlays = [...doc.overlays.slice(0, end + 1), ...copies, ...doc.overlays.slice(end + 1)]
  const src = doc.groups.find((g) => g.id === gid)
  const group: OverlayGroup = { id: newGid, name: `${groupName(src)} copy` }
  return { doc: { overlays, groups: [...doc.groups, group] }, groupId: newGid }
}

/** Move a whole group up (+1, toward front) / down (−1) past the adjacent block. */
export function moveGroup(doc: OverlayDoc, gid: string, dir: 1 | -1): OverlayDoc {
  return swapBlock(doc, (b) => b.groupId === gid, dir)
}

/** Move an overlay in z-order. Ungrouped moves past the adjacent block (a group
 *  counts as one unit); grouped moves only WITHIN its group's range. */
export function moveOverlay(doc: OverlayDoc, id: string, dir: 1 | -1): OverlayDoc {
  const el = doc.overlays.find((e) => e.id === id)
  if (!el) return doc
  if (el.groupId == null) return swapBlock(doc, (b) => b.groupId == null && b.ids[0] === id, dir)
  const range = groupRange(doc.overlays, el.groupId)
  const i = doc.overlays.findIndex((e) => e.id === id)
  const j = i + dir
  if (j < range.start || j > range.end) return doc
  const next = [...doc.overlays]
  ;[next[i], next[j]] = [next[j], next[i]]
  return { ...doc, overlays: next }
}

/** Force every group's members contiguous (block at the first member's
 *  position) and prune empty / singleton groups. Run on load so a card edited
 *  outside the block-aware reorders still renders one header per group. */
export function normalizeGroupContiguity(doc: OverlayDoc): OverlayDoc {
  const seen = new Set<string>()
  const out: Overlay[] = []
  for (const el of doc.overlays) {
    const gid = el.groupId
    if (gid == null) {
      out.push(el)
      continue
    }
    if (seen.has(gid)) continue
    seen.add(gid)
    out.push(...doc.overlays.filter((e) => e.groupId === gid))
  }
  // Drop registry entries with no members, and demote any "group of one".
  const counts = new Map<string, number>()
  for (const e of out) if (e.groupId) counts.set(e.groupId, (counts.get(e.groupId) ?? 0) + 1)
  const overlays = out.map((e) =>
    e.groupId && (counts.get(e.groupId) ?? 0) < 2 ? { ...e, groupId: undefined } : e,
  )
  const groups = doc.groups.filter((g) => (counts.get(g.id) ?? 0) >= 2)
  return { overlays, groups }
}
