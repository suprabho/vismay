'use client'

/**
 * Reusable AI prompt-input for the canvas.
 *
 * One component drives both halves of the AI integration: it mounts on input
 * nodes (Feature 1) and inside every edit panel (the panel half). It reads the
 * slot's generation config from `aiSlots.ts` — modality, the model subset to
 * offer, and the editable **default system prompt** — and POSTs to the shared
 * `canvas/generate` route.
 *
 * On success it hands the result back to the host via `onApply` (text slots:
 * the generated string) or `onApplyImage` (image layers: the new asset). The
 * host owns persistence — it routes the value through the same `mergeSlice` →
 * `saveSlice` path a manual edit uses, so this component never touches the
 * config files directly.
 *
 * Modelled on `GenerateImagePanel.tsx`: the prompt persists across generations
 * so authors can iterate (tweak → regenerate) without retyping.
 */

import { useState } from 'react'
import {
  aiSlotConfig,
  modelLabel,
  type AiSlotKind,
} from './aiSlots'
import { buildSlotSchemaPrompt } from './overrideSchemas'
import GenerationFeedback from './GenerationFeedback'

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
type AspectRatio = (typeof ASPECT_RATIOS)[number]

export interface PromptBarImageResult {
  assetRef: string
  url: string
  filename: string
}

interface Props {
  slug: string
  kind: AiSlotKind
  /** Required for image layers — routes `kind: 'layer'` to image generation. */
  layerType?: string
  /** Current slice value, sent as context so the model revises rather than
   *  starts from scratch. */
  currentValue?: string
  /** Text slots: receives the generated string (ready for the editor / merge). */
  onApply?: (value: string) => void
  /** Image layers: receives the uploaded asset. */
  onApplyImage?: (result: PromptBarImageResult) => void
  /** Overrides the slot's default system prompt as the initial value. */
  defaultSystemPrompt?: string
  onClose?: () => void
}

/**
 * The `type:` discriminant of a single-layer YAML mapping, or null. Used to
 * recover the layer type when a caller (e.g. EditorPanel editing an existing
 * layer) doesn't pass `layerType` but the type is right there in the content.
 * `image` is excluded so YAML editing never flips the bar into image-gen mode.
 */
