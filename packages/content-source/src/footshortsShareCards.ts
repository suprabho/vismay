import { createServiceClient } from './supabase'

/**
 * Saved footshorts share-card drafts (the admin "Share cards" tool).
 *
 * `config` is an opaque snapshot of the creator's controls — its shape lives
 * with the UI (`ShareCardSnapshot` in the admin app); the store treats it as
 * JSON. See migration `20260615010000_share_cards.sql`.
 */

export interface SavedShareCard {
  id: string
  name: string
  cardType: string
  config: unknown
  createdAt: string
  updatedAt: string
}

export interface NewShareCard {
  name: string
  cardType: string
  config: unknown
}

interface Row {
  id: string
  name: string
  card_type: string
  config: unknown
  created_at: string
  updated_at: string
}

function rowToCard(r: Row): SavedShareCard {
  return {
    id: r.id,
    name: r.name,
    cardType: r.card_type,
    config: r.config,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listShareCards(limit = 100): Promise<SavedShareCard[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('footshorts_share_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listShareCards: ${error.message}`)
  return (data as Row[]).map(rowToCard)
}

export async function createShareCard(input: NewShareCard): Promise<SavedShareCard> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('footshorts_share_cards')
    .insert({ name: input.name, card_type: input.cardType, config: input.config })
    .select('*')
    .single()
  if (error) throw new Error(`createShareCard: ${error.message}`)
  return rowToCard(data as Row)
}

export async function deleteShareCard(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('footshorts_share_cards').delete().eq('id', id)
  if (error) throw new Error(`deleteShareCard: ${error.message}`)
}
