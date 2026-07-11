import { parse as parseYaml } from 'yaml'
import { getContentSource } from './contentSource'
import type {
  StoryConfig,
  StoryDefaults,
  StorySectionConfig,
  ShareConfig,
} from '@vismay/viz-engine'

export type {
  StoryConfig,
  StoryDefaults,
  StorySectionConfig,
  StorySubsectionConfig,
  MapPinConfig,
  MapOverrides,
  MapPalette,
  ResolvedUnit,
  ShareConfig,
  ShareSectionOverride,
} from '@vismay/viz-engine'

const DEFAULTS: StoryDefaults = {
  mapStyle: 'mapbox://styles/mapbox/dark-v11',
  mapOpacity: 0.6,
  pinColor: '#D85A30',
  pinRadius: 12,
  flySpeed: 1.2,
}

/**
 * Returns true if a config exists for the given slug.
 */
export async function hasStoryConfig(slug: string): Promise<boolean> {
  const raw = await getContentSource().readConfigYaml(slug)
  return raw != null
}

/**
 * Load and validate the YAML config for a story slug.
 * Throws if the file is missing, malformed, or missing required fields.
 */
export async function loadStoryConfig(slug: string): Promise<StoryConfig> {
  const cfg = await getContentSource().readConfig(slug)
  if (cfg == null) {
    throw new Error(`Story config for ${slug} is missing`)
  }
  // JSON-native stories (new verticals) parse via JSON.parse; legacy YAML via
  // yaml.parse. Both produce the same plain object the validator runs against —
  // JSON is a subset of YAML, so this branch is for a clearer parse error only.
  const raw = (
    cfg.format === 'json' ? JSON.parse(cfg.text) : parseYaml(cfg.text)
  ) as Partial<StoryConfig> | null

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Story config for ${slug} is empty or invalid ${cfg.format.toUpperCase()}`)
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new Error(`Story config ${slug}.config.yaml has no sections`)
  }

  // `paragraphs` may be `N` (number — single index) or `[start, end]` (slice).
  // Caught here so a typo in YAML produces a clear error rather than a silent
  // empty render later.
  const validateParagraphSpec = (label: string, p: unknown): void => {
    if (p === undefined) return
    if (typeof p === 'number') {
      if (!Number.isInteger(p) || p < 0) {
        throw new Error(`${label}: 'paragraphs' must be a non-negative integer or [start, end]`)
      }
      return
    }
    if (Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n) && n >= 0)) {
      return
    }
    throw new Error(`${label}: 'paragraphs' must be a non-negative integer or [start, end]`)
  }

  const validateParagraphs = (label: string, p: unknown): void => {
    validateParagraphSpec(label, p)
  }

  const validateMobileParagraphs = (label: string, mp: unknown): void => {
    if (mp === undefined) return
    if (!Array.isArray(mp) || mp.length === 0) {
      throw new Error(`${label}: 'mobileParagraphs' must be a non-empty array of paragraph specs`)
    }
    mp.forEach((spec, k) => {
      validateParagraphSpec(`${label} mobileParagraphs[${k}]`, spec)
    })
  }

  const validateShareParagraphs = (label: string, sp: unknown): void => {
    if (sp === undefined) return
    if (!Array.isArray(sp) || sp.length === 0) {
      throw new Error(`${label}: 'shareParagraphs' must be a non-empty array of paragraph specs`)
    }
    sp.forEach((spec, k) => {
      validateParagraphSpec(`${label} shareParagraphs[${k}]`, spec)
    })
  }

  // Validate the optional Tier-1 stage (`defaults.stage`). Shape checks only —
  // beat selectors are resolved against units later in `resolveStage`, and a
  // body's deep config validates downstream via its module's `parseConfig`.
  const validateStage = (stage: unknown): void => {
    if (stage === undefined) return
    const where = `${slug}.config.yaml defaults.stage`
    if (
      typeof stage !== 'object' ||
      stage === null ||
      !Array.isArray((stage as { entities?: unknown }).entities)
    ) {
      throw new Error(`${where}: must be an object with an 'entities' array`)
    }
    const ids = new Set<string>()
    ;(stage as { entities: unknown[] }).entities.forEach((e, i) => {
      const label = `${where}.entities[${i}]`
      if (!e || typeof e !== 'object') throw new Error(`${label}: must be an object`)
      const ent = e as Record<string, unknown>
      if (typeof ent.id !== 'string' || ent.id.trim() === '') {
        throw new Error(`${label}: missing 'id'`)
      }
      if (ids.has(ent.id)) throw new Error(`${label}: duplicate id '${ent.id}'`)
      ids.add(ent.id)
      if (ent.role !== 'subject' && ent.role !== 'object') {
        throw new Error(`${label} ('${ent.id}'): 'role' must be 'subject' or 'object'`)
      }
      if (
        !ent.content ||
        typeof ent.content !== 'object' ||
        typeof (ent.content as { type?: unknown }).type !== 'string'
      ) {
        throw new Error(`${label} ('${ent.id}'): 'content' must be an object with a 'type' string`)
      }
      if (!Array.isArray(ent.keyframes) || ent.keyframes.length === 0) {
        throw new Error(`${label} ('${ent.id}'): 'keyframes' must be a non-empty array`)
      }
      ;(ent.keyframes as unknown[]).forEach((kf, k) => {
        const klabel = `${label} ('${ent.id}') keyframes[${k}]`
        if (!kf || typeof kf !== 'object') throw new Error(`${klabel}: must be an object`)
        const at = (kf as { at?: unknown }).at
        const atOk =
          typeof at === 'number' ||
          (typeof at === 'object' && at !== null && 'section' in (at as object))
        if (!atOk) throw new Error(`${klabel}: 'at' must be a unit index or { section, sub? }`)
        const tf = (kf as { transform?: unknown }).transform
        if (!tf || typeof tf !== 'object') throw new Error(`${klabel}: missing 'transform'`)
        const op = (tf as { opacity?: unknown }).opacity
        if (op !== undefined && (typeof op !== 'number' || op < 0 || op > 1)) {
          throw new Error(`${klabel}: transform.opacity must be between 0 and 1`)
        }
        const zb = (tf as { zBand?: unknown }).zBand
        if (zb !== undefined && zb !== 'behind' && zb !== 'mid' && zb !== 'front') {
          throw new Error(`${klabel}: transform.zBand must be 'behind' | 'mid' | 'front'`)
        }
      })
      if (ent.role === 'object' && (ent.interactive === true || ent.zFocusCapable === true)) {
        console.warn(
          `[stage] ${label} ('${ent.id}'): 'interactive'/'zFocusCapable' are ignored for objects`
        )
      }
    })
  }

  raw.sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') {
      throw new Error(`Section ${i} in ${slug}.config.yaml is not an object`)
    }
    const hasText = typeof s.text === 'string' && s.text.trim().length > 0
    const hasSubs = Array.isArray(s.subsections) && s.subsections.length > 0
    if (!hasText && !hasSubs) {
      throw new Error(
        `Section ${i} in ${slug}.config.yaml needs either 'text' or a non-empty 'subsections' array`
      )
    }
    validateParagraphs(`Section ${i} in ${slug}.config.yaml`, s.paragraphs)
    validateMobileParagraphs(`Section ${i} in ${slug}.config.yaml`, s.mobileParagraphs)
    validateShareParagraphs(`Section ${i} in ${slug}.config.yaml`, s.shareParagraphs)
    if (hasSubs) {
      s.subsections!.forEach((sub, j) => {
        if (!sub || typeof sub !== 'object' || typeof sub.text !== 'string' || sub.text.trim().length === 0) {
          throw new Error(
            `Section ${i} subsection ${j} in ${slug}.config.yaml is missing 'text'`
          )
        }
        validateParagraphs(
          `Section ${i} subsection ${j} in ${slug}.config.yaml`,
          sub.paragraphs
        )
        validateMobileParagraphs(
          `Section ${i} subsection ${j} in ${slug}.config.yaml`,
          sub.mobileParagraphs
        )
        validateShareParagraphs(
          `Section ${i} subsection ${j} in ${slug}.config.yaml`,
          sub.shareParagraphs
        )
      })
    }
    // A deck editorial cover renders title-over-scrim from its own
    // `heading`/`eyebrow`/`dek`/`text` and legitimately carries no map and no
    // image layer (see `completeCoverBody` in @vismay/story-pipeline, which
    // seeds an empty `foreground` for exactly this reason). A section-root
    // `layout: hero-full-bleed` (or an explicit `cover` kind) is the
    // unambiguous marker for that surface. Normalise such a section to an empty
    // `foreground` when it declares no layer slot, so it satisfies the
    // layer-slot requirement below instead of falling through to the legacy
    // `map.center` check and 404ing the whole story. Map-story heroes never set
    // a section-root `hero-full-bleed` layout, so their genuine missing-map
    // errors still surface.
    const isCoverStyleSection =
      (s as { layout?: unknown }).layout === 'hero-full-bleed' ||
      (s as { kind?: unknown }).kind === 'cover'
    const declaresSlot =
      (s as { background?: unknown }).background !== undefined ||
      (s as { foreground?: unknown }).foreground !== undefined
    if (isCoverStyleSection && !declaresSlot) {
      ;(s as { foreground?: unknown }).foreground = []
    }

    // Legacy `map:` block is only required when the section is purely legacy —
    // i.e. it declares neither `background:` nor `foreground:`. New stories
    // that opt into the layered schema (background-only, foreground-only, or
    // both) validate their layers downstream via each module's `parseConfig`,
    // and `resolveSlots()` already handles a missing legacy `map:` by
    // returning an empty background array.
    const usesNewSchemaSlot =
      (s as { background?: unknown }).background !== undefined ||
      (s as { foreground?: unknown }).foreground !== undefined
    if (!usesNewSchemaSlot) {
      if (!s.map || !Array.isArray(s.map.center) || s.map.center.length !== 2) {
        throw new Error(`Section ${i} in ${slug}.config.yaml is missing 'map.center'`)
      }
      if (typeof s.map.zoom !== 'number') {
        throw new Error(`Section ${i} in ${slug}.config.yaml is missing 'map.zoom'`)
      }
    }
  })

  validateStage((raw.defaults as { stage?: unknown } | undefined)?.stage)

  return {
    defaults: { ...DEFAULTS, ...(raw.defaults ?? {}) },
    sections: raw.sections as StorySectionConfig[],
  }
}

/**
 * Returns true if share config exists for the given slug.
 */
export async function hasShareConfig(slug: string): Promise<boolean> {
  const raw = await getContentSource().readShareYaml(slug)
  return raw != null
}

/**
 * Load the share-mode YAML config for a story slug.
 * Returns null if no share config exists.
 */
export async function loadShareConfig(slug: string): Promise<ShareConfig | null> {
  const file = await getContentSource().readShareYaml(slug)
  if (file == null) return null
  const raw = parseYaml(file) as Partial<ShareConfig> | null
  if (!raw || typeof raw !== 'object') return null
  return {
    logo: typeof raw.logo === 'string' ? raw.logo : undefined,
    sections: raw.sections ?? {},
  }
}
