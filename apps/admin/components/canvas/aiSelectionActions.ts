/**
 * Preset "Ask AI" actions for a text selection inside a code editor.
 *
 * Two kinds of action, surfaced together in the floating selection menu
 * (`SelectionAiOverlay.tsx`):
 *
 *   - **edit** — rewrites the selection in place. `text` is the instruction
 *     handed to the `/canvas/transform` route; the result replaces the
 *     selected range (with an Accept/Reject preview first).
 *   - **ask**  — opens the ✨ Ask panel pre-seeded with `text` as the question.
 *     The selection rides along as context (the assistant context channel
 *     already carries the editor selection), so questions can say "this".
 *
 * Suggestions are layered, per the design: a **base set keyed by language**
 * (markdown / yaml / json / plaintext) merged with **per-slot extras** keyed by
 * the slot kind (and layer type for `kind: 'layer'`). `selectionActions()`
 * resolves and dedupes them — edits first, then asks.
 */

export type SelectionLanguage = 'markdown' | 'yaml' | 'json' | 'plaintext'
export type SelectionMode = 'edit' | 'ask'

export interface SelectionAction {
  /** Stable id, also used to dedupe a base action shadowed by a slot extra. */
  id: string
  /** Short button label. */
  label: string
  mode: SelectionMode
  /** edit → the rewrite instruction; ask → the seeded question. */
  text: string
}

/* ─── Base sets, by language ─────────────────────────────────────── */

const MARKDOWN_BASE: SelectionAction[] = [
  {
    id: 'shorten',
    label: 'Shorten',
    mode: 'edit',
    text: 'Make this noticeably shorter while keeping the key facts and meaning. Match the surrounding voice.',
  },
  {
    id: 'clarify',
    label: 'Clarify',
    mode: 'edit',
    text: 'Rewrite this to read more clearly and smoothly, keeping the meaning and roughly the same length.',
  },
  {
    id: 'punchier',
    label: 'Punchier',
    mode: 'edit',
    text: 'Rewrite this in a punchier, more engaging editorial voice. Do not invent new facts or numbers.',
  },
  {
    id: 'fix-grammar',
    label: 'Fix grammar',
    mode: 'edit',
    text: 'Fix grammar, spelling and punctuation only. Leave wording and meaning otherwise unchanged.',
  },
  {
    id: 'explain',
    label: 'Explain',
    mode: 'ask',
    text: 'Explain what this passage says and how it reads.',
  },
]

const YAML_BASE: SelectionAction[] = [
  {
    id: 'reformat',
    label: 'Reformat',
    mode: 'edit',
    text: 'Reformat this YAML with clean, consistent 2-space indentation. Do not change any keys or values.',
  },
  {
    id: 'explain',
    label: 'Explain',
    mode: 'ask',
    text: 'Explain what this YAML configures and what each field does.',
  },
  {
    id: 'whats-wrong',
    label: "What's wrong?",
    mode: 'ask',
    text: 'Check this YAML for mistakes, invalid fields or wrong types and tell me what is wrong and how to fix it.',
  },
]

const JSON_BASE: SelectionAction[] = [
  {
    id: 'reformat',
    label: 'Reformat',
    mode: 'edit',
    text: 'Reformat this JSON with consistent 2-space indentation. Do not change any keys or values.',
  },
  {
    id: 'explain',
    label: 'Explain',
    mode: 'ask',
    text: 'Explain what this JSON represents and what each field means.',
  },
  {
    id: 'whats-wrong',
    label: "What's wrong?",
    mode: 'ask',
    text: 'Check this JSON for mistakes or invalid values and tell me what is wrong and how to fix it.',
  },
]

const PLAINTEXT_BASE: SelectionAction[] = [
  {
    id: 'shorten',
    label: 'Shorten',
    mode: 'edit',
    text: 'Make this shorter while keeping the meaning.',
  },
  {
    id: 'fix-grammar',
    label: 'Fix grammar',
    mode: 'edit',
    text: 'Fix grammar, spelling and punctuation only. Leave the wording otherwise unchanged.',
  },
  {
    id: 'explain',
    label: 'Explain',
    mode: 'ask',
    text: 'Explain what this says.',
  },
]

const BASE_BY_LANGUAGE: Record<SelectionLanguage, SelectionAction[]> = {
  markdown: MARKDOWN_BASE,
  yaml: YAML_BASE,
  json: JSON_BASE,
  plaintext: PLAINTEXT_BASE,
}

/* ─── Per-slot extras ────────────────────────────────────────────── */

/** Extras keyed by slot kind. Merged after the language base; an extra with the
 *  same id as a base action overrides it (lets a slot specialise "explain"). */
const EXTRAS_BY_KIND: Record<string, SelectionAction[]> = {
  content: [
    {
      id: 'warmer',
      label: 'Warmer tone',
      mode: 'edit',
      text: 'Rewrite this in a warmer, more human tone. Do not add new facts.',
    },
    {
      id: 'more-factual',
      label: 'More factual',
      mode: 'edit',
      text: 'Tighten this to be more factual and concrete. Remove fluff and hedging; keep every real fact.',
    },
  ],
  narration: [
    {
      id: 'natural',
      label: 'More natural',
      mode: 'edit',
      text: 'Rewrite as a natural, spoken-sounding narration line for text-to-speech. Keep it to 1–2 sentences.',
    },
  ],
  map: [
    {
      id: 'explain-camera',
      label: 'Explain camera',
      mode: 'ask',
      text: 'Explain what these map camera values (center, zoom, pitch, bearing) do to the view.',
    },
  ],
  chartData: [
    {
      id: 'add-point',
      label: 'Add data point',
      mode: 'edit',
      text: 'Add one more category and its value(s) to this chart, following the exact existing structure. Use only a figure grounded in the story context — do not invent numbers.',
    },
    {
      id: 'check-numbers',
      label: 'Check numbers',
      mode: 'ask',
      text: 'Check these chart numbers against the story context — do the categories and values match the established facts?',
    },
  ],
}

/** Extras keyed by a layer's type (only consulted when `kind === 'layer'`). */
const EXTRAS_BY_LAYER_TYPE: Record<string, SelectionAction[]> = {
  chart: [
    {
      id: 'add-series',
      label: 'Add a series',
      mode: 'edit',
      text: 'Add one new data series to this chart config, following the exact shape of the existing series.',
    },
  ],
}

/* ─── Resolution ─────────────────────────────────────────────────── */

/**
 * Resolve the actions to offer for a selection: the language base plus any
 * slot/layer extras, deduped by id (a later same-id entry wins) and ordered
 * edits-first. `kind`/`layerType` are optional — a generic JSON editor with no
 * slot identity still gets the language base.
 */
export function selectionActions(
  language: SelectionLanguage,
  kind?: string,
  layerType?: string,
): SelectionAction[] {
  const merged = new Map<string, SelectionAction>()
  for (const a of BASE_BY_LANGUAGE[language] ?? []) merged.set(a.id, a)
  if (kind && EXTRAS_BY_KIND[kind]) {
    for (const a of EXTRAS_BY_KIND[kind]) merged.set(a.id, a)
  }
  if (kind === 'layer' && layerType && EXTRAS_BY_LAYER_TYPE[layerType]) {
    for (const a of EXTRAS_BY_LAYER_TYPE[layerType]) merged.set(a.id, a)
  }
  const all = [...merged.values()]
  return [
    ...all.filter((a) => a.mode === 'edit'),
    ...all.filter((a) => a.mode === 'ask'),
  ]
}