function layerTypeFromYaml(text?: string): string | null {
  if (!text) return null
  const m = text.match(/^type:\s*['"]?([A-Za-z][A-Za-z0-9]*)/m)
  return m && m[1] !== 'image' ? m[1] : null
}

export default function PromptBar({
  slug,
  kind,
  layerType,
  currentValue,
  onApply,
  onApplyImage,
  defaultSystemPrompt,
  onClose,
}: Props) {
  // When a layer slot arrives without a concrete type, recover it from the YAML
  // being edited so the schema prompt matches the real layer (not the generic).
  const effectiveLayerType =
    kind === 'layer' && !layerType
      ? (layerTypeFromYaml(currentValue) ?? undefined)
      : layerType

  const config = aiSlotConfig(kind, effectiveLayerType)
  // Schema-aware default: the exact accepted YAML shape for this slot (derived
  // from the layer module's adminForm, or the override-slot schema), so the
  // author sees and can tweak the real fields. Image layers and non-derivable
  // slots fall back to the slot's generic default.
  const schemaPrompt = buildSlotSchemaPrompt(kind, effectiveLayerType)

  const [prompt, setPrompt] = useState('')
  const [system, setSystem] = useState(
    defaultSystemPrompt ?? schemaPrompt ?? config?.defaultSystem ?? '',
  )
  const [showSystem, setShowSystem] = useState(false)
  const [model, setModel] = useState(config?.models[0] ?? '')
  const [aspect, setAspect] = useState<AspectRatio>('1:1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Last generation's audit-row id (for the feedback row) and, for text slots,
  // the value it produced — fed back as `current` when the author refines.
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [lastValue, setLastValue] = useState<string | null>(null)
  const [refineNote, setRefineNote] = useState('')

  if (!config) return null
  const isImage = config.modality === 'image'

  /**
   * Run a generation. With no override it uses the author's prompt + the slot's
   * current value as context. The refine path passes an override: the change
   * instruction as the prompt and the *just-generated* value as `current`, so
   * the route revises the last output rather than the saved slot.
   */
  async function handleGenerate(override?: { prompt: string; current: string }) {
    const trimmed = override?.prompt.trim() ?? prompt.trim()
    if (!trimmed) {
      setError(override ? 'Refine note is empty.' : 'Prompt is empty.')
      return
    }
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch(
        `/api/vizmaya/stories/${encodeURIComponent(slug)}/canvas/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            layerType: effectiveLayerType,
            prompt: trimmed,
            system: system.trim() || undefined,
            model,
            aspectRatio: isImage ? aspect : undefined,
            current: override?.current ?? currentValue,
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        value?: string
        asset?: PromptBarImageResult
        generation?: {
          id?: string | null
          model?: string
          warning?: string | null
          auditWarning?: string | null
        }
        error?: string
      }
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      if (isImage) {
        if (!body.asset) throw new Error('no asset returned')
        onApplyImage?.(body.asset)
      } else {
        if (typeof body.value !== 'string') throw new Error('no value returned')
        onApply?.(body.value)
        setLastValue(body.value)
      }

      // A fresh generation supersedes any prior feedback target.
      setGenerationId(body.generation?.id ?? null)
      if (override) setRefineNote('')

      const served = body.generation?.model
      const warn = body.generation?.warning
      setNote(
        [
          served ? `Generated by ${served}.` : 'Generated.',
          warn ? `⚠ ${warn}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-white/10 rounded bg-neutral-950/60">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <span className="text-xs text-neutral-300">✨ Generate · {config.label}</span>
        <button
          type="button"
          onClick={() => setShowSystem((s) => !s)}
          className="text-[10px] text-neutral-500 hover:text-white"
        >
          {showSystem ? 'Hide system prompt' : 'System prompt'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[11px] text-neutral-500 hover:text-white px-1"
            aria-label="Close prompt"
          >
            ×
          </button>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {showSystem && (
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            disabled={busy}
            rows={4}
            className="w-full bg-neutral-900 text-neutral-300 text-[11px] leading-relaxed p-2 rounded border border-white/10 resize-vertical focus:outline-none focus:border-white/30 disabled:opacity-40"
            placeholder="System prompt"
          />
        )}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder={`Describe the ${config.label.toLowerCase()} you want…`}
          className="w-full bg-neutral-950 text-neutral-100 text-[12px] leading-relaxed p-2 rounded border border-white/10 resize-vertical focus:outline-none focus:border-white/30 disabled:opacity-40"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy}
            className="bg-neutral-900 text-neutral-300 text-[11px] px-2 py-1 rounded border border-white/10 focus:outline-none focus:border-white/30 disabled:opacity-40"
          >
            {config.models.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </select>

          {isImage && (
            <div className="flex items-center gap-1 text-[11px] text-neutral-500">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspect(r)}
                  disabled={busy}
                  className={
                    'px-2 py-0.5 rounded border text-[11px] ' +
                    (aspect === r
                      ? 'border-white/40 text-white bg-white/5'
                      : 'border-white/10 text-neutral-400 hover:text-white hover:bg-white/5') +
                    ' disabled:opacity-40'
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || !prompt.trim()}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-white text-neutral-950 disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {error && <div className="text-[11px] text-red-400">{error}</div>}
        {!error && note && (
          <div className="text-[10px] text-emerald-300/70">{note}</div>
        )}

        {/* After a generation: refine the result (text slots) and rate it. */}
        {note && !isImage && lastValue !== null && (
          <div className="flex items-start gap-2">
            <textarea
              value={refineNote}
              onChange={(e) => setRefineNote(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Refine it… e.g. “shorter”, “warmer tone”, “fix the number to 18.7”"
              className="flex-1 resize-vertical rounded border border-white/10 bg-neutral-900 p-1.5 text-[11px] leading-relaxed text-neutral-200 focus:border-white/30 focus:outline-none disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() =>
                void handleGenerate({ prompt: refineNote, current: lastValue })
              }
              disabled={busy || !refineNote.trim()}
              className="shrink-0 rounded bg-white/10 px-2.5 py-1.5 text-[11px] text-neutral-100 hover:bg-white/20 disabled:opacity-40"
            >
              Refine
            </button>
          </div>
        )}

        {note && (
          <GenerationFeedback slug={slug} generationId={generationId} />
        )}
      </div>
    </div>
  )
}
