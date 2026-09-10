/**
 * Stage-editor postMessage protocol (W2 — on-canvas manipulation), shared by
 * both sides of the iframe boundary: `StageEditChrome` (inside the preview
 * iframe) and the admin timeline's `PreviewFrame` (the parent). House style:
 * flat `{ type, ... }` payloads, `'*'` target, shape guards on receipt.
 *
 * The full editor protocol table lives in
 * docs/stage-timeline-and-section-transitions.md.
 */

/** parent → iframe: which entity is selected, and whether a drag on it can
 *  write a keyframe at the current beat (no keyframe on beat → view-only). */
export interface StageSelectionMsg {
  type: 'viz-story-selection'
  id: string | null
  editable: boolean
}

/** iframe → parent: the user pressed on an entity (select-then-drag). */
export interface StageEntityPointerDownMsg {
  type: 'viz-story-entity-pointerdown'
  id: string
}

/** One gesture edits exactly one channel group. Values are ABSOLUTE
 *  cumulative-from-gesture-start stage units (idempotent to re-apply). */
export type StageEditPatch =
  | { x: number; y: number }
  | { scale: number }
  | { rotation: number }

/** iframe → parent: a live transform edit from an on-canvas gesture. */
export interface StageEntityEditMsg {
  type: 'viz-story-entity-edit'
  id: string
  /** Unique per gesture (e.g. `move:orca:12345`) — the parent's undo editKey. */
  gesture: string
  phase: 'move' | 'end'
  patch: StageEditPatch
}

/** iframe → parent: a hotkey pressed while focus sits inside the iframe
 *  (clicking the preview focuses the cross-origin document, so the admin
 *  page's own keydown listeners never fire) — forwarded as an intent. */
export interface StageHotkeyMsg {
  type: 'viz-story-hotkey'
  action: 'undo' | 'save'
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export function isStageHotkeyMsg(d: unknown): d is StageHotkeyMsg {
  const m = d as StageHotkeyMsg | null
  return m?.type === 'viz-story-hotkey' && (m.action === 'undo' || m.action === 'save')
}

export function isStageEntityPointerDownMsg(d: unknown): d is StageEntityPointerDownMsg {
  const m = d as StageEntityPointerDownMsg | null
  return m?.type === 'viz-story-entity-pointerdown' && typeof m.id === 'string' && m.id.length > 0
}

export function isStageEntityEditMsg(d: unknown): d is StageEntityEditMsg {
  const m = d as StageEntityEditMsg | null
  if (m?.type !== 'viz-story-entity-edit') return false
  if (typeof m.id !== 'string' || m.id.length === 0) return false
  if (typeof m.gesture !== 'string' || (m.phase !== 'move' && m.phase !== 'end')) return false
  const p = m.patch as Record<string, unknown> | null
  if (p == null || typeof p !== 'object') return false
  if ('x' in p || 'y' in p) return finite(p.x) && finite(p.y)
  if ('scale' in p) return finite(p.scale)
  if ('rotation' in p) return finite(p.rotation)
  return false
}
