/**
 * AI generation config, per editable canvas slot.
 *
 * This is the single source of truth that turns a slot identity (an
 * `EditableKind` from `canvasEditing.ts`, or the special `'theme'` slot, or an
 * image layer) into everything the prompt UI + generation route need:
 *
 *   - **modality**  — `'text'` (markdown / yaml / plaintext) or `'image'`.
 *   - **language**  — the exact format the model must emit for text slots, so
 *     the generated string drops straight into `mergeSlice(editedText)` without
 *     a shape mismatch.
 *   - **models**    — the *context-appropriate subset* of `@vismay/ai-gateway`
 *     aliases to offer (prose models for content, structured models for YAML,
 *     image models for image layers). First entry is the default.
 *   - **defaultSystem** — the editable default system prompt the PromptBar shows.
 *     Authors can tweak it per generation; it is never persisted.
 *   - **label**     — short human label for the prompt UI header.
 *
 * Both the client (`PromptBar.tsx`) and the server route
 * (`app/api/stories/[slug]/canvas/generate/route.ts`) read from here so
 * the offered models, output format, and default prompt can never drift apart.
 */

import type { EditableKind } from './canvasEditing'

/** Every slot the prompt UI can target: the editable kinds plus the theme slot
 *  (which lives in frontmatter, not the EditableKind union). Image layers reuse
 *  `kind: 'layer'` with `layerType: 'image'` — see {@link aiSlotConfig}. */
export type AiSlotKind = EditableKind | 'theme'

export type AiModality = 'text' | 'image'

export interface AiSlotConfig {
  modality: AiModality
  /** Output format the model must emit (text modality only). Drives the
   *  fence-stripping + validity check on the server and Monaco language hints. */
  language: 'yaml' | 'markdown' | 'plaintext'
  /** Context-appropriate model aliases. First entry is the default. */
  models: readonly string[]
  /** Editable default system prompt surfaced in the PromptBar. */
  defaultSystem: string
  /** Short label for the prompt UI header. */
  label: string
}

/* ─── Model alias sets (the "context-appropriate subset") ────────── */

/** Long-form editorial prose — content + narration scripts. */
const PROSE_MODELS = ['text.claude', 'text.opus', 'text.pro', 'text.fast', 'text.deepseek'] as const
/** Structured / strict output — YAML slices, layout tokens, theme objects. */
const STRUCT_MODELS = [
  'text.code',
  'text.pro',
  'text.codeLong',
  'text.proPlus',
  'text.fast',
  'text.codeCheap',
  'text.qwen',
  'text.glm',
] as const
/** Image layers. */
const IMAGE_MODELS = [
  'image.default',
  'image.imagen',
  'image.imagenFast',
  'image.imagenUltra',
  'image.seedream',
] as const

/** Friendly labels for the model dropdown. Falls back to the alias tail. */
export const MODEL_LABELS: Record<string, string> = {
  'text.fast': 'Gemini 3 Flash · fast',
  'text.pro': 'Gemini 3.1 Pro',
  'text.proPlus': 'GPT-5.5 · frontier',
  'text.claude': 'Claude Sonnet',
  'text.opus': 'Claude Opus · frontier',
  'text.code': 'GPT-5 Codex · code/YAML',
  'text.codeLong': 'Qwen3 Coder · 1M ctx',
  'text.codeBuild': 'Grok Build · code',
  'text.deepseek': 'DeepSeek V4 · cheap',
  'text.qwen': 'Qwen 3.5 Flash · cheap',
  'text.glm': 'GLM 4.7 Flash · cheapest',
  'text.codeCheap': 'Qwen3 Coder 30B · cheap',
  'image.default': 'Gemini Image',
  'image.imagen': 'Imagen 4',
  'image.imagenFast': 'Imagen 4 · fast',
  'image.imagenUltra': 'Imagen 4 · ultra',
  'image.seedream': 'Seedream · cheap',
}

export function modelLabel(alias: string): string {
  return MODEL_LABELS[alias] ?? alias.replace(/^(text|image)\./, '')
}

/* ─── Per-slot config ────────────────────────────────────────────── */

const RAW_TEXT_RULE =
  'Output ONLY the raw content for this one slice — no markdown code fences, no commentary, no surrounding keys.'

