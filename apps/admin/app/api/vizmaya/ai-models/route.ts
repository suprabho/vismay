import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { MODELS } from '@vismay/ai-gateway'
import {
  AI_FEATURES,
  getFeatureModelMap,
  setFeatureModel,
} from '@/lib/aiModelSettings'

/**
 * Read / write the per-feature AI model mapping (the admin "AI models" page).
 */

function aliasList(group: 'text' | 'image') {
  return Object.entries(MODELS[group]).map(([k, id]) => ({
    alias: `${group}.${k}`,
    id: id as string,
  }))
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    features: AI_FEATURES,
    map: await getFeatureModelMap(),
    aliases: { text: aliasList('text'), image: aliasList('image') },
  })
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: { feature?: string; model?: string }
  try {
    body = (await req.json()) as { feature?: string; model?: string }
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const feature = AI_FEATURES.find((f) => f.key === body.feature)
  if (!feature) {
    return NextResponse.json({ error: 'unknown feature' }, { status: 400 })
  }
  const model = typeof body.model === 'string' ? body.model : ''
  const allowed = feature.choices ?? aliasList(feature.modality).map((a) => a.alias)
  const valid = allowed.includes(model)
  if (!valid) {
    return NextResponse.json(
      { error: `model must be a valid ${feature.modality} alias` },
      { status: 400 },
    )
  }

  try {
    await setFeatureModel(feature.key, model)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'save failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
