import { parse as parseYaml } from 'yaml'
import { getContentSource, type ConfigFormat } from './contentSource'
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
 * Parse and validate story config text. Pure — no content-source or
 * environment access, so hosts that store config text elsewhere (their own DB
 * rows, a publish snapshot) can run the exact validation the reader expects.
 *
 * `slug` is used only to label error messages.
 * Throws if the text is malformed or missing required fields.
 */
export function parseStoryConfigText(
  slug: string,
  text: string,
  format: ConfigFormat = 'yaml'
): StoryConfig {
  // JSON-native stories (new verticals) parse via JSON.parse; legacy YAML via
  // yaml.parse. Both produce the same plain object the validator runs against —
  // JSON is a subset of YAML, so this branch is for a clearer parse error only.
  const raw = (
    format === 'json' ? JSON.parse(text) : parseYaml(text)
  ) as Partial<StoryConfig> | null

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Story config for ${slug} is empty or invalid ${format.toUpperCase()}`)
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

  const EASING_NAMES = new Set(['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'])
  const validateEasing = (label: string, easing: unknown): void => {
    if (easing === undefined) return
    if (typeof easing === 'string') {
      if (!EASING_NAMES.has(easing)) {
        throw new Error(`${label}: unknown easing '${easing}'`)
      }
      return
    }
    const cb = (easing as { cubicBezier?: unknown })?.cubicBezier
    if (
      !Array.isArray(cb) ||
      cb.length !== 4 ||
      cb.some((n) => typeof n !== 'number' || !Number.isFinite(n))
    ) {
      throw new Error(
        `${label}: easing must be a named easing or { cubicBezier: [n,n,n,n] }`
      )
    }
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
      // Per-beat grouping (by textual identity) for the sub-keyframe rules:
      // at most one `t`-less keyframe per beat, no duplicate `t`, and
      // `delayMs`/`durationMs` only on a beat's sole keyframe (ms-mode).
      const beatGroups = new Map<string, { tless: number; ts: Set<number>; count: number; timed: boolean }>()
      const kfList = ent.keyframes as unknown[]
      const beatKeyOf = (at: unknown): string =>
        typeof at === 'number'
          ? `#${at}`
          : `${String((at as { section?: unknown }).section)}/${Number((at as { sub?: unknown }).sub ?? 0)}`
      kfList.forEach((kf, k) => {
        const klabel = `${label} ('${ent.id}') keyframes[${k}]`
        if (!kf || typeof kf !== 'object') throw new Error(`${klabel}: must be an object`)
        const at = (kf as { at?: unknown }).at
        const atOk =
          typeof at === 'number' ||
          (typeof at === 'object' && at !== null && 'section' in (at as object))
        if (!atOk) throw new Error(`${klabel}: 'at' must be a unit index or { section, sub?, t? }`)
        const t = typeof at === 'object' ? (at as { t?: unknown }).t : undefined
        if (t !== undefined && (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 1)) {
          throw new Error(`${klabel}: 'at.t' must be a number between 0 and 1`)
        }
        const delayMs = (kf as { delayMs?: unknown }).delayMs
        const durationMs = (kf as { durationMs?: unknown }).durationMs
        for (const [name, v] of [['delayMs', delayMs], ['durationMs', durationMs]] as const) {
          if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
            throw new Error(`${klabel}: '${name}' must be a number >= 0`)
          }
        }
        if (t !== undefined && (delayMs !== undefined || durationMs !== undefined)) {
          throw new Error(
            `${klabel}: 't' sub-keyframes and 'delayMs'/'durationMs' are mutually exclusive on one keyframe`
          )
        }
        validateEasing(klabel, (kf as { easing?: unknown }).easing)
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
        const key = beatKeyOf(at)
        const group = beatGroups.get(key) ?? { tless: 0, ts: new Set<number>(), count: 0, timed: false }
        group.count++
        if (t === undefined) group.tless++
        else if (group.ts.has(t)) {
          throw new Error(`${label} ('${ent.id}'): duplicate keyframe t=${t} for beat ${key}`)
        } else group.ts.add(t)
        if (delayMs !== undefined || durationMs !== undefined) group.timed = true
        beatGroups.set(key, group)
      })
      for (const [key, group] of beatGroups) {
        if (group.tless > 1) {
          throw new Error(
            `${label} ('${ent.id}'): more than one keyframe without 't' for beat ${key} — give sub-keyframes explicit 't' values`
          )
        }
        if (group.count > 1 && group.timed) {
          throw new Error(
            `${label} ('${ent.id}'): 'delayMs'/'durationMs' are only valid on a beat's sole keyframe — use 't' sub-keyframes for multi-step beats (beat ${key})`
          )
        }
      }
      if (ent.role === 'object' && (ent.interactive === true || ent.zFocusCapable === true)) {
        console.warn(
          `[stage] ${label} ('${ent.id}'): 'interactive'/'zFocusCapable' are ignored for objects`
        )
      }
    })
  }

  // Per-section timeline clock + boundary transition (v0: triggered-only).
  const validateSectionTiming = (label: string, s: Record<string, unknown>): void => {
    const clock = s.clock
    if (clock !== undefined) {
      if (clock === 'scrubbed') {
        throw new Error(
          `${label}: clock 'scrubbed' is reserved for a future release (runway scrolling); v0 supports 'triggered' only`
        )
      }
      if (clock !== 'triggered') {
        throw new Error(`${label}: 'clock' must be 'triggered'`)
      }
    }
    if (s.runway !== undefined) {
      throw new Error(`${label}: 'runway' is reserved for clock: 'scrubbed' (not yet implemented)`)
    }
    const timelineMs = s.timelineMs
    if (
      timelineMs !== undefined &&
      (typeof timelineMs !== 'number' || !Number.isFinite(timelineMs) || timelineMs <= 0)
    ) {
      throw new Error(`${label}: 'timelineMs' must be a number > 0`)
    }
    const transition = s.transition
    if (transition === undefined) return
    if (!transition || typeof transition !== 'object') {
      throw new Error(`${label}: 'transition' must be an object`)
    }
    const tr = transition as Record<string, unknown>
    if (
      tr.durationMs !== undefined &&
      (typeof tr.durationMs !== 'number' || !Number.isFinite(tr.durationMs) || tr.durationMs <= 0)
    ) {
      throw new Error(`${label}: transition.durationMs must be a number > 0`)
    }
    validateEasing(`${label} transition`, tr.easing)
    const bg = tr.background
    if (bg !== undefined && bg !== 'hold' && bg !== 'crossfade') {
      if (bg === 'flyTo') {
        throw new Error(
          `${label}: transition.background 'flyTo' is reserved; the map's camera transition is configured via map.flySpeed today`
        )
      }
      throw new Error(`${label}: transition.background must be 'hold' | 'crossfade'`)
    }
    const fg = tr.foreground
    if (fg !== undefined) {
      if (!fg || typeof fg !== 'object') {
        throw new Error(`${label}: transition.foreground must be an object`)
      }
      const spec = fg as Record<string, unknown>
      const kind = spec.kind
      if (kind === 'scale' || kind === 'wipe' || kind === 'blur') {
        throw new Error(
          `${label}: transition.foreground kind '${kind}' is reserved, not yet implemented — use 'cut' | 'fade' | 'slide'`
        )
      }
      if (kind !== 'cut' && kind !== 'fade' && kind !== 'slide') {
        throw new Error(`${label}: transition.foreground.kind must be 'cut' | 'fade' | 'slide'`)
      }
      const dir = spec.direction
      if (dir !== undefined) {
        if (kind !== 'slide') {
          throw new Error(`${label}: transition.foreground.direction is only valid with kind 'slide'`)
        }
        if (dir !== 'left' && dir !== 'right' && dir !== 'up' && dir !== 'down') {
          throw new Error(
            `${label}: transition.foreground.direction must be 'left' | 'right' | 'up' | 'down'`
          )
        }
      }
      if (
        spec.durationMs !== undefined &&
        (typeof spec.durationMs !== 'number' ||
          !Number.isFinite(spec.durationMs) ||
          spec.durationMs <= 0)
      ) {
        throw new Error(`${label}: transition.foreground.durationMs must be a number > 0`)
      }
      validateEasing(`${label} transition.foreground`, spec.easing)
    }
  }

  raw.sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') {
      throw new Error(`Section ${i} in ${slug}.config.yaml is not an object`)
    }
    validateSectionTiming(
      `Section ${i} in ${slug}.config.yaml`,
      s as unknown as Record<string, unknown>
    )
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
 * Load and validate the YAML config for a story slug.
 * Throws if the file is missing, malformed, or missing required fields.
 */
export async function loadStoryConfig(slug: string): Promise<StoryConfig> {
  const cfg = await getContentSource().readConfig(slug)
  if (cfg == null) {
    throw new Error(`Story config for ${slug} is missing`)
  }
  return parseStoryConfigText(slug, cfg.text, cfg.format)
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
