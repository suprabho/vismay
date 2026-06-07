/**
 * `stories.compose_state` accessors — the canvas-native composer's pipeline
 * scaffold (migration 056). DB-only: the compose feature is Supabase-backed, so
 * this talks directly to the service client rather than going through the
 * fs/db `ContentSource` abstraction.
 *
 * The angles + outline live here; the section drafts themselves are materialised
 * into the story's markdown/config (via `appendStorySection` + the normal save),
 * so this stays lean. Cleared (`null`) when authoring finishes or is abandoned.
 */

import { createServiceClient } from './supabase'

export type ComposePhase = 'sources' | 'angles' | 'outline' | 'content' | 'visual' | 'done'

export type ComposeFormat = 'deck' | 'map'

export interface ComposeAngle {
  id: string
  title: string
  thesis: string
  rationale: string
}

export type ComposeOutlineStatus = 'pending' | 'accepted' | 'rejected'

export interface ComposeOutlineEntry {
  id: string
  heading: string
  intent: string
  kind: string
  status: ComposeOutlineStatus
  /** Set once the entry has been materialised into a real story section. */
  sectionId: string | null
}

export interface ComposeState {
  phase: ComposePhase
  format: ComposeFormat
  /**
   * Set when compose was started on a pre-existing story (via the canvas
   * `start` route) rather than a freshly-seeded draft (route 0). Materialise
   * uses it to APPEND new sections instead of replacing the story's body — a
   * seeded draft has only a throwaway placeholder section, but an attached
   * story has real content that must survive.
   */
  attached?: boolean
  /** The text model alias the author picked for this draft. */
  model?: string
  angles: ComposeAngle[]
  chosenAngleId?: string | null
  outline: ComposeOutlineEntry[]
  /** The research brief + editor answers, kept for re-running later stages. */
  brief?: unknown
  answers?: Record<string, string>
  /** The raw `StoryOutline` (charts + title/byline meta) the outline stage
   *  produced — needed when materialising sections + charts. */
  storyOutline?: unknown
  /** Image prompts the outline emitted (a sidecar until resolved in ASSETS). */
  imagePrompts?: unknown[]
}

/** A row summary for the resume picker. */
export interface ComposeDraftSummary {
  slug: string
  phase: ComposePhase
  format: ComposeFormat
  updatedAt: string | null
}

export async function readComposeState(slug: string): Promise<ComposeState | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('stories')
    .select('compose_state')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`readComposeState ${slug}: ${error.message}`)
  return (data?.compose_state as ComposeState | null) ?? null
}

/**
 * Set or clear the compose scaffold. Pass `null` to clear it (story finished or
 * abandoned). Updates the existing row — the draft row must already exist (route
 * 0 creates it via `writeMarkdown`), or this silently affects zero rows.
 */
export async function writeComposeState(
  slug: string,
  state: ComposeState | null,
): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('stories')
    .update({ compose_state: state, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) throw new Error(`writeComposeState ${slug}: ${error.message}`)
}

/** All in-progress compose drafts, newest first — drives the resume picker. */
export async function listComposeDrafts(): Promise<ComposeDraftSummary[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('stories')
    .select('slug, compose_state, updated_at')
    .not('compose_state', 'is', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listComposeDrafts: ${error.message}`)
  return (data ?? []).map((row: any) => {
    const state = (row.compose_state ?? {}) as Partial<ComposeState>
    return {
      slug: row.slug as string,
      phase: (state.phase ?? 'sources') as ComposePhase,
      format: (state.format ?? 'deck') as ComposeFormat,
      updatedAt: (row.updated_at as string | null) ?? null,
    }
  })
}
