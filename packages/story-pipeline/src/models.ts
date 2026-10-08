/**
 * The text models offered in the composer UI. Aliases resolve in
 * `@vismay/ai-gateway`'s MODELS.text registry. Single source of truth so the
 * dropdown and the route allowlist can't drift.
 */

export interface ModelChoice {
  alias: string
  label: string
}

// Claude / GPT lead because the section `body` schema has discriminated unions
// that need tool-calling structured output. The pipeline falls back to a
// different-lineage tool-calling model automatically if the chosen one fails.
export const TEXT_MODEL_CHOICES: ReadonlyArray<ModelChoice> = [
  { alias: 'text.sonnet', label: 'Claude Sonnet 5.5 — long-form prose (default)' },
  { alias: 'text.opus', label: 'Claude Opus 5.5 — frontier editorial' },
  { alias: 'text.fable', label: 'Claude Fable 5 — frontier reasoning' },
  { alias: 'text.haiku', label: 'Claude Haiku 5.5 — fast + cheap' },
  { alias: 'text.proPlus', label: 'GPT-5.6 Sol — cross-provider' },
  { alias: 'text.terra', label: 'GPT-5.6 Terra — fast OpenAI flagship' },
  { alias: 'text.grok', label: 'Grok 4.5 — xAI, lowest latency' },
  { alias: 'text.luna', label: 'GPT-5.6 Luna — budget cross-provider' },
  { alias: 'text.deepseek', label: 'DeepSeek V4 — budget reasoning' },
]

export const DEFAULT_TEXT_MODEL = 'text.sonnet'

/**
 * Aliases no longer offered in the dropdown but still accepted from a client
 * that persisted one (they resolve to the Claude tier of the same weight).
 */
const LEGACY_TEXT_MODELS = new Set(['text.claude', 'text.pro', 'text.fast'])

/** Guard route input — only allow aliases we actually offer. */
export function isAllowedTextModel(alias: string): boolean {
  return TEXT_MODEL_CHOICES.some((c) => c.alias === alias) || LEGACY_TEXT_MODELS.has(alias)
}
