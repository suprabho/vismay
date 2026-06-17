import { createServiceClient } from './supabase'

/**
 * Vizmaya share cards — the saved-card library behind the admin "Share cards"
 * composer ( apps/admin/components/vizmaya/sharecard/ ).
 *
 * A card is an opaque snapshot of the composer's controls (`config`, treated as
 * JSON here) plus a little metadata for listing + filtering. Unlike footshorts
 * share cards there's no publish lifecycle or entity tagging — v1 is download +
 * a reloadable library. See migration `061_vizmaya_share_cards.sql`.
 */

export type ShareCardBaseType = 'map' | 'data' | 'map-caption'

export interface SavedVizmayaShareCard {
  id: string
  name: string
  storySlug: string | null
  baseType: string
  ratio: string | null
  config: unknown
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface NewVizmayaShareCard {
  name: string
  storySlug?: string | null
  baseType: string
  ratio?: string | null
  config: unknown
}

export interface UpdateVizmayaShareCard {
  name?: string
  storySlug?: string | null
  baseType?: string
  ratio?: string | null
  config?: unknown
}

interface Row {
  id: string
  name: string
  story_slug: string | null
  base_type: string
  ratio: string | null
  config: unknown
  image_url: string | null
  created_at: string
  updated_at: string
}

function rowToCard(r: Row): SavedVizmayaShareCard {
  return {
    id: r.id,
    name: r.name,
    storySlug: r.story_slug,
    baseType: r.base_type,
    ratio: r.ratio,
    config: r.config,
    imageUrl: r.image_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** List saved cards newest-first, optionally scoped to one story. */
export async function listShareCards(
  opts: { storySlug?: string; limit?: number } = {},
): Promise<SavedVizmayaShareCard[]> {
  const sb = createServiceClient()
  let q = sb
    .from('vizmaya_share_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.storySlug) q = q.eq('story_slug', opts.storySlug)
  const { data, error } = await q
  if (error) throw new Error(`listShareCards: ${error.message}`)
  return (data as Row[]).map(rowToCard)
}

export async function createShareCard(
  input: NewVizmayaShareCard,
): Promise<SavedVizmayaShareCard> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('vizmaya_share_cards')
    .insert({
      name: input.name,
      story_slug: input.storySlug ?? null,
      base_type: input.baseType,
      ratio: input.ratio ?? null,
      config: input.config,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createShareCard: ${error.message}`)
  return rowToCard(data as Row)
}

export async function updateShareCard(
  id: string,
  patch: UpdateVizmayaShareCard,
): Promise<SavedVizmayaShareCard> {
  const sb = createServiceClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.storySlug !== undefined) update.story_slug = patch.storySlug
  if (patch.baseType !== undefined) update.base_type = patch.baseType
  if (patch.ratio !== undefined) update.ratio = patch.ratio
  if (patch.config !== undefined) update.config = patch.config
  const { data, error } = await sb
    .from('vizmaya_share_cards')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updateShareCard: ${error.message}`)
  return rowToCard(data as Row)
}

export async function deleteShareCard(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('vizmaya_share_cards').delete().eq('id', id)
  if (error) throw new Error(`deleteShareCard: ${error.message}`)
}