const SLOTS: Record<AiSlotKind, AiSlotConfig> = {
  content: {
    modality: 'text',
    language: 'markdown',
    models: PROSE_MODELS,
    label: 'Content',
    defaultSystem:
      'You write editorial prose for one section of a data-driven story. ' +
      'Given the author instruction, produce the section’s markdown body: ' +
      'paragraphs separated by blank lines. If the section already has a ' +
      'heading (a `## …` line), keep it EXACTLY as written — it is the ' +
      'section’s stable anchor — and revise only the paragraphs beneath it. ' +
      'Keep a clear, factual magazine register. ' +
      RAW_TEXT_RULE,
  },
  narration: {
    modality: 'text',
    language: 'plaintext',
    models: PROSE_MODELS,
    label: 'Narration',
    defaultSystem:
      'You write a short spoken narration script for one story unit, read aloud ' +
      'by text-to-speech. Keep it natural and concise (1–3 sentences). ' +
      'Output ONLY the script text — no quotes, no stage directions, no commentary.',
  },
  layout: {
    modality: 'text',
    language: 'plaintext',
    models: STRUCT_MODELS,
    label: 'Layout',
    defaultSystem:
      'You choose a foreground layout name for a story section ' +
      '(e.g. lead-charts-body, full-bleed, split). ' +
      'Output ONLY the single layout name as plain text — no quotes, no explanation.',
  },
  theme: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Theme',
    defaultSystem:
      'You author a Vizmaya theme as YAML: a mapping of colors ' +
      '(background, foreground, accent, panel…) and fonts. ' +
      'Output ONLY valid YAML for the theme mapping — no code fences, no ' +
      'commentary, no surrounding `theme:` key.',
  },
  share: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Share variants',
    defaultSystem:
      'You author a share-card override for one section as YAML ' +
      '(heading, hidePretext, paragraphsOverride, ratios…). ' +
      'Output ONLY valid YAML for the override mapping. ' +
      RAW_TEXT_RULE,
  },
  slides: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Slides override',
    defaultSystem:
      'You author a per-section slides export override page as YAML ' +
      '(include, heading, paragraphs, mapOverride…). ' +
      'Output ONLY valid YAML for the page mapping. ' +
      RAW_TEXT_RULE,
  },
  report: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Report override',
    defaultSystem:
      'You author a per-section report export override page as YAML ' +
      '(include, heading, paragraphs, mapOverride…). ' +
      'Output ONLY valid YAML for the page mapping. ' +
      RAW_TEXT_RULE,
  },
  map: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Map override',
    defaultSystem:
      'You author an autoplay map override as YAML: a `map:` camera block ' +
      '(center [lng, lat], zoom, pitch, bearing). ' +
      'Output ONLY valid YAML for the override mapping. ' +
      RAW_TEXT_RULE,
  },
  shareMap: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Share map',
    defaultSystem:
      'You author a share-card map override as YAML ' +
      '(center [lng, lat], zoom, pitch, bearing, optional pins, per-ratio overrides). ' +
      'Output ONLY valid YAML for the map mapping. ' +
      RAW_TEXT_RULE,
  },
  background: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Background',
    defaultSystem:
      'You author a section background as YAML: a single layer mapping or a YAML ' +
      'list of layers. Layer types include map (center/zoom), scene (id), image ' +
      '(src), or `{ type: none }` to suppress the backdrop. ' +
      'Output ONLY valid YAML. ' +
      RAW_TEXT_RULE,
  },
  defaults: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Deck defaults',
    defaultSystem:
      'You author the story-wide defaults block as YAML ' +
      '(storyBackground, overlay, panel, scroll, chart). ' +
      'Output ONLY valid YAML for the defaults mapping. ' +
      RAW_TEXT_RULE,
  },
  foreground: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Foreground',
    defaultSystem:
      'You author a section foreground as YAML, in one of three shapes: a flat ' +
      'list of layers, a single layer mapping, or a `layout:` + `regions:` mapping. ' +
      'Output ONLY valid YAML. ' +
      RAW_TEXT_RULE,
  },
  region: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Region',
    defaultSystem:
      'You author one foreground region’s content as YAML: a single layer ' +
      'mapping or a list of layers (chart, text, prose, image, spacer…). ' +
      'Output ONLY valid YAML. ' +
      RAW_TEXT_RULE,
  },
  layer: {
    modality: 'text',
    language: 'yaml',
    models: STRUCT_MODELS,
    label: 'Layer',
    defaultSystem:
      'You author one layer’s fields as YAML (e.g. a map: center/zoom/pitch/' +
      'bearing/pins, or a chart: id/props). ' +
      'Output ONLY valid YAML for the layer mapping. ' +
      RAW_TEXT_RULE,
  },
}

/** Config used for image layers (`kind: 'layer'`, `layerType: 'image'`). The
 *  system prompt is prepended to the user prompt since image models take no
 *  separate system message. */
const IMAGE_LAYER: AiSlotConfig = {
  modality: 'image',
  language: 'yaml',
  models: IMAGE_MODELS,
  label: 'Image',
  defaultSystem:
    'A single illustrative image for a data-story layer. Favour a clean, ' +
    'editorial composition with a restrained palette and clear focal subject.',
}

/* ─── Resolution ─────────────────────────────────────────────────── */

/**
 * Resolve the AI config for a slot. `layerType` only matters for `'layer'`:
 * an image layer routes to the image-generation config; every other layer type
 * edits its YAML. Returns null for an unknown kind.
 */
export function aiSlotConfig(
  kind: AiSlotKind,
  layerType?: string,
): AiSlotConfig | null {
  if (kind === 'layer' && layerType === 'image') return IMAGE_LAYER
  return SLOTS[kind] ?? null
}

/** Convenience: the model aliases to offer for a slot (default first). */
export function modelsForSlot(
  kind: AiSlotKind,
  layerType?: string,
): readonly string[] {
  return aiSlotConfig(kind, layerType)?.models ?? []
}

/** Model aliases appropriate for a raw format, when no slot kind is in play
 *  (e.g. the JSON chart-data editor, or a selection transform). Prose models
 *  for markdown/plaintext, structured models for yaml/json. Default first. */
export function modelsForLanguage(
  language: 'yaml' | 'markdown' | 'plaintext' | 'json',
): readonly string[] {
  return language === 'markdown' || language === 'plaintext'
    ? PROSE_MODELS
    : STRUCT_MODELS
}
