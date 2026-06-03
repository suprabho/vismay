/**
 * Ambient context channel for the ✨ Ask assistant.
 *
 * The assistant launcher lives in global chrome; the canvas (and its Monaco
 * editors) live deep in a page. To let "Ask" know what the author is looking at
 * WITHOUT prop-drilling or importing the canvas, this is a tiny pull-based
 * module channel:
 *   - the canvas registers a snapshot provider (active section + focused node),
 *   - an editor publishes its current text selection,
 *   - the launcher pulls both when it opens.
 *
 * On non-canvas pages nothing is registered, so `getAssistantContext()` returns
 * only whatever (if anything) the editor selection holds.
 */

/** Max chars of a node's value we attach — keeps the prompt + token cost sane. */
export const MAX_CONTEXT_VALUE = 3000

export interface AssistantNodeContext {
  /** Human label, e.g. "Foreground" or the slice title. */
  label: string
  /** The slot kind (content, layout, foreground, layer, …). */
  kind: string
  /** Layer type when the node is a layer (bigStat, chart, …). */
  layerType?: string
  /** The node's current value (YAML / markdown / text), capped. */
  value: string
}

export interface AssistantSectionContext {
  slug: string
  index: number
  id?: string
  kind?: string
  heading?: string
}

export interface AssistantContext {
  node?: AssistantNodeContext
  section?: AssistantSectionContext
  /** Text selected inside a code editor (Monaco), invisible to window selection. */
  editorSelection?: string
}

type Provider = () => Omit<AssistantContext, 'editorSelection'> | null

let provider: Provider | null = null
let editorSelection = ''

/** Register the canvas snapshot provider; returns an unregister function. */
export function registerAssistantContextProvider(fn: Provider): () => void {
  provider = fn
  return () => {
    if (provider === fn) provider = null
  }
}

/** Publish the current code-editor selection (empty string clears it). */
export function setAssistantEditorSelection(text: string): void {
  editorSelection = text
}

/* ─── Programmatic open ──────────────────────────────────────────── */

/** Options for opening the assistant from elsewhere (e.g. the selection menu). */
export interface OpenAssistantOptions {
  /** A question to seed the composer with. */
  prompt?: string
  /** Send `prompt` immediately as a fresh question (default true when prompt set). */
  autoSend?: boolean
}

type Opener = (opts?: OpenAssistantOptions) => void

let opener: Opener | null = null

/** Let the AssistantLauncher expose an open handler; returns an unregister fn. */
export function registerAssistantOpener(fn: Opener): () => void {
  opener = fn
  return () => {
    if (opener === fn) opener = null
  }
}

/** Open the ✨ Ask panel (optionally with a seeded/auto-sent question). Returns
 *  false when no launcher is mounted to handle it. */
export function openAssistant(opts?: OpenAssistantOptions): boolean {
  if (!opener) return false
  opener(opts)
  return true
}

/** Truncate a value to the context cap, with a marker when cut. */
export function capValue(value: string): string {
  if (value.length <= MAX_CONTEXT_VALUE) return value
  return `${value.slice(0, MAX_CONTEXT_VALUE)}\n… (truncated)`
}

/** Pull the current ambient context, or null when there's nothing to attach. */
export function getAssistantContext(): AssistantContext | null {
  let snap: Omit<AssistantContext, 'editorSelection'> | null = null
  try {
    snap = provider?.() ?? null
  } catch {
    snap = null
  }
  const sel = editorSelection.trim()
  if (!snap && !sel) return null
  return { ...(snap ?? {}), editorSelection: sel || undefined }
}
