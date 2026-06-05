/**
 * The text models offered in the composer UI. Aliases resolve in
 * `@vismay/ai-gateway`'s MODELS.text registry. Single source of truth so the
 * dropdown and the route allowlist can't drift.
 */

export interface ModelChoice {
  alias: string
  label: string
}

export const TEXT_MODEL_CHOICES: ReadonlyArray<ModelChoice> = [
  { alias: 'text.pro', label: 'Gemini 3.1 Pro — reasoning + strict JSON (default)' },
  { alias: 'text.opus', label: 'Claude Opus 4.8 — frontier editorial' },
  { alias: 'text.claude', label: 'Claude Sonnet 4.6 — long-form prose' },
  { alias: 'text.proPlus', label: 'GPT-5.5 — cross-provider second opinion' },
  { alias: 'text.deepseek', label: 'DeepSeek V4 — budget reasoning' },
  { alias: 'text.fast', label: 'Gemini 3 Flash — fast + cheap' },
]

export const DEFAULT_TEXT_MODEL = 'text.pro'

/** Guard route input — only allow aliases we actually offer. */
export function isAllowedTextModel(alias: string): boolean {
  return TEXT_MODEL_CHOICES.some((c) => c.alias === alias)
}
