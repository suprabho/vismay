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
  listForegroundLayouts,
  listModulesForSlot,
} from '@vismay/viz-engine'
import { aiSlotConfig, type AiSlotKind } from '@/components/canvas/aiSlots'
import {
  buildSlotSchemaPrompt,
  type VerticalLayerExtras,
} from '@/components/canvas/overrideSchemas'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { resolveStoryPack } from '@/lib/storyPack'

/**
 * Repair a slot's YAML so it satisfies the schema — the ✨ "Fix with AI" path
 * behind every schema-mismatch warning (unknown layout, unregistered layer
 * type, missing required fields).
 *
 * Unlike `canvas/transform` (which edits a free-text selection against a vague
 * instruction), this is a *constrained repair*: the caller passes the broken
 * fragment plus the machine-detected problems, and the route injects the exact
 * valid vocabulary (legal layout names + foreground layer types from the live
 * registry) on top of the slot's schema prompt. The model must change only what
 * the problems require and keep the author's content intact.
 *
 * Reuses the gateway + audit plumbing: every call writes an `ai_generations`
 * row (`kind: 'text'`, `params.mode: 'fix'`).
 */

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const MAX_FRAGMENT_LENGTH = 12000
const MAX_PROBLEMS = 20

interface FixBody {
  /** The slot identity — drives schema grounding + the allowed model set. */
  kind: AiSlotKind
  layerType?: string
  /** The broken YAML to repair (e.g. a whole `foreground` mapping). */
  fragment: string
  /** Machine-detected mismatch descriptions to fix. */
  problems: string[]
  /** Optional model alias; must belong to the slot's allowed set. */
  model?: string
}

/** Strip a leading/trailing markdown code fence the model sometimes adds. */
function stripCodeFence(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return (m ? m[1] : t).trim()
}

/** The valid vocabulary block for the slot — what the model is allowed to use.
 *  `extras` (the story's vertical pack layer types) keeps a vertical layer like
 *  `fs:match-card` IN vocabulary, so a repair never strips it as unknown. */
function vocabularyPrompt(kind: AiSlotKind, extras: VerticalLayerExtras = []): string | null {
  // Only foreground-shaped slots reference layouts / layer types.
  if (kind !== 'foreground' && kind !== 'region') return null
  const layouts = listForegroundLayouts()
    .map((l) => l.name)
    .join(', ')
  const types = [
    ...listModulesForSlot('foreground').map((m) => `${m.type} (${m.label})`),
    ...extras.map((t) => `${t.type} (${t.label})`),
  ].join(', ')
  const lines: string[] = []
  if (kind === 'foreground') {
    lines.push(`Valid layout names (use one exactly, or omit \`layout:\`): ${layouts}.`)
  }
  lines.push(`Valid foreground layer \`type:\` values: ${types}.`)
  return lines.join('\n')
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

  let body: FixBody
  try {
    body = (await req.json()) as FixBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const config = body.kind ? aiSlotConfig(body.kind, body.layerType) : null
  if (!config || config.modality !== 'text') {
    return NextResponse.json(
      { error: 'fix is only available for text/YAML slots' },
      { status: 400 },
    )
  }

  const fragment = typeof body.fragment === 'string' ? body.fragment : ''
  if (!fragment.trim()) {
    return NextResponse.json({ error: 'missing "fragment"' }, { status: 400 })
  }
  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    return NextResponse.json(
      { error: `fragment exceeds ${MAX_FRAGMENT_LENGTH} chars` },
      { status: 400 },
    )
  }

  const problems = Array.isArray(body.problems)
    ? body.problems
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, MAX_PROBLEMS)
    : []
  if (problems.length === 0) {
    return NextResponse.json({ error: 'missing "problems"' }, { status: 400 })
  }

  // Allowed models: the slot's own set. The picker override wins when valid;
  // else the feature default; else the slot's first model.
  const allowed = config.models
  const requested = typeof body.model === 'string' ? body.model : null
  const featureDefault = await getFeatureModel('fix')
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

  // Ground the repair in the slot's schema + the live valid vocabulary, so the
  // model fixes within the real field/layout/type names rather than inventing.
  // The story's vertical pack (best-effort) extends both with the desk's types.
  const pack = await resolveStoryPack(slug).catch(() => null)
  const extras = pack?.extraLayerTypes ?? []
  const schemaPrompt = buildSlotSchemaPrompt(body.kind, body.layerType, extras)
  const vocabulary = vocabularyPrompt(body.kind, extras)
  const system = [
    `You repair a fragment of YAML so it conforms to its schema. The fragment ` +
      `is the \`${config.label}\` slot of one section in a data-driven story and ` +
      `currently has schema mismatches.`,
    `Detected problems to fix:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    vocabulary
      ? `Use ONLY this valid vocabulary — do not invent names:\n${vocabulary}`
      : null,
    schemaPrompt
      ? `Keep the result consistent with this schema — use only these ` +
        `fields/shapes, do not invent keys:\n${schemaPrompt}`
      : null,
    `Preserve the author's content and intent — change only what the problems ` +
      `require to make the fragment valid. Keep the same overall shape and ` +
      `indentation. Return ONLY the corrected YAML fragment — no code fences, ` +
      `no commentary, no surrounding keys.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  let raw: string
  try {
    const out = await generateText({
      model: modelAlias,
      system,
      prompt: `Fragment to fix:\n${fragment}`,
      metadata: { feature: 'admin-canvas-fix', slug, kind: body.kind },
    })
    raw = out.result
  } catch (e) {
    return NextResponse.json(
      { error: `fix failed: ${e instanceof Error ? e.message : String(e)}` },
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
      prompt: problems.join('\n'),
      params: { mode: 'fix', kind: body.kind, layerType: body.layerType ?? null },
    })
    const row = await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: problems.join('\n'),
      model: modelId,
      params: {
        mode: 'fix',
        language: config.language,
        slotKind: body.kind,
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
    generation: { id: generationId, model: modelId, auditWarning },
  })
}
