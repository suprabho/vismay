import { parse as parseYaml } from 'yaml'
import { getContentSource } from './contentSource'
import type {
  StoryConfig,
  StoryDefaults,
  StorySectionConfig,
  ShareConfig,
} from './storyConfig.types'

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
} from './storyConfig.types'

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
  const file = await getContentSource().readConfigYaml(slug)
  if (file == null) {
    throw new Error(`Story config for ${slug} is missing`)
  }
  const raw = parseYaml(file) as Partial<StoryConfig> | null

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Story config ${slug}.config.yaml is empty or invalid YAML`)
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
    if (!s.map || !Array.isArray(s.map.center) || s.map.center.length !== 2) {
      throw new Error(`Section ${i} in ${slug}.config.yaml is missing 'map.center'`)
    }
    if (typeof s.map.zoom !== 'number') {
      throw new Error(`Section ${i} in ${slug}.config.yaml is missing 'map.zoom'`)
    }
  })

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
