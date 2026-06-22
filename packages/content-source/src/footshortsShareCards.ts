import { createServiceClient } from './supabase'

/**
 * Footshorts share cards (the admin "Share cards" tool).
 *
 * A card starts as a *draft* — `config` is an opaque snapshot of the creator's
 * controls (`ShareCardSnapshot` in the admin app); the store treats it as JSON.
 * Shipping a card *publishes* it: the rendered PNG is uploaded to the public
 * `footshorts-share-cards` bucket, the row flips to `status = 'published'`, and
 * the card is tagged with entities (teams / leagues) so the consumer product can
 * surface it contextually. See migrations `20260615010000_share_cards.sql` and
 * `20260617000000_share_cards_publish.sql`.
 */

const SHARE_CARD_BUCKET = 'footshorts-share-cards'

export type ShareCardStatus = 'draft' | 'published'

/** An entity (team / league) a card is tagged with, for display. */
export interface ShareCardEntityTag {
  id: string
  type: 'league' | 'team' | 'player'
  slug: string
  name: string
  crestUrl: string | null
}

export interface SavedShareCard {
  id: string
  name: string
  cardType: string
  config: unknown
  status: ShareCardStatus
  imageUrl: string | null
  ratio: string | null
  publishedAt: string | null
  entities: ShareCardEntityTag[]
  createdAt: string
  updatedAt: string
}

export interface NewShareCard {
  name: string
  cardType: string
  config: unknown
}

/** Patch for an already-saved card. Every field is optional so a re-save can
 *  overwrite just the snapshot while keeping the user-given name. */
export interface UpdateShareCard {
  name?: string
  cardType?: string
  config?: unknown
}

/** A tag to attach when publishing, addressed by (type, slug) — resolved to an
 *  entity id here, so callers don't need to know entity ids. */
export interface ShareCardEntityInput {
  type: 'team' | 'league'
  slug: string
}

export interface PublishShareCardInput {
  /** Existing card to re-publish/update in place; omit to create a new one. */
  id?: string
  name: string
  cardType: string
  config: unknown
  /** Aspect ratio the PNG was captured at (e.g. "1:1"). */
  ratio: string
  /** Rendered PNG bytes. */
  png: Uint8Array
  /** Entity tags, addressed by (type, slug). Unknown entities are skipped. */
  entities: ShareCardEntityInput[]
}

interface EntityJoin {
  entity: {
    id: string
    type: 'league' | 'team' | 'player'
    slug: string
    name: string
    crest_url: string | null
  } | null
}

interface Row {
  id: string
  name: string
  card_type: string
  config: unknown
  status: ShareCardStatus
  image_url: string | null
  ratio: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  footshorts_share_card_entities?: EntityJoin[] | null
}

const SELECT_WITH_ENTITIES =
  '*, footshorts_share_card_entities(entity:entities(id, type, slug, name, crest_url))'

