import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  generateText,
  hashRequest,
  recordGeneration,
  resolveModel,
} from '@vismay/ai-gateway'
import {
  aiSlotConfig,
  modelsForLanguage,
  type AiSlotKind,
} from '@/components/canvas/aiSlots'
import { buildSlotSchemaPrompt } from '@/components/canvas/overrideSchemas'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { buildSlotContext } from '@/lib/slotContext'

/**
 * Transform a *fragment* the author selected inside an editor — the in-place
 * "✨ Ask AI" edit path (`SelectionAiOverlay.tsx`).
 *
 * Unlike `canvas/generate` (which produces a whole slot value), this takes the
 * selected substring + an instruction and returns ONLY the replacement
 * substring, so it can drop straight back into the same range. There is no
 * whole-document validation — a fragment is rarely valid YAML/JSON on its own.
 *
 * Reuses the gateway + audit plumbing: every call writes an `ai_generations`
 * row (`kind: 'text'`, `params.mode: 'transform'`).
 */

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const MAX_SELECTION_LENGTH = 12000
const MAX_INSTRUCTION_LENGTH = 2000

const LANGUAGES = ['markdown', 'yaml', 'json', 'plaintext'] as const
type TransformLanguage = (typeof LANGUAGES)[number]

interface TransformBody {
  /** Format of the surrounding document — drives the system prompt + models. */
  language: TransformLanguage
  /** The selected text to rewrite. */
  selection: string
  /** What to do to it (a preset instruction or the author's free text). */
  instruction: string
  /** Optional slot identity — sharpens the model set when present. */
  kind?: AiSlotKind
  layerType?: string
  /** Optional model alias; must belong to the resolved allowed set. */
  model?: string
  /** The section the fragment lives in (indexes config.sections) — lets the
   *  route load the live story/section/data context. Optional: degrades to the
   *  story-frame-only context when absent. */
  parentIndex?: number
  subIndex?: number
}

const LANGUAGE_LABEL: Record<TransformLanguage, string> = {
  markdown: 'Markdown',
  yaml: 'YAML',
  json: 'JSON',
  plaintext: 'plain text',
}

function systemPrompt(language: TransformLanguage): string {
  const label = LANGUAGE_LABEL[language]
  const formatRule =
    language === 'markdown' || language === 'plaintext'
      ? 'Preserve the surrounding voice and formatting.'
      : `Preserve the fragment's ${label} shape and its exact indentation so it drops back in where it was. Do not add a parent key or wrapping that was not in the selection.`
  return (
    `You are editing a fragment of ${label} that the author selected inside a ` +
    `larger document. Apply the instruction to the fragment. ` +
    formatRule +
    ` Return ONLY the replacement fragment — no code fences, no commentary, ` +
    `no explanation. If the instruction reads as a question rather than an edit, ` +
    `still return only the (possibly unchanged) fragment.`
  )
}

/** Coerce a body field to a non-negative integer, or undefined. */
function intOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
}

/** Strip a leading/trailing markdown code fence the model sometimes adds. */
function stripCodeFence(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return (m ? m[1] : t).trim()
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  let body: TransformBody
  try {
    body = (await req.json()) as TransformBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const language = LANGUAGES.includes(body.language)
    ? body.language
    : 'plaintext'

  const selection = typeof body.selection === 'string' ? body.selection : ''
  if (!selection.trim()) {
    return NextResponse.json({ error: 'missing "selection"' }, { status: 400 })
  }
  if (selection.length > MAX_SELECTION_LENGTH) {
    return NextResponse.json(
      { error: `selection exceeds ${MAX_SELECTION_LENGTH} chars` },
      { status: 400 },
    )
  }

  const instruction =
    typeof body.instruction === 'string' ? body.instruction.trim() : ''
  if (!instruction) {
    return NextResponse.json({ error: 'missing "instruction"' }, { status: 400 })
  }
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    return NextResponse.json(
      { error: `instruction exceeds ${MAX_INSTRUCTION_LENGTH} chars` },
      { status: 400 },
    )
  }

  // Allowed models: the slot's set when a kind is given (so a transform offers
  // the same models as full generation), else the language default.
  const slotConfig = body.kind ? aiSlotConfig(body.kind, body.layerType) : null
  const allowed =
    slotConfig?.modality === 'text'
      ? slotConfig.models
      : modelsForLanguage(language)
  const requested = typeof body.model === 'string' ? body.model : null
  const featureDefault = await getFeatureModel('transform')
  const modelAlias =
    requested && allowed.includes(requested)
      ? requested
      : allowed.includes(featureDefault)
        ? featureDefault
        : allowed[0]
  let modelId: string
  try {
    modelId = resolveModel(modelAlias)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid model' },
      { status: 400 },
    )
  }

  // Ground the edit in the slot's schema when we know the slot, so the model
  // edits within the real field vocabulary instead of inventing fields.
  const schemaPrompt = body.kind
    ? buildSlotSchemaPrompt(body.kind, body.layerType)
    : null
  const system = schemaPrompt
    ? `${systemPrompt(language)}\n\nThe fragment belongs to this slot. Keep your ` +
      `edit consistent with its schema — use only these fields/shapes, do not ` +
      `invent keys:\n${schemaPrompt}`
    : systemPrompt(language)

  // Live story/section/data context so a fragment edit stays consistent with
  // the story it's embedded in (palette, real chart ids, established facts).
  // Best effort — a context failure must never block the edit.
  const context = await buildSlotContext({
    slug,
    parentIndex: intOrUndefined(body.parentIndex),
    subIndex: intOrUndefined(body.subIndex),
    kind: body.kind,
    layerType: body.layerType,
  }).catch(() => null)
  const userPrompt = context
    ? `${context}\n\n---\n\nInstruction: ${instruction}\n\nFragment:\n${selection}`
    : `Instruction: ${instruction}\n\nFragment:\n${selection}`

  let raw: string
  try {
    const out = await generateText({
      model: modelAlias,
      system,
      prompt: userPrompt,
      metadata: { feature: 'admin-canvas-transform', slug, language },
    })
    raw = out.result
  } catch (e) {
    return NextResponse.json(
      {
        error: `transform failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    )
  }

  const value = stripCodeFence(raw)

  // Audit row — best-effort, never blocks the response.
  let generationId: string | null = null
  let auditWarning: string | null = null
  try {
    const supabase = createServiceClient()
    const requestHash = hashRequest({
      model: modelId,
      prompt: instruction,
      params: { language, kind: body.kind ?? null, mode: 'transform' },
    })
    const row = await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: instruction,
      model: modelId,
      params: {
        mode: 'transform',
        language,
        slotKind: body.kind ?? null,
        layerType: body.layerType ?? null,
      },
      resultRef: null,
      resultText: value,
      requestHash,
    })
    generationId = row.id
  } catch (e) {
    auditWarning = e instanceof Error ? e.message : 'audit log insert failed'
  }

  return NextResponse.json({
    ok: true,
    value,
    language,
    generation: { id: generationId, model: modelId, auditWarning },
  })
}
