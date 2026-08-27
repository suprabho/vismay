import type {
  BackgroundLayer,
  CardComposition,
  ElementGroup,
  ElementLayer,
  TextBlock,
  Transform,
} from '../layers/types'

/** What the inspector is currently editing. */
export type Selection =
  | { kind: 'background' }
  | { kind: 'element'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'text'; which: 'heading' | 'subheading' }
  | { kind: 'annotation'; id: string }
  | { kind: 'branding' }

let seq = 0
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`
}

export function setBackground(c: CardComposition, background: BackgroundLayer): CardComposition {
  return { ...c, background }
}

export function patchBackground(c: CardComposition, patch: Partial<BackgroundLayer>): CardComposition {
  return { ...c, background: { ...c.background, ...patch } as BackgroundLayer }
}

export function addElement(c: CardComposition, element: ElementLayer): CardComposition {
  return { ...c, elements: [...c.elements, element] }
}

export function updateElement(c: CardComposition, id: string, patch: Partial<ElementLayer>): CardComposition {
  return {
    ...c,
    elements: c.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ElementLayer) : e)),
  }
}

export function patchElementTransform(c: CardComposition, id: string, t: Partial<Transform>): CardComposition {
  return {
    ...c,
    elements: c.elements.map((e) => (e.id === id ? { ...e, transform: { ...e.transform, ...t } } : e)),
  }
}

export function removeElement(c: CardComposition, id: string): CardComposition {
  const el = c.elements.find((e) => e.id === id)
  let elements = c.elements.filter((e) => e.id !== id)
  const gid = el?.groupId
  if (gid) {
    const remaining = elements.filter((e) => e.groupId === gid)
    // A group needs ≥2 members. If this delete drops it below that, strip the
    // lone survivor (if any) and prune the registry — never leave a "group of one".
    if (remaining.length < 2) {
      if (remaining.length === 1) elements = elements.map((e) => (e.groupId === gid ? { ...e, groupId: undefined } : e))
      return { ...c, elements, groups: (c.groups ?? []).filter((g) => g.id !== gid) }
    }
  }
  return { ...c, elements }
}

/** Duplicate a single element as a STANDALONE copy (no group), nudged 3% so it
 *  isn't perfectly hidden behind the source. A grouped source's copy is inserted
 *  just after the whole group block to keep group members contiguous. Returns the
 *  new id so the caller can select it. */
export function duplicateElement(
  c: CardComposition,
  id: string,
): { composition: CardComposition; newId: string | null } {
  const src = c.elements.find((e) => e.id === id)
  if (!src) return { composition: c, newId: null }
  const newId = uid('el')
  const copy = {
    ...src,
    id: newId,
    groupId: undefined,
    name: `${src.name} copy`,
    transform: { ...src.transform, xPct: clampPct(src.transform.xPct + 3), yPct: clampPct(src.transform.yPct + 3) },
  } as ElementLayer
  const i = c.elements.findIndex((e) => e.id === id)
  const at = src.groupId ? groupRange(c.elements, src.groupId).end + 1 : i + 1
  const elements = [...c.elements.slice(0, at), copy, ...c.elements.slice(at)]
  return { composition: { ...c, elements }, newId }
}

// ── groups ────────────────────────────────────────────────────────────────────
const clampPct = (n: number) => Math.min(100, Math.max(0, n))

/** First/last index of a group's contiguous run (−1/−1 if absent). */
function groupRange(els: ElementLayer[], gid: string): { start: number; end: number } {
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

/** Top-level z-order blocks: a run of same-group elements, or a single ungrouped
 *  element. Relies on the contiguity invariant (one block per group). */
interface Block {
  groupId: string | null
  ids: string[]
}
function toBlocks(els: ElementLayer[]): Block[] {
  const blocks: Block[] = []
  for (const el of els) {
    const gid = el.groupId ?? null
    const last = blocks[blocks.length - 1]
    if (gid != null && last && last.groupId === gid) last.ids.push(el.id)
    else blocks.push({ groupId: gid, ids: [el.id] })
  }
  return blocks
}
function rebuildFromBlocks(c: CardComposition, blocks: Block[]): CardComposition {
  const byId = new Map(c.elements.map((e) => [e.id, e]))
  const elements = blocks.flatMap((b) => b.ids.map((id) => byId.get(id)!).filter(Boolean))
  return { ...c, elements }
}
function swapBlock(c: CardComposition, match: (b: Block) => boolean, dir: 1 | -1): CardComposition {
  const blocks = toBlocks(c.elements)
  const bi = blocks.findIndex(match)
  if (bi < 0) return c
  const bj = bi + dir
  if (bj < 0 || bj >= blocks.length) return c
  const next = [...blocks]
  ;[next[bi], next[bj]] = [next[bj], next[bi]]
  return rebuildFromBlocks(c, next)
}

export function groupName(g: ElementGroup | undefined): string {
  return g?.name || 'Group'
}

/** Top-level blocks resolved for the panel: each is either a single ungrouped
 *  element (`group: null`) or a group with its ordered members, in z-order. */
export function listBlocks(
  c: CardComposition,
): Array<{ group: ElementGroup | null; elements: ElementLayer[] }> {
  const byId = new Map(c.elements.map((e) => [e.id, e]))
  const groupById = new Map((c.groups ?? []).map((g) => [g.id, g]))
  return toBlocks(c.elements).map((b) => ({
    group: b.groupId ? (groupById.get(b.groupId) ?? { id: b.groupId, name: 'Group' }) : null,
    elements: b.ids.map((id) => byId.get(id)!).filter(Boolean),
  }))
}

function defaultGroupName(c: CardComposition): string {
  return `Group ${(c.groups?.length ?? 0) + 1}`
}

/** Combine ≥2 elements into a new group: tag them with a shared id and reorder
 *  them into one contiguous block at the position of the topmost member. Returns
 *  the new group id (null if fewer than 2 valid ids). */
export function groupElements(
  c: CardComposition,
  ids: string[],
  name?: string,
): { composition: CardComposition; groupId: string | null } {
  const idset = new Set(ids)
  const members = c.elements.filter((e) => idset.has(e.id))
  if (members.length < 2) return { composition: c, groupId: null }
  const gid = uid('grp')
  const firstIdx = c.elements.findIndex((e) => idset.has(e.id))
  const tagged = members.map((e) => ({ ...e, groupId: gid }) as ElementLayer)
  const elements: ElementLayer[] = []
  c.elements.forEach((e, i) => {
    if (idset.has(e.id)) {
      if (i === firstIdx) elements.push(...tagged) // emit the whole block once
      return
    }
    elements.push(e)
  })
  const group: ElementGroup = { id: gid, name: name?.trim() || defaultGroupName(c) }
  return { composition: { ...c, elements, groups: [...(c.groups ?? []), group] }, groupId: gid }
}

/** Disband a group: strip `groupId` from members (leaving them in place) and
 *  drop the registry entry. */
export function ungroupGroup(c: CardComposition, gid: string): CardComposition {
  const elements = c.elements.map((e) =>
    e.groupId === gid ? ({ ...e, groupId: undefined } as ElementLayer) : e,
  )
  return { ...c, elements, groups: (c.groups ?? []).filter((g) => g.id !== gid) }
}

export function renameGroup(c: CardComposition, gid: string, name: string): CardComposition {
  return { ...c, groups: (c.groups ?? []).map((g) => (g.id === gid ? { ...g, name } : g)) }
}

export function setGroupCollapsed(c: CardComposition, gid: string, collapsed: boolean): CardComposition {
  return { ...c, groups: (c.groups ?? []).map((g) => (g.id === gid ? { ...g, collapsed } : g)) }
}

/** Set every member's visibility (group eye toggle). */
export function setGroupVisible(c: CardComposition, gid: string, visible: boolean): CardComposition {
  return { ...c, elements: c.elements.map((e) => (e.groupId === gid ? { ...e, visible } : e)) }
}

/** Delete a group AND all its members. */
export function removeGroup(c: CardComposition, gid: string): CardComposition {
  return {
    ...c,
    elements: c.elements.filter((e) => e.groupId !== gid),
    groups: (c.groups ?? []).filter((g) => g.id !== gid),
  }
}

/** Duplicate a whole group into a new group, nudged 3%, inserted right after the
 *  source block. */
export function duplicateGroup(
  c: CardComposition,
  gid: string,
): { composition: CardComposition; groupId: string | null } {
  const members = c.elements.filter((e) => e.groupId === gid)
  if (!members.length) return { composition: c, groupId: null }
  const newGid = uid('grp')
  const copies = members.map(
    (m) =>
      ({
        ...m,
        id: uid('el'),
        groupId: newGid,
        transform: { ...m.transform, xPct: clampPct(m.transform.xPct + 3), yPct: clampPct(m.transform.yPct + 3) },
      }) as ElementLayer,
  )
  const end = groupRange(c.elements, gid).end
  const elements = [...c.elements.slice(0, end + 1), ...copies, ...c.elements.slice(end + 1)]
  const src = (c.groups ?? []).find((g) => g.id === gid)
  const group: ElementGroup = { id: newGid, name: `${groupName(src)} copy` }
  return { composition: { ...c, elements, groups: [...(c.groups ?? []), group] }, groupId: newGid }
}

/** Move a whole group up (+1, toward front) / down (−1) past the adjacent block. */
export function moveGroup(c: CardComposition, gid: string, dir: 1 | -1): CardComposition {
  return swapBlock(c, (b) => b.groupId === gid, dir)
}

/** Move an element in z-order. An ungrouped element moves past the adjacent
 *  block (a group counts as one unit); a grouped element moves only WITHIN its
 *  group's range, so it can't silently fall out of the group. */
export function moveElement(c: CardComposition, id: string, dir: 1 | -1): CardComposition {
  const el = c.elements.find((e) => e.id === id)
  if (!el) return c
  if (el.groupId == null) return swapBlock(c, (b) => b.groupId == null && b.ids[0] === id, dir)
  const range = groupRange(c.elements, el.groupId)
  const i = c.elements.findIndex((e) => e.id === id)
  const j = i + dir
  if (j < range.start || j > range.end) return c
  const next = [...c.elements]
  ;[next[i], next[j]] = [next[j], next[i]]
  return { ...c, elements: next }
}

/** Defensive: force every group's members to be contiguous (block at the first
 *  member's position), so a card edited outside the block-aware reorders still
 *  renders one header per group. Run on load. */
export function normalizeGroupContiguity(c: CardComposition): CardComposition {
  if (!c.groups?.length) return c
  const seen = new Set<string>()
  const out: ElementLayer[] = []
  for (const el of c.elements) {
    const gid = el.groupId
    if (gid == null) {
      out.push(el)
      continue
    }
    if (seen.has(gid)) continue
    seen.add(gid)
    out.push(...c.elements.filter((e) => e.groupId === gid))
  }
  return { ...c, elements: out }
}

// ── text blocks ─────────────────────────────────────────────────────────────
export function setHeading(c: CardComposition, heading: TextBlock | undefined): CardComposition {
  return { ...c, text: { ...c.text, heading } }
}
export function setSubheading(c: CardComposition, subheading: TextBlock | undefined): CardComposition {
  return { ...c, text: { ...c.text, subheading } }
}
export function addAnnotation(c: CardComposition, block: TextBlock): CardComposition {
  return { ...c, text: { ...c.text, annotations: [...c.text.annotations, block] } }
}
export function updateAnnotation(c: CardComposition, id: string, patch: Partial<TextBlock>): CardComposition {
  return {
    ...c,
    text: {
      ...c.text,
      annotations: c.text.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    },
  }
}
export function removeAnnotation(c: CardComposition, id: string): CardComposition {
  return { ...c, text: { ...c.text, annotations: c.text.annotations.filter((a) => a.id !== id) } }
}

/** Patch whichever text block the selection points at. */
export function patchSelectedText(c: CardComposition, sel: Selection, patch: Partial<TextBlock>): CardComposition {
  if (sel.kind === 'text') {
    const cur = sel.which === 'heading' ? c.text.heading : c.text.subheading
    if (!cur) return c
    const next = { ...cur, ...patch }
    return sel.which === 'heading' ? setHeading(c, next) : setSubheading(c, next)
  }
  if (sel.kind === 'annotation') return updateAnnotation(c, sel.id, patch)
  return c
}

export function getSelectedText(c: CardComposition, sel: Selection): TextBlock | undefined {
  if (sel.kind === 'text') return sel.which === 'heading' ? c.text.heading : c.text.subheading
  if (sel.kind === 'annotation') return c.text.annotations.find((a) => a.id === sel.id)
  return undefined
}
