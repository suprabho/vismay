import type { ComposerLayer, ComposerState, LayerGroup } from './types'
import { composerUid } from './mutations'
import { DEFAULT_TRANSFORM } from './transform'

/**
 * Free-mode grouping: tag layers with a shared `groupId`, kept CONTIGUOUS in the
 * layers array so the panel renders one block per group and z-order stays
 * coherent. Ported from the vizmaya share-card composer's group mutations,
 * generalized from `CardComposition`/`ElementLayer` to `ComposerState`/`ComposerLayer`.
 */

const clampPct = (n: number) => Math.min(100, Math.max(0, n))

export function groupName(g: LayerGroup | undefined): string {
  return g?.name || 'Group'
}

/** First/last index of a group's contiguous run (−1/−1 if absent). */
function groupRange(layers: ComposerLayer[], gid: string): { start: number; end: number } {
  let start = -1
  let end = -1
  layers.forEach((l, i) => {
    if (l.groupId === gid) {
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

function toBlocks(layers: ComposerLayer[]): Block[] {
  const blocks: Block[] = []
  for (const l of layers) {
    const gid = l.groupId ?? null
    const last = blocks[blocks.length - 1]
    if (gid != null && last && last.groupId === gid) last.ids.push(l.id)
    else blocks.push({ groupId: gid, ids: [l.id] })
  }
  return blocks
}

function rebuildFromBlocks(state: ComposerState, blocks: Block[]): ComposerState {
  const byId = new Map(state.layers.map((l) => [l.id, l]))
  const layers = blocks.flatMap((b) => b.ids.map((id) => byId.get(id)!).filter(Boolean))
  return { ...state, layers }
}

function swapBlock(state: ComposerState, match: (b: Block) => boolean, dir: 1 | -1): ComposerState {
  const blocks = toBlocks(state.layers)
  const bi = blocks.findIndex(match)
  if (bi < 0) return state
  const bj = bi + dir
  if (bj < 0 || bj >= blocks.length) return state
  const next = [...blocks]
  ;[next[bi], next[bj]] = [next[bj], next[bi]]
  return rebuildFromBlocks(state, next)
}

/** Top-level blocks for the panel: each is a single ungrouped layer (`group:
 *  null`) or a group with its ordered members, in z-order. */
export function listBlocks(
  state: ComposerState,
): Array<{ group: LayerGroup | null; layers: ComposerLayer[] }> {
  const byId = new Map(state.layers.map((l) => [l.id, l]))
  const groupById = new Map((state.groups ?? []).map((g) => [g.id, g]))
  return toBlocks(state.layers).map((b) => ({
    group: b.groupId ? (groupById.get(b.groupId) ?? { id: b.groupId, name: 'Group' }) : null,
    layers: b.ids.map((id) => byId.get(id)!).filter(Boolean),
  }))
}

function defaultGroupName(state: ComposerState): string {
  return `Group ${(state.groups?.length ?? 0) + 1}`
}

/** Combine ≥2 layers into a new group: tag them + reorder into one contiguous
 *  block at the topmost member's position. Returns the new group id. */
export function groupLayers(
  state: ComposerState,
  ids: string[],
  name?: string,
): { state: ComposerState; groupId: string | null } {
  const idset = new Set(ids)
  const members = state.layers.filter((l) => idset.has(l.id))
  if (members.length < 2) return { state, groupId: null }
  const gid = composerUid('grp')
  const firstIdx = state.layers.findIndex((l) => idset.has(l.id))
  const tagged = members.map((l) => ({ ...l, groupId: gid }))
  const layers: ComposerLayer[] = []
  state.layers.forEach((l, i) => {
    if (idset.has(l.id)) {
      if (i === firstIdx) layers.push(...tagged)
      return
    }
    layers.push(l)
  })
  const group: LayerGroup = { id: gid, name: name?.trim() || defaultGroupName(state) }
  return { state: { ...state, layers, groups: [...(state.groups ?? []), group] }, groupId: gid }
}

/** Disband a group: strip `groupId` from members, drop the registry entry. */
export function ungroup(state: ComposerState, gid: string): ComposerState {
  const layers = state.layers.map((l) => (l.groupId === gid ? { ...l, groupId: undefined } : l))
  return { ...state, layers, groups: (state.groups ?? []).filter((g) => g.id !== gid) }
}

export function renameGroup(state: ComposerState, gid: string, name: string): ComposerState {
  return { ...state, groups: (state.groups ?? []).map((g) => (g.id === gid ? { ...g, name } : g)) }
}

export function setGroupCollapsed(state: ComposerState, gid: string, collapsed: boolean): ComposerState {
  return { ...state, groups: (state.groups ?? []).map((g) => (g.id === gid ? { ...g, collapsed } : g)) }
}

/** Set every member's visibility (group eye toggle). */
export function setGroupVisible(state: ComposerState, gid: string, visible: boolean): ComposerState {
  return { ...state, layers: state.layers.map((l) => (l.groupId === gid ? { ...l, visible } : l)) }
}

/** Delete a group AND all its members. */
export function removeGroup(state: ComposerState, gid: string): ComposerState {
  return {
    ...state,
    layers: state.layers.filter((l) => l.groupId !== gid),
    groups: (state.groups ?? []).filter((g) => g.id !== gid),
  }
}

/** Duplicate a whole group into a new group, nudged 3%, inserted after the source. */
export function duplicateGroup(
  state: ComposerState,
  gid: string,
): { state: ComposerState; groupId: string | null } {
  const members = state.layers.filter((l) => l.groupId === gid)
  if (!members.length) return { state, groupId: null }
  const newGid = composerUid('grp')
  const copies = members.map((m) => {
    const t = m.transform ?? DEFAULT_TRANSFORM
    return {
      ...m,
      id: composerUid('layer'),
      groupId: newGid,
      transform: { ...t, xPct: clampPct(t.xPct + 3), yPct: clampPct(t.yPct + 3) },
    }
  })
  const end = groupRange(state.layers, gid).end
  const layers = [...state.layers.slice(0, end + 1), ...copies, ...state.layers.slice(end + 1)]
  const src = (state.groups ?? []).find((g) => g.id === gid)
  const group: LayerGroup = { id: newGid, name: `${groupName(src)} copy` }
  return { state: { ...state, layers, groups: [...(state.groups ?? []), group] }, groupId: newGid }
}

/** Move a whole group up (+1 toward front) / down (−1) past the adjacent block. */
export function moveGroup(state: ComposerState, gid: string, dir: 1 | -1): ComposerState {
  return swapBlock(state, (b) => b.groupId === gid, dir)
}

/** Move a layer in z-order. Ungrouped moves past the adjacent block (a group
 *  counts as one unit); a grouped layer moves only WITHIN its group's range. */
export function moveLayerOrdered(state: ComposerState, id: string, dir: 1 | -1): ComposerState {
  const l = state.layers.find((x) => x.id === id)
  if (!l) return state
  if (l.groupId == null) return swapBlock(state, (b) => b.groupId == null && b.ids[0] === id, dir)
  const range = groupRange(state.layers, l.groupId)
  const i = state.layers.findIndex((x) => x.id === id)
  const j = i + dir
  if (j < range.start || j > range.end) return state
  const layers = [...state.layers]
  ;[layers[i], layers[j]] = [layers[j], layers[i]]
  return { ...state, layers }
}

/** Force every group's members contiguous (block at the first member's position).
 *  Run on load so a card edited outside the block-aware reorders still renders
 *  one header per group. */
export function normalizeGroupContiguity(state: ComposerState): ComposerState {
  if (!state.groups?.length) return state
  const seen = new Set<string>()
  const out: ComposerLayer[] = []
  for (const l of state.layers) {
    const gid = l.groupId
    if (gid == null) {
      out.push(l)
      continue
    }
    if (seen.has(gid)) continue
    seen.add(gid)
    out.push(...state.layers.filter((x) => x.groupId === gid))
  }
  return { ...state, layers: out }
}