function rowToCard(r: Row): SavedShareCard {
  const entities: ShareCardEntityTag[] = (r.footshorts_share_card_entities ?? [])
    .map((j) => j.entity)
    .filter((e): e is NonNullable<EntityJoin['entity']> => !!e)
    .map((e) => ({ id: e.id, type: e.type, slug: e.slug, name: e.name, crestUrl: e.crest_url }))
  return {
    id: r.id,
    name: r.name,
    cardType: r.card_type,
    config: r.config,
    status: r.status,
    imageUrl: r.image_url,
    ratio: r.ratio,
    publishedAt: r.published_at,
    entities,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listShareCards(limit = 100): Promise<SavedShareCard[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('footshorts_share_cards')
    .select(SELECT_WITH_ENTITIES)
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
    .select(SELECT_WITH_ENTITIES)
    .single()
  if (error) throw new Error(`createShareCard: ${error.message}`)
  return rowToCard(data as Row)
}

/** Overwrite an existing card in place (used by Save on an already-loaded card,
 *  so re-saving updates the same row instead of inserting a duplicate). */
export async function updateShareCard(
  id: string,
  patch: UpdateShareCard,
): Promise<SavedShareCard> {
  const sb = createServiceClient()
  // No DB trigger maintains updated_at, so bump it here.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.cardType !== undefined) update.card_type = patch.cardType
  if (patch.config !== undefined) update.config = patch.config
  const { data, error } = await sb
    .from('footshorts_share_cards')
    .update(update)
    .eq('id', id)
    .select(SELECT_WITH_ENTITIES)
    .single()
  if (error) throw new Error(`updateShareCard: ${error.message}`)
  return rowToCard(data as Row)
}

export async function deleteShareCard(id: string): Promise<void> {
  const sb = createServiceClient()
  // Best-effort: drop the rendered PNG too (no-op if the card was never shipped).
  await sb.storage
    .from(SHARE_CARD_BUCKET)
    .remove([`${id}.png`])
    .catch(() => {})
  const { error } = await sb.from('footshorts_share_cards').delete().eq('id', id)
  if (error) throw new Error(`deleteShareCard: ${error.message}`)
}

/** Resolve (type, slug) tag inputs to entity ids. Unknown entities are dropped. */
async function resolveEntityIds(
  sb: ReturnType<typeof createServiceClient>,
  inputs: ShareCardEntityInput[],
): Promise<string[]> {
  const wanted = inputs.filter((e) => e.slug)
  if (wanted.length === 0) return []
  const slugs = Array.from(new Set(wanted.map((e) => e.slug)))
  const { data, error } = await sb.from('entities').select('id, type, slug').in('slug', slugs)
  if (error) throw new Error(`resolveEntityIds: ${error.message}`)
  const byKey = new Map(
    ((data as Array<{ id: string; type: string; slug: string }>) ?? []).map((r) => [
      `${r.type}:${r.slug}`,
      r.id,
    ]),
  )
  const ids = new Set<string>()
  for (const e of wanted) {
    const id = byKey.get(`${e.type}:${e.slug}`)
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

/**
 * Ship a share card into the consumer product: upload the rendered PNG to the
 * public bucket, flip the row to `published`, and (re)write its entity tags.
 * Pass `id` to update an existing card in place; omit it to create a new one.
 */
export async function publishShareCard(input: PublishShareCardInput): Promise<SavedShareCard> {
  const sb = createServiceClient()

  // 1. Get a stable card id (needed for the storage path) — update or insert.
  let id = input.id
  if (id) {
    const { error } = await sb
      .from('footshorts_share_cards')
      .update({ name: input.name, card_type: input.cardType, config: input.config })
      .eq('id', id)
    if (error) throw new Error(`publishShareCard(update): ${error.message}`)
  } else {
    const { data, error } = await sb
      .from('footshorts_share_cards')
      .insert({ name: input.name, card_type: input.cardType, config: input.config })
      .select('id')
      .single()
    if (error) throw new Error(`publishShareCard(insert): ${error.message}`)
    id = (data as { id: string }).id
  }

  // 2. Upload the PNG and resolve its public URL.
  const path = `${id}.png`
  const { error: upErr } = await sb.storage
    .from(SHARE_CARD_BUCKET)
    .upload(path, input.png, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(`publishShareCard(upload): ${upErr.message}`)
  const { data: pub } = sb.storage.from(SHARE_CARD_BUCKET).getPublicUrl(path)
  const imageUrl = pub.publicUrl

  // 3. Flip to published.
  const { error: pubErr } = await sb
    .from('footshorts_share_cards')
    .update({
      status: 'published',
      image_url: imageUrl,
      ratio: input.ratio,
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (pubErr) throw new Error(`publishShareCard(publish): ${pubErr.message}`)

  // 4. Replace entity tags.
  const entityIds = await resolveEntityIds(sb, input.entities)
  await sb.from('footshorts_share_card_entities').delete().eq('card_id', id)
  if (entityIds.length > 0) {
    const { error: tagErr } = await sb
      .from('footshorts_share_card_entities')
      .insert(entityIds.map((entity_id) => ({ card_id: id!, entity_id })))
    if (tagErr) throw new Error(`publishShareCard(tags): ${tagErr.message}`)
  }

  // 5. Return the fresh row.
  const { data, error } = await sb
    .from('footshorts_share_cards')
    .select(SELECT_WITH_ENTITIES)
    .eq('id', id)
    .single()
  if (error) throw new Error(`publishShareCard(read): ${error.message}`)
  return rowToCard(data as Row)
}

/** Pull a shipped card back to draft (removes it from the product). The PNG and
 *  tags are kept so re-shipping is one click. */
export async function unpublishShareCard(id: string): Promise<SavedShareCard> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('footshorts_share_cards')
    .update({ status: 'draft', published_at: null })
    .eq('id', id)
  if (error) throw new Error(`unpublishShareCard: ${error.message}`)
  const { data, error: readErr } = await sb
    .from('footshorts_share_cards')
    .select(SELECT_WITH_ENTITIES)
    .eq('id', id)
    .single()
  if (readErr) throw new Error(`unpublishShareCard(read): ${readErr.message}`)
  return rowToCard(data as Row)
}
