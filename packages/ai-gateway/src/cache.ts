import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Content-addressed audit + dedupe for AI generations.
 *
 * Every call writes a row to `ai_generations` keyed by a sha256 of
 * (model, prompt, params). Re-runs with identical inputs hit the same row,
 * which lets the admin UI show "this image came from prompt X" and lets
 * resolver scripts skip work that already produced a stored result.
 *
 * Storage of the actual artifact differs by kind:
 *   - image → `result_ref` = path in the `story-assets` bucket; bytes live there.
 *   - text  → `result_text` = the generated string inline.
 */

export type GenerationKind = 'image' | 'text'

export interface GenerationRecord {
  id: string
  kind: GenerationKind
  storySlug: string | null
  prompt: string
  model: string
  params: Record<string, unknown>
  requestHash: string
  resultRef: string | null
  resultText: string | null
  createdAt: string
}

/**
 * Stable hash for a generation request. Used as the cache key and as the
 * dedupe column on `ai_generations`. Pure function — no side effects, safe
 * to call in any environment that has `node:crypto`.
 */
export function hashRequest(input: {
  model: string
  prompt: string
  params?: Record<string, unknown>
}): string {
  const h = createHash('sha256')
  h.update(input.model)
  h.update('\n')
  h.update(input.prompt)
  h.update('\n')
  // Stable stringify: sort keys so re-ordering doesn't break dedupe.
  const params = input.params ?? {}
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => ((acc[k] = params[k]), acc), {})
  h.update(JSON.stringify(sorted))
  return h.digest('hex')
}

export async function lookupCachedGeneration(
  supabase: SupabaseClient,
  requestHash: string,
): Promise<GenerationRecord | null> {
  const { data, error } = await supabase
    .from('ai_generations')
    .select(
      'id, kind, story_slug, prompt, model, params, request_hash, result_ref, result_text, created_at',
    )
    .eq('request_hash', requestHash)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`ai_generations lookup: ${error.message}`)
  if (!data) return null
  return rowToRecord(data)
}

export async function recordGeneration(
  supabase: SupabaseClient,
  input: {
    kind: GenerationKind
    storySlug: string | null
    prompt: string
    model: string
    params: Record<string, unknown>
    requestHash: string
    resultRef: string | null
    resultText: string | null
  },
): Promise<GenerationRecord> {
  const { data, error } = await supabase
    .from('ai_generations')
    .insert({
      kind: input.kind,
      story_slug: input.storySlug,
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      request_hash: input.requestHash,
      result_ref: input.resultRef,
      result_text: input.resultText,
    })
    .select(
      'id, kind, story_slug, prompt, model, params, request_hash, result_ref, result_text, created_at',
    )
    .single()
  if (error) throw new Error(`ai_generations insert: ${error.message}`)
  return rowToRecord(data)
}

interface RawRow {
  id: string
  kind: GenerationKind
  story_slug: string | null
  prompt: string
  model: string
  params: Record<string, unknown> | null
  request_hash: string
  result_ref: string | null
  result_text: string | null
  created_at: string
}

function rowToRecord(row: RawRow): GenerationRecord {
  return {
    id: row.id,
    kind: row.kind,
    storySlug: row.story_slug,
    prompt: row.prompt,
    model: row.model,
    params: row.params ?? {},
    requestHash: row.request_hash,
    resultRef: row.result_ref,
    resultText: row.result_text,
    createdAt: row.created_at,
  }
}
