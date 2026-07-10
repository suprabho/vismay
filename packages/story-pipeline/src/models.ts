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
// that need tool-calling structured output; Gemini's JSON mode can't satisfy
// them ("response did not match schema"). The pipeline still falls back to a
// tool-calling model automatically if a Gemini option is chosen and fails.
export const TEXT_MODEL_CHOICES: ReadonlyArray<ModelChoice> = [
  { alias: 'text.claude', label: 'Claude Sonnet 4.6 — long-form prose (default)' },
  { alias: 'text.opus', label: 'Claude Opus 4.8 — frontier editorial' },
  { alias: 'text.fable', label: 'Claude Fable 5 — frontier reasoning' },
  { alias: 'text.proPlus', label: 'GPT-5.6 Sol — cross-provider' },
  { alias: 'text.pro', label: 'Gemini 3.1 Pro — fast, but weaker at union schemas' },
  { alias: 'text.deepseek', label: 'DeepSeek V4 — budget reasoning' },
  { alias: 'text.fast', label: 'Gemini 3 Flash — fast + cheap' },
]

export const DEFAULT_TEXT_MODEL = 'text.claude'

/** Guard route input — only allow aliases we actually offer. */
export function isAllowedTextModel(alias: string): boolean {
  return TEXT_MODEL_CHOICES.some((c) => c.alias === alias)
}
