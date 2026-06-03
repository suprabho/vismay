# Plan: context-aware Ask — pass canvas node / selected text to the assistant

**Status: plan-only. No code yet.**

## Goal

Make the platform Q&A assistant aware of **what the author is currently looking
at**, so questions like "what does this layer do?", "why isn't this rendering?",
or "rewrite this" work without re-pasting the content. Three ambient context
sources, captured when the **✨ Ask** panel opens:

1. **Selected text** — whatever the author has highlighted anywhere (an editor
   panel, a preview, the docs).
2. **Focused canvas node** — the input node they're editing or have selected on
   the Rete canvas (its kind/layerType + current value).
3. **On-screen section** — the active section being viewed (story slug + index +
   kind), as the fallback "what's on screen".

The assistant then resolves "this/here" against the attached context.

## The coupling problem

[AssistantLauncher](../apps/admin/components/AssistantLauncher.tsx) is a **global
header** component; the canvas ([CanvasClient.tsx](../apps/admin/components/vizmaya/canvas/CanvasClient.tsx))
is a deep client component on one page. The launcher must read canvas state
**without** prop-drilling or importing the canvas. Solution: a tiny module-level
channel, **pull-based** — the canvas registers a snapshot provider; the launcher
asks for the current context when it opens. On non-canvas pages no provider is
registered, so it just returns null.

```
CanvasClient  ──registerAssistantContextProvider(() => snapshot)──►  lib/assistantContext.ts
AssistantLauncher  ──getAssistantContext() on open──────────────────►  (calls the provider)
                   ──window.getSelection() on open────────────────►  selected text
```

Pull beats push here: the canvas already holds the state (activeSectionIndex,
editorTarget, editorSlice, the Rete selector); it just exposes a function that
snapshots it on demand, instead of firing updates on every change.

## Pieces

**New — `lib/assistantContext.ts`** (tiny, framework-free):
```ts
export interface AssistantContext {
  node?: { label: string; kind: string; layerType?: string; value: string }
  section?: { slug: string; index: number; id?: string; kind?: string }
}
let provider: (() => AssistantContext | null) | null = null
export function registerAssistantContextProvider(fn: typeof provider): () => void
export function getAssistantContext(): AssistantContext | null  // calls provider
```
Selected text is captured by the launcher itself (`window.getSelection()`), not
the provider — it's DOM-global and needs no canvas coupling.

**CanvasClient** — register a provider (in an effect) that snapshots:
- `section`: from `activeSectionIndex` + `sectionViews[idx]` (slug, id, kind).
- `node`: the **focused** input — priority: an open `editorTarget`/`slotTarget`
  (use `editorSlice.text` for the value, `editorTarget.kind`/`layerType`), else
  the Rete-`selector()`-selected node, else none. Cap the value length.
Unregister on unmount so stale snapshots don't linger.

**AssistantLauncher** — on open:
- capture `window.getSelection().toString()` (BEFORE the panel grabs focus),
- call `getAssistantContext()`,
- show a **context-chip row**: e.g. `Foreground · bigStat ✕` and/or
  `Selected text (42 chars) ✕`, each detachable; an author can drop any piece
  they don't want sent.
- include the (kept) context in the POST body.

**Assistant route** — accept an optional `context` field and prepend a
**context block** to the conversation it sends the model:
```
## Current context (what the author is looking at)
Story: <slug> · section 3 ("Revenue clears $18.7B", kind bigStat)
Focused node: foreground layer (bigStat). Its current value:
<yaml/markdown value>
Selected text: "<…>"
```
plus a line in the system rules: *"When the author says 'this/here', they mean
the current context above."* Cap each field's length (the node value especially).

## Request shape

```ts
// POST /api/vizmaya/assistant
{
  messages: [...],
  context?: {
    selectedText?: string,
    node?: { label, kind, layerType?, value },
    section?: { slug, index, id?, kind? },
  }
}
```
All optional; the route renders only what's present. Existing callers (no
context) are unaffected.

## Build order

1. `lib/assistantContext.ts` + register a provider in CanvasClient (snapshot
   section + focused node). Verifiable by logging the snapshot.
2. Route: accept `context`, render the context block, add the "this/here" rule.
3. Launcher: capture selection + pull context on open, context chips, send it.

## Open decisions

- **A. Selected-text source** — v1: `window.getSelection()` (covers panels,
  previews, docs). The Monaco editor keeps its selection in its own model; if we
  want code-editor selections too, read the Monaco instance later. Recommend
  window selection for v1.
- **B. Focused-node definition** — open editor/inspector > Rete-selected node >
  none (recommended). Alternative: always the active section's primary node.
- **C. Snapshot vs live** — snapshot on open (v1); the chips let the author
  correct it. Live-updating the chips while the panel is open is a later nicety.
- **D. Auto-attach vs opt-in** — auto-attach detected context (shown as
  removable chips) is the lowest-friction default; vs a manual "attach current
  selection" button. Recommend auto-attach + detach.
- **E. Size/privacy caps** — cap node value (e.g. 2–3 KB) and selected text;
  truncate with a note so a huge selection can't blow the token budget.
