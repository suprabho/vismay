import type { GenLayerOption } from '../vizEngine'
import type { StoryFormat } from '../types'

/**
 * One vertical viz-module type a DomainPack offers to generation. The schema
 * is a provider-safe zod mirror of the module's real `parseConfig` (no
 * z.record, no tuples, `type` as a z.literal discriminator) — packs.test.ts
 * anti-drift-checks each sample through the real parser so the mirror can
 * never silently diverge.
 */
export interface PackLayerType {
  /** The module type id, e.g. `f1:race-card`. */
  type: string
  /** One menu line — what this layer is (mirrors GEN_FOREGROUND_TYPES.label). */
  label: string
  /** Provider-safe zod schema for the generatable config (spliced into the
   *  section-body discriminated union via `sectionBodySchemaWith`). */
  schema: GenLayerOption
  /** One paragraph for the VISUAL pass: when to use it, what the fields mean,
   *  what to leave out (hydrated/palette fields). */
  promptDoc: string
  /** The deck-layout regions this layer reads well in (advisory — shown in the
   *  prompt; the renderer does not enforce `accepts`). */
  regions: readonly string[]
  /**
   * Deterministic post-generation enrichment. The model is told to OMIT
   * app-supplied fields (team colours, driver photos); this stamps them back
   * from the ids it DID emit, before the body is serialised — so a generated
   * story is never colourless. Pure + synchronous (no I/O): static values come
   * from inline palettes, and anything needing a data lookup (e.g. driver
   * headshots) is pre-resolved by the caller and passed in `deps`. Receives and
   * returns the raw layer object; return it unchanged when nothing applies.
   */
  hydrate?: (
    layer: Record<string, unknown>,
    deps?: Record<string, unknown>,
  ) => Record<string, unknown>
}

/**
 * A vertical's editorial identity for the compose pipeline: who is writing,
 * for what audience, plus the vertical viz modules generation may use.
 *
 * The vizmaya pack is the DEFAULT everywhere and reproduces today's prompts
 * byte-identically (asserted against the committed snapshot) — the seam adds
 * voice and layers for other desks without moving vizmaya an inch.
 */
export interface DomainPack {
  id: 'vizmaya' | 'f1' | 'footshorts'
  /** Proper-noun desk name spliced inline: "a <name> deck data story",
   *  "the <name> desk". */
  name: string
  /** The opening persona sentence(s) of the research/angles systems — a full
   *  sentence (or two) ending with a trailing space. */
  persona: string
  /** Per-stage guidance paragraphs, appended to the matching system prompt
   *  when set. All unset on the vizmaya pack. */
  researchGuidance?: string
  angleGuidance?: string
  outlineGuidance?: string
  contentGuidance?: string
  visualGuidance?: string
  /** Byline example shown in the outline schema description. */
  bylineExample: string
  /** The formats this desk produces. Omit for both. */
  formats?: readonly StoryFormat[]
  /** Vertical viz-module types generation may emit (deck stories only). */
  extraLayerTypes: readonly PackLayerType[]
}
