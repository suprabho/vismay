/**
 * DB helpers for the `demos` table. All callers run server-side with the
 * service-role client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './supabase'

export type DemoStatus = 'draft' | 'live' | 'archived'

export interface DemoCardId {
  parentIndex: number
  subIndex: number
  sliceIndex?: number | null
  variant: string
  label: string
}

export interface DemoRow {
  id: number
  client_slug: string
  client_name: string
  story_slug: string
  password_hash: string
  content_yaml: string | null
  share_card_ids: DemoCardId[] | null
  status: DemoStatus
  published_at: string | null
  updated_at: string
  created_at: string
}

export interface DemoListItem {
  id: number
  client_slug: string
  client_name: string
  story_slug: string
  status: DemoStatus
  updated_at: string
}

const SAFE_CLIENT_SLUG = /^[a-z0-9][a-z0-9_-]{1,63}$/

export function isValidClientSlug(s: string): boolean {
  return typeof s === 'string' && SAFE_CLIENT_SLUG.test(s)
}

export async function listDemos(): Promise<DemoListItem[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('demos')
    .select('id, client_slug, client_name, story_slug, status, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listDemos: ${error.message}`)
  return (data ?? []) as DemoListItem[]
}

export async function getDemoById(id: number): Promise<DemoRow | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('demos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getDemoById: ${error.message}`)
  return (data as DemoRow | null) ?? null
}

export async function getDemoByClientSlug(
  clientSlug: string,
  client?: SupabaseClient
): Promise<DemoRow | null> {
  const sb = client ?? createServiceClient()
  const { data, error } = await sb
    .from('demos')
    .select('*')
    .eq('client_slug', clientSlug)
    .maybeSingle()
  if (error) throw new Error(`getDemoByClientSlug: ${error.message}`)
  return (data as DemoRow | null) ?? null
}

export interface CreateDemoInput {
  client_slug: string
  client_name: string
  story_slug: string
  password_hash: string
}

export async function createDemo(input: CreateDemoInput): Promise<DemoRow> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('demos')
    .insert({
      client_slug: input.client_slug,
      client_name: input.client_name,
      story_slug: input.story_slug,
      password_hash: input.password_hash,
      status: 'draft' as DemoStatus,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createDemo: ${error.message}`)
  return data as DemoRow
}

export interface UpdateDemoInput {
  client_slug?: string
  client_name?: string
  story_slug?: string
  password_hash?: string
  content_yaml?: string | null
  share_card_ids?: DemoCardId[] | null
  status?: DemoStatus
  published_at?: string | null
}

export async function updateDemo(id: number, patch: UpdateDemoInput): Promise<DemoRow> {
  const sb = createServiceClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.client_slug !== undefined) updates.client_slug = patch.client_slug
  if (patch.client_name !== undefined) updates.client_name = patch.client_name
  if (patch.story_slug !== undefined) updates.story_slug = patch.story_slug
  if (patch.password_hash !== undefined) updates.password_hash = patch.password_hash
  if (patch.content_yaml !== undefined) updates.content_yaml = patch.content_yaml
  if (patch.share_card_ids !== undefined) updates.share_card_ids = patch.share_card_ids
  if (patch.status !== undefined) {
    updates.status = patch.status
    if (patch.status === 'live') updates.published_at = new Date().toISOString()
  }
  if (patch.published_at !== undefined) updates.published_at = patch.published_at
  const { data, error } = await sb
    .from('demos')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updateDemo: ${error.message}`)
  return data as DemoRow
}

export async function deleteDemo(id: number): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('demos').delete().eq('id', id)
  if (error) throw new Error(`deleteDemo: ${error.message}`)
}

export async function listShareAssetsForDemo(demoId: number): Promise<
  { card_id: string; ratio: string; public_url: string }[]
> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_share_assets')
    .select('card_id, ratio, public_url')
    .eq('demo_id', demoId)
  if (error) throw new Error(`listShareAssetsForDemo: ${error.message}`)
  return (data ?? []) as { card_id: string; ratio: string; public_url: string }[]
}
