import type { ImagePrompt } from './types'

/**
 * Deterministic completion of a DECK story's editorial cover.
 *
 * The visual pass deliberately leaves a cover's foreground empty (a model that
 * invents an `image.src` is the #1 way a section 404s), and the exemplar cover
 * shape carries fields no model should freestyle: the `Cover` anchor, the
 * display `heading`, the transparent `panel` chrome, and the full-bleed hero
 * image. This module derives all of them in code so a generated cover is the
 * complete editorial surface by construction:
 *
 *   - id: cover            ← anchor heading "Cover" (markdown `## Cover`)
 *     text: Cover
 *     kind: cover
 *     layout: hero-full-bleed
 *     heading: <the section title>
 *     eyebrow / dek        ← visual pass
 *     panel: { background: transparent, border: none, backdropBlur: "0" }
 *     foreground:
 *       - { type: image, src: assets://<slug>/<filename>, alt, priority: true }
 *
 * The image `src` is the asset key the compose "Generate images" step uploads
 * to — both sides compute the filename with {@link composeImageFilename}, so
 * the ref resolves as soon as the image is generated instead of pointing at a
 * fabricated URL.
 *
 * Kept dependency-free (pure string/object work) so the admin client bundle
 * can import the filename helper without dragging in the AI passes.
 */

/** The markdown anchor (and so the section id) every deck cover uses. */
export const COVER_ANCHOR = 'Cover'

/** Transparent panel chrome — the full-bleed image must not sit in a glass card. */
export const COVER_PANEL = {
  background: 'transparent',
  border: 'none',
  backdropBlur: '0',
} as const

/**
 * Is this section the deck-format editorial cover?
 *
 * A deck opener may come back labelled `cover` OR `hero`: the deck kind enum
 * offers both, the outline lint's `COVER_KINDS` (lintLayout.ts) accepts either
 * as a valid opening title card, and the reader aliases them. Recognise both
 * here so a deck opener the model happened to call `hero` still routes through
 * `completeCoverBody` — otherwise it ships with no `foreground`/`map`, and
 * `loadStoryConfig` throws "missing 'map.center'" and 404s the whole story
 * (the failure mode that motivated this).
 */
export function isDeckCover(format: string, kind: string | undefined): boolean {
  return format === 'deck' && (kind === 'cover' || kind === 'hero')
}

/** kebab-case slug used in compose asset filenames (mirrors the assets panel). */
function fileSlug(section: string): string {
  return (
    section
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'image'
  )
}

/**
 * The filename the compose flow's "Generate images" step uploads prompt `index`
 * to (index within the prompts that actually carry a prompt string). The cover
 * attach computes its `assets://` ref with the SAME function, so the two can
 * never drift.
 */
export function composeImageFilename(section: string | undefined, index: number): string {
  return `compose-${fileSlug(section ?? 'image')}-${index}.png`
}

/**
 * Find the cover's image prompt: the first prompt whose `section` names the
 * cover (by heading, the `Cover` anchor, or slug equality), falling back to
 * the story's FIRST image prompt — for a deck that is the hero by convention.
 * Returns the prompt with its index in the generate-images order.
 */
export function findCoverImagePrompt(
  imagePrompts: ImagePrompt[] | undefined,
  coverHeading: string,
): { prompt: ImagePrompt; index: number } | null {
  const prompts = (imagePrompts ?? []).filter((p) => p.prompt)
  if (prompts.length === 0) return null
  const want = coverHeading.trim().toLowerCase()
  const wantSlug = fileSlug(coverHeading)
  const i = prompts.findIndex((p) => {
    const s = (p.section ?? '').trim().toLowerCase()
    return s === want || s === COVER_ANCHOR.toLowerCase() || fileSlug(p.section ?? '') === wantSlug
  })
  const index = i >= 0 ? i : 0
  return { prompt: prompts[index]!, index }
}

/**
 * The full-bleed hero image layer for a cover, pointing at the asset key the
 * image-generation step will upload to. Null when the outline planned no
 * imagery (the cover then renders title-over-scrim, which is still complete).
 */
export function coverImageLayer(
  storySlug: string,
  imagePrompts: ImagePrompt[] | undefined,
  coverHeading: string,
): Record<string, unknown> | null {
  const found = findCoverImagePrompt(imagePrompts, coverHeading)
  if (!found) return null
  const filename = composeImageFilename(found.prompt.section, found.index)
  return {
    type: 'image',
    src: `assets://${storySlug}/${filename}`,
    alt: found.prompt.prompt.slice(0, 160),
    priority: true,
  }
}

/** Does a foreground value already carry at least one layer? */
function hasForegroundContent(fg: unknown): boolean {
  if (!fg || typeof fg !== 'object') return false
  if (Array.isArray(fg)) return fg.length > 0
  const obj = fg as { type?: unknown; regions?: unknown }
  if (typeof obj.type === 'string') return true
  if (obj.regions && typeof obj.regions === 'object') {
    return Object.values(obj.regions as Record<string, unknown>).some(
      (v) => Array.isArray(v) ? v.length > 0 : !!v,
    )
  }
  return false
}

/**
 * Complete a deck cover's config body: force the section-root full-bleed
 * layout, set the display `heading` (the anchor is `Cover`, so the title must
 * live here), neutralise the panel chrome, and attach the hero image when the
 * model didn't author a foreground (it shouldn't — the prompt forbids it).
 * Idempotent — safe to apply at materialise, visual, and serialise time.
 */
export function completeCoverBody(
  body: Record<string, unknown>,
  opts: { heading: string; image?: Record<string, unknown> | null },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  out.layout = 'hero-full-bleed'
  out.heading = opts.heading
  out.panel = { ...COVER_PANEL }
  if (opts.image && !hasForegroundContent(out.foreground)) {
    out.foreground = [opts.image]
  } else if (!hasForegroundContent(out.foreground)) {
    // No hero image (yet) — keep an EMPTY `foreground` rather than dropping the
    // key: a section with neither `foreground`/`background` nor a legacy `map:`
    // fails loadStoryConfig ("missing 'map.center'"), 404ing the canvas/story
    // page on the next load. The empty list is the same placeholder the seeded
    // draft uses; the visual/serialise pass attaches the hero image into it.
    out.foreground = []
  }
  return out
}
