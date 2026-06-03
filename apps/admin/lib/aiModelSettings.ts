import { createServiceClient } from '@vismay/content-source/supabase'

/**
 * Per-feature AI model mapping.
 *
 * Each AI surface ("feature") resolves its model from `ai_model_settings`
 * (set on the admin "AI models" page) with a code default as fallback. Routes
 * call `getFeatureModel(key)`; the model-mapping API reads/writes the table.
 *
 * The model the user picks live in a per-request picker (Ask, selection edit)
 * still wins — this mapping is the DEFAULT that picker falls back to, and the
 * sole model for features with no picker (evaluate, section generate).
 */

export type Modality = 'text' | 'image'

export interface AiFeature {
  key: string
  label: string
  modality: Modality
  /** Code default when no override row exists. An @vismay/ai-gateway alias. */
  default: string
  description: string
}

export const AI_FEATURES: AiFeature[] = [
  {
    key: 'assistant',
    label: 'Ask assistant',
    modality: 'text',
    default: 'text.deepseek',
    description: 'The ✨ Ask Q&A panel (default; the in-panel picker can override).',
  },
  {
    key: 'generate',
    label: 'Slot generate (text / YAML)',
    modality: 'text',
    default: 'text.pro',
    description: 'Per-slot ✨ generation default, when it fits the slot’s model set.',
  },
  {
    key: 'generateSection',
    label: 'Section generate',
    modality: 'text',
    default: 'text.pro',
    description: 'Generate a whole new section from a brief.',
  },
  {
    key: 'transform',
    label: 'Selection edit',
    modality: 'text',
    default: 'text.pro',
    description: 'In-editor ✨ Edit on a selection (when it fits the slot’s model set).',
  },
  {
    key: 'evaluate',
    label: 'Evaluator (vision)',
    modality: 'text',
    default: 'text.pro',
    description: 'Vision critique of a rendered section — needs a vision-capable model.',
  },
  {
    key: 'generateImage',
    label: 'Image generate',
    modality: 'image',
    default: 'image.default',
    description: 'AI image layers (default; the layer picker can override).',
  },
]

const DEFAULTS: Record<string, string> = Object.fromEntries(
  AI_FEATURES.map((f) => [f.key, f.default]),
)

/** The full feature → alias map (overrides merged over code defaults). */
export async function getFeatureModelMap(): Promise<Record<string, string>> {
  const map = { ...DEFAULTS }
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('ai_model_settings')
      .select('feature, model_alias')
    for (const row of data ?? []) {
      if (typeof row.model_alias === 'string' && row.model_alias) {
        map[row.feature as string] = row.model_alias
      }
    }
  } catch {
    // Table missing / db down → code defaults. Generation must never break here.
  }
  return map
}

/** The resolved model alias for one feature (override or code default). */
export async function getFeatureModel(key: string): Promise<string> {
  const map = await getFeatureModelMap()
  return map[key] ?? DEFAULTS[key] ?? 'text.pro'
}

/** Upsert a feature's model override. */
export async function setFeatureModel(
  key: string,
  modelAlias: string,
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('ai_model_settings')
    .upsert(
      { feature: key, model_alias: modelAlias, updated_at: new Date().toISOString() },
      { onConflict: 'feature' },
    )
  if (error) throw new Error(error.message)
}
