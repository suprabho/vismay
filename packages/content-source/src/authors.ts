/**
 * Server-side reads for the authors registry — the E-E-A-T entity layer.
 *
 * Stories reference authors by slug from frontmatter (`authors: [...]`), so
 * membership works in both `fs` and `db` content modes; the *profile* (name,
 * bio, socials) always lives in Supabase here. Table: `authors`.
 *
 * Schema: supabase/vizmaya-fyi/migrations/057_authors.sql
 *
 * These helpers tolerate a missing Supabase env (return empty/null) so the
 * fs-first story route and dev builds without service credentials don't crash —
 * the same defensive posture as footshorts hydration.
 */

import { createServiceClient } from './supabase'

export interface Author {
  slug: string
  name: string
  role: string | null
  bio: string | null
  avatarUrl: string | null
  profileUrl: string | null
  sameAs: string[]
  appSlug: string
  status: string
}

const COLUMNS = 'slug, name, role, bio, avatar_url, profile_url, same_as, app_slug, status'

function hasServiceEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function mapRow(r: any): Author {
  return {
    slug: r.slug,
    name: r.name,
    role: r.role ?? null,
    bio: r.bio ?? null,
    avatarUrl: r.avatar_url ?? null,
    profileUrl: (r.profile_url as string | null) ?? `/authors/${r.slug}`,
    sameAs: Array.isArray(r.same_as) ? (r.same_as as string[]) : [],
    appSlug: (r.app_slug as string | undefined) ?? 'vizmaya-fyi',
    status: (r.status as string | undefined) ?? 'published',
  }
}

export async function getAuthor(slug: string): Promise<Author | null> {
  if (!hasServiceEnv()) return null
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('authors')
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(`getAuthor ${slug}: ${error.message}`)
  return data ? mapRow(data) : null
}

export async function listAuthors(appSlug?: string): Promise<Author[]> {
  if (!hasServiceEnv()) return []
  const sb = createServiceClient()
  let query = sb.from('authors').select(COLUMNS).eq('status', 'published')
  if (appSlug) query = query.eq('app_slug', appSlug)
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new Error(`listAuthors: ${error.message}`)
  return (data ?? []).map(mapRow)
}

// --- Admin reads/writes (service role; include drafts) ---

export async function listAuthorsForAdmin(appSlug?: string): Promise<Author[]> {
  const sb = createServiceClient()
  let query = sb.from('authors').select(COLUMNS)
  if (appSlug) query = query.eq('app_slug', appSlug)
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new Error(`listAuthorsForAdmin: ${error.message}`)
  return (data ?? []).map(mapRow)
}

export async function getAuthorForAdmin(slug: string): Promise<Author | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('authors').select(COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw new Error(`getAuthorForAdmin ${slug}: ${error.message}`)
  return data ? mapRow(data) : null
}

export interface AuthorInput {
  slug: string
  name: string
  role?: string | null
  bio?: string | null
  avatarUrl?: string | null
  profileUrl?: string | null
  sameAs?: string[]
  appSlug?: string
  status?: string
}

export async function upsertAuthor(input: AuthorInput): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('authors').upsert(
    {
      slug: input.slug,
      name: input.name,
      role: input.role ?? null,
      bio: input.bio ?? null,
      avatar_url: input.avatarUrl ?? null,
      profile_url: input.profileUrl ?? null,
      same_as: input.sameAs ?? [],
      app_slug: input.appSlug ?? 'vizmaya-fyi',
      status: input.status ?? 'published',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'slug' },
  )
  if (error) throw new Error(`upsertAuthor ${input.slug}: ${error.message}`)
}

export async function deleteAuthor(slug: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('authors').delete().eq('slug', slug)
  if (error) throw new Error(`deleteAuthor ${slug}: ${error.message}`)
}

/** Batch resolve by slug, preserving the order of the input slugs. */
export async function getAuthorsForStory(slugs: string[]): Promise<Author[]> {
  if (!hasServiceEnv() || slugs.length === 0) return []
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('authors')
    .select(COLUMNS)
    .in('slug', slugs)
    .eq('status', 'published')
  if (error) throw new Error(`getAuthorsForStory: ${error.message}`)
  const bySlug = new Map((data ?? []).map((r: any) => [r.slug as string, mapRow(r)]))
  return slugs.map((s) => bySlug.get(s)).filter((a): a is Author => a != null)
}
