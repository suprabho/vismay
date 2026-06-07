/**
 * Editing layer for every clickable input node on the canvas.
 *
 * Splits into two groups:
 *   - Frame inputs (Content / Layout / Background / Lead / Charts / Body)
 *     live in the story's primary files: markdown body + config.yaml.
 *   - Override inputs (Share / Slides / Report / Map / Narration) live in
 *     the per-story override files: share.yaml / report.yaml / map.yaml /
 *     tts.yaml.
 *
 * The functions here:
 *   - extract the full (untruncated) slice for the editor (`buildEditableSlice`)
 *   - splice an edited slice back into the parent file (`mergeSlice`)
 *   - POST the merged file to the right admin endpoint (`saveSlice`)
 *
 * Save is full-file: every endpoint takes the entire YAML/markdown body.
 * The user is editing one section/unit-scoped slice; this module owns the
 * round-trip of "slice in editor ↔ full file on disk".
 */

import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { CanvasSources } from './canvasInputs'
import {
  getSection,
  getLayer,
  replaceLayer,
  type SlotPath,
} from './canvasSlotEditing'

export type EditableKind =
  // Override inputs — sliced from per-story override files.
  | 'share'
  | 'slides'
  | 'report'
  | 'map'
  // Per-section share map override — sliced from share.yaml's
  // `sections[<sectionId>].map` block. Distinct from `'map'` (which targets
  // map.yaml's autoplay overrides) because Share Cards read camera fields
  // from share.yaml, not map.yaml; the two files don't cross-feed.
  | 'shareMap'
  | 'narration'
  // Frame inputs — sliced from the story's config.yaml + markdown body.
  | 'content'
  | 'layout'
  | 'background'
  // Story-wide `defaults` block (config.yaml `defaults:`). For deck stories
  // this holds the page backdrop (storyBackground/overlay), the default panel
  // chrome, scroll behaviour, and chart defaults — none of which the legacy
  // per-section map paradigm surfaced. Edited as one YAML slice from the
  // canvas header; not tied to any section, so `unit` is ignored.
  | 'defaults'
  // Whole-foreground edit — works on any shape (regions-object, flat
  // VizLayer[], or absent). Used as the catch-all editor on the
  // Foreground junction so flat-shape sections aren't stuck with no
  // way to edit; users can also switch shapes here by rewriting the
  // field.
  | 'foreground'
  // Per-region foreground edit (lead / charts / body / anything else the
  // layout defines). Callers pass the region key alongside the kind so a
  // single case handles every named region the layout produces. Only
  // valid when foreground is regions-shaped; mergeSlice throws otherwise.
  | 'region'
  // One specific layer inside a section — identified by the same SlotPath
  // the visual slot editors (MapPickerModal / ImageEditModal) use. The
  // editor shows just that layer's YAML, not the surrounding array.
  // Callers pass `slotPath` alongside; mergeSlice throws if it's missing.
  // Used by the canvas's map-block click to surface the layer's YAML in
  // Monaco while the picker modal opens on top.
  | 'layer'

export interface EditableSlice {
  /** Initial text in the editor — full (untruncated) representation of
   *  whatever this slice maps to in the parent file, or '' if there's no
   *  override yet for this section/unit. */
  text: string
  /** Drives Monaco's syntax highlighting + the placeholder hint. */
  language: 'yaml' | 'plaintext' | 'markdown'
  /** Shown as the panel title. */
  title: string
  /** Shown as a placeholder in the editor when text is empty — gives the
   *  user a concrete starting point. */
  placeholder: string
}

/** Build the editor view for one (kind, unit) pair. `regionKey` is
 *  required when `kind === 'region'` — it names which foreground region
 *  (lead / charts / body / etc.) this edit targets. `slotPath` is
 *  required when `kind === 'layer'` — it names which layer inside the
 *  section's background/foreground arrays to edit. Both are ignored for
 *  other kinds. */
export function buildEditableSlice(
  kind: EditableKind,
  unit: ResolvedUnit,
  sources: CanvasSources,
  regionKey?: string,
  slotPath?: SlotPath
): EditableSlice {
  switch (kind) {
    case 'share': {
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc = safeParseYaml(sources.shareYaml)
      const slice =
        doc && typeof doc === 'object'
          ? (doc as { sections?: Record<string, unknown> }).sections?.[sectionId]
          : undefined
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `Share Variants · ${sectionId}`,
        placeholder: SHARE_PLACEHOLDER,
      }
    }
    case 'slides':
    case 'report': {
      const format = kind
      const doc = safeParseYaml(sources.reportYaml)
      const pages =
        doc && typeof doc === 'object'
          ? ((doc as Record<string, { pages?: ReportPage[] }>)[format]?.pages ??
            [])
          : []
      const slice = pages.find(
        (p) =>
          p.unit?.parentIndex === unit.parentIndex &&
          p.unit?.subIndex === unit.subIndex
      )
      const label = format === 'slides' ? 'Slides Override' : 'Report Override'
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `${label} · §${unit.parentIndex}.${unit.subIndex}`,
        placeholder: reportPagePlaceholder(unit, format),
      }
    }
    case 'map': {
      const doc = safeParseYaml(sources.mapYaml)
      const overrides =
        doc && typeof doc === 'object'
          ? ((doc as { overrides?: MapOverrideEntry[] }).overrides ?? [])
          : []
      const slice = overrides.find(
        (o) =>
          o.target?.parentIndex === unit.parentIndex &&
          // map overrides can target the parent (subIndex undefined)
          // or a subsection. For the canvas's section-level frame we
          // match either an exact subIndex match or the parent block
          // when this unit is subIndex 0 — same rule as the slicer in
          // canvasInputs.ts.
          (o.target?.subIndex === unit.subIndex ||
            (o.target?.subIndex === undefined && unit.subIndex === 0))
      )
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `Map Override · §${unit.parentIndex}.${unit.subIndex}`,
        placeholder: mapOverridePlaceholder(unit),
      }
    }
    case 'shareMap': {
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc = safeParseYaml(sources.shareYaml)
      const section =
        doc && typeof doc === 'object'
          ? (doc as { sections?: Record<string, unknown> }).sections?.[sectionId]
          : undefined
      const map =
        section && typeof section === 'object'
          ? (section as { map?: unknown }).map
          : undefined
      return {
        text: map === undefined ? '' : safeStringify(map),
        language: 'yaml',
        title: `Share Map · ${sectionId}`,
        placeholder: SHARE_MAP_PLACEHOLDER,
      }
    }
    case 'narration': {
      const doc = safeParseYaml(sources.ttsYaml)
      const units =
        doc && typeof doc === 'object'
          ? ((doc as { units?: TtsUnitEntry[] }).units ?? [])
          : []
      const sliceIndex = unit.sliceIndex ?? 0
      const slice = units.find(
        (u) =>
          u.unit?.parentIndex === unit.parentIndex &&
          u.unit?.subIndex === unit.subIndex &&
          (u.unit?.sliceIndex ?? 0) === sliceIndex
      )
      return {
        // Narration is plain text — show just the script, not the
        // wrapping YAML envelope.
        text: slice?.script ?? '',
        language: 'plaintext',
        title: `Narration · §${unit.parentIndex}.${unit.subIndex}.${sliceIndex}`,
        placeholder:
          'Custom narration for this unit (leave empty to use the default derived from heading + paragraphs).',
      }
    }

    /* ─── Frame inputs (config.yaml + markdown body) ─────────────── */

    case 'content': {
      const anchor = unitAnchorText(unit)
      const sectionLabel = `§${unit.parentIndex}.${unit.subIndex}`
      if (!anchor) {
        return {
          text: '',
          language: 'markdown',
          title: `Content · ${sectionLabel}`,
          placeholder:
            '(this section has no markdown anchor — set `text:` in config.yaml to wire one up before editing here)',
        }
      }
      const body = sources.markdown
        ? readMarkdownSectionBody(sources.markdown, anchor)
        : null
      return {
        // The renderer's `paragraphs:` slice still applies — what you see
        // here is the full source body for the anchor, not the rendered
        // (sliced) subset.
        text: body ?? '',
        language: 'markdown',
        title: `Content · ${anchor}`,
        placeholder:
          'Markdown body for this section. Lines are split into paragraphs on blank-line breaks; the `paragraphs:` config slice still applies on render.',
      }
    }

    case 'layout': {
      const section = readConfigSection(sources.configYaml, unit.parentIndex)
      const fg = section?.foreground
      const layout =
        fg && typeof fg === 'object' && !Array.isArray(fg) &&
        typeof (fg as { layout?: unknown }).layout === 'string'
          ? (fg as { layout: string }).layout
          : ''
      return {
        text: layout,
        // Single string field — plaintext keeps Monaco out of YAML quoting
        // rules that would surprise the user.
        language: 'plaintext',
        title: `Layout · §${unit.parentIndex}`,
        placeholder:
          'Foreground layout name (e.g. "lead-charts-body"). Empty = remove the layout field; the renderer will fall back to a flat layer stack.',
      }
    }

    case 'background': {
      const section = readConfigSection(sources.configYaml, unit.parentIndex)
      const bg = section?.background
      return {
        text: bg === undefined ? '' : safeStringify(bg),
        language: 'yaml',
        title: `Background · §${unit.parentIndex}`,
        placeholder: BACKGROUND_PLACEHOLDER,
      }
    }

    case 'defaults': {
      const doc = safeParseYaml(sources.configYaml)
      const defaults =
        doc && typeof doc === 'object'
          ? (doc as { defaults?: unknown }).defaults
          : undefined
      return {
        text: defaults === undefined ? '' : safeStringify(defaults),
        language: 'yaml',
        title: 'Deck defaults',
        placeholder: DEFAULTS_PLACEHOLDER,
      }
    }

    case 'foreground': {
      const section = readConfigSection(sources.configYaml, unit.parentIndex)
      const fg = section?.foreground
      // Title hints at the current shape so the user reads at a glance what
      // they're editing — same field, three valid encodings.
      const shape =
        fg === undefined
          ? 'none'
          : Array.isArray(fg)
            ? 'flat'
            : typeof fg === 'object' &&
                typeof (fg as { layout?: unknown }).layout === 'string' &&
                typeof (fg as { regions?: unknown }).regions === 'object'
              ? 'regions'
              : 'flat'
      return {
        text: fg === undefined ? '' : safeStringify(fg),
        language: 'yaml',
        title: `Foreground · §${unit.parentIndex} (${shape})`,
        placeholder: FOREGROUND_PLACEHOLDER,
      }
    }

    case 'region': {
      if (!regionKey) {
        throw new Error(
          "buildEditableSlice('region') requires regionKey (which named region to edit)"
        )
      }
      const section = readConfigSection(sources.configYaml, unit.parentIndex)
      const fg = section?.foreground
      const regions =
        fg && typeof fg === 'object' && !Array.isArray(fg) &&
        typeof (fg as { regions?: unknown }).regions === 'object' &&
        (fg as { regions?: unknown }).regions !== null
          ? (fg as { regions: Record<string, unknown> }).regions
          : null
      const slice = regions ? regions[regionKey] : undefined
      return {
        text: slice === undefined ? '' : safeStringify(slice),
        language: 'yaml',
        title: `${regionKey[0].toUpperCase()}${regionKey.slice(1)} · §${unit.parentIndex}`,
        placeholder: regionPlaceholder(regionKey),
      }
    }

    case 'layer': {
      if (!slotPath) {
        throw new Error(
          "buildEditableSlice('layer') requires slotPath (which layer to edit)"
        )
      }
      const section = getSection(sources.configYaml, unit.parentIndex)
      const layer = section ? getLayer(section, slotPath) : null
      return {
        text: layer === null ? '' : safeStringify(layer),
        language: 'yaml',
        title: layerSliceTitle(slotPath, unit.parentIndex),
        placeholder: LAYER_PLACEHOLDER,
      }
    }
  }
}

/** Human-readable title for a `layer` slice — names the slot path so the
 *  user reads at a glance which layer they're editing. */
function layerSliceTitle(path: SlotPath, parentIndex: number): string {
  const where =
    path.kind === 'legacyMap'
      ? 'map'
      : path.kind === 'background'
        ? `background[${path.index}]`
        : path.kind === 'foregroundFlat'
          ? `foreground[${path.index}]`
          : `foreground.${path.region}[${path.index}]`
  return `Layer · §${parentIndex} · ${where}`
}

/**
 * Merge an edited slice back into the appropriate raw YAML in `sources`.
 * Returns a `CanvasSources`-shaped patch (only the changed field is set)
 * plus the on-disk key for the save endpoint to PUT.
 *
 * Throws if `editedText` doesn't parse as expected — caller should
 * surface the error to the editor.
 */
export interface MergeResult {
  /** Which on-disk field changed: drives endpoint dispatch in `saveSlice`. */
  target: 'share' | 'report' | 'map' | 'tts' | 'config' | 'markdown'
  /** Patch shape — set the matching field on `CanvasSources` and re-derive. */
  patch: Partial<CanvasSources>
  /** Full new file content (null = delete the override). */
  newRaw: string | null
}

export function mergeSlice(
  kind: EditableKind,
  unit: ResolvedUnit,
  sources: CanvasSources,
  editedText: string,
  regionKey?: string,
  slotPath?: SlotPath
): MergeResult {
  const trimmed = editedText.trim()

  switch (kind) {
    case 'share': {
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc =
        (safeParseYaml(sources.shareYaml) as Record<string, unknown> | null) ??
        {}
      const sections =
        ((doc as { sections?: Record<string, unknown> }).sections as
          | Record<string, unknown>
          | undefined) ?? {}
      if (trimmed === '') {
        delete sections[sectionId]
      } else {
        sections[sectionId] = parseYaml(editedText)
      }
      ;(doc as { sections?: Record<string, unknown> }).sections = sections
      const newRaw = yamlStringify(doc)
      return {
        target: 'share',
        patch: { shareYaml: newRaw },
        newRaw,
      }
    }

    case 'slides':
    case 'report': {
      const format = kind
      const doc =
        (safeParseYaml(sources.reportYaml) as Record<string, unknown> | null) ??
        {}
      const subdoc =
        ((doc as Record<string, { pages?: ReportPage[] }>)[format] as
          | { pages?: ReportPage[] }
          | undefined) ?? {}
      const pages = (subdoc.pages ?? []).slice()
      const idx = pages.findIndex(
        (p) =>
          p.unit?.parentIndex === unit.parentIndex &&
          p.unit?.subIndex === unit.subIndex
      )
      if (trimmed === '') {
        if (idx >= 0) pages.splice(idx, 1)
      } else {
        const parsed = parseYaml(editedText) as ReportPage
        // Force the unit identity to match the canvas's anchor unit —
        // protects against a user typo'ing the parentIndex.
        parsed.unit = {
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
        }
        if (idx >= 0) pages[idx] = parsed
        else pages.push(parsed)
      }
      subdoc.pages = pages
      ;(doc as Record<string, unknown>)[format] = subdoc
      const newRaw = yamlStringify(doc)
      return {
        target: 'report',
        patch: { reportYaml: newRaw },
        newRaw,
      }
    }

    case 'map': {
      const doc =
        (safeParseYaml(sources.mapYaml) as Record<string, unknown> | null) ?? {}
      const overrides = (
        ((doc as { overrides?: MapOverrideEntry[] }).overrides ?? []) as MapOverrideEntry[]
      ).slice()
      const idx = overrides.findIndex(
        (o) =>
          o.target?.parentIndex === unit.parentIndex &&
          (o.target?.subIndex === unit.subIndex ||
            (o.target?.subIndex === undefined && unit.subIndex === 0))
      )
      if (trimmed === '') {
        if (idx >= 0) overrides.splice(idx, 1)
      } else {
        const parsed = parseYaml(editedText) as MapOverrideEntry
        // Force the target — same protection as the report case.
        parsed.target = {
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
        }
        if (idx >= 0) overrides[idx] = parsed
        else overrides.push(parsed)
      }
      ;(doc as { overrides?: MapOverrideEntry[] }).overrides = overrides
      const newRaw = yamlStringify(doc)
      return {
        target: 'map',
        patch: { mapYaml: newRaw },
        newRaw,
      }
    }

    case 'shareMap': {
      // Per-section map block lives at `sections[<sectionId>].map` inside
      // share.yaml. Empty body removes just the map block; the surrounding
      // section override (heading / paragraphs / chart / layers …) is kept
      // intact so clearing the camera doesn't nuke the user's other share
      // edits for that section.
      const sectionId =
        unit.parentConfig.id ?? `section-${unit.parentIndex}`
      const doc =
        (safeParseYaml(sources.shareYaml) as Record<string, unknown> | null) ??
        {}
      const sections =
        ((doc as { sections?: Record<string, unknown> }).sections as
          | Record<string, Record<string, unknown>>
          | undefined) ?? {}
      const section = sections[sectionId] ?? {}
      if (trimmed === '') {
        delete section.map
      } else {
        section.map = parseYaml(editedText)
      }
      sections[sectionId] = section
      ;(doc as { sections?: Record<string, unknown> }).sections = sections
      const newRaw = yamlStringify(doc)
      return {
        target: 'share',
        patch: { shareYaml: newRaw },
        newRaw,
      }
    }

    case 'narration': {
      const doc =
        (safeParseYaml(sources.ttsYaml) as Record<string, unknown> | null) ?? {}
      const units = (
        ((doc as { units?: TtsUnitEntry[] }).units ?? []) as TtsUnitEntry[]
      ).slice()
      const sliceIndex = unit.sliceIndex ?? 0
      const idx = units.findIndex(
        (u) =>
          u.unit?.parentIndex === unit.parentIndex &&
          u.unit?.subIndex === unit.subIndex &&
          (u.unit?.sliceIndex ?? 0) === sliceIndex
      )
      if (trimmed === '') {
        if (idx >= 0) units.splice(idx, 1)
      } else {
        const entry: TtsUnitEntry = {
          unit: {
            parentIndex: unit.parentIndex,
            subIndex: unit.subIndex,
            sliceIndex,
          },
          script: editedText,
        }
        if (idx >= 0) units[idx] = entry
        else units.push(entry)
      }
      ;(doc as { units?: TtsUnitEntry[] }).units = units
      const newRaw = yamlStringify(doc)
      return {
        target: 'tts',
        patch: { ttsYaml: newRaw },
        newRaw,
      }
    }

    /* ─── Frame inputs (config.yaml + markdown body) ─────────────── */

    case 'content': {
      const anchor = unitAnchorText(unit)
      if (!anchor) throw new Error('section has no markdown anchor (`text:`)')
      if (sources.markdown == null) throw new Error('story markdown not loaded')
      const newRaw = spliceMarkdownSectionBody(
        sources.markdown,
        anchor,
        editedText
      )
      return {
        target: 'markdown',
        patch: { markdown: newRaw },
        newRaw,
      }
    }

    case 'layout': {
      const { doc, section } = mutableConfigSection(
        sources.configYaml,
        unit.parentIndex
      )
      const fg = section.foreground
      const layoutValue = editedText.trim()
      if (layoutValue === '') {
        // Drop the layout field. Only meaningful when foreground is
        // regions-shaped; on a flat layer stack / missing fg, no-op.
        if (fg && typeof fg === 'object' && !Array.isArray(fg)) {
          delete (fg as Record<string, unknown>).layout
        }
      } else if (!fg || typeof fg !== 'object' || Array.isArray(fg)) {
        // Foreground is flat (VizLayer[]) or absent — silently switching
        // it to regions-shape would clobber the user's layer stack.
        // Refuse, with a pointer to the Foreground edit which handles
        // shape switches deliberately.
        throw new Error(
          `Layout edit only applies to regions-shaped foreground; this section's foreground is ${
            Array.isArray(fg) ? 'a flat layer stack' : 'absent'
          }. Edit the Foreground field as a whole if you want to switch shapes.`
        )
      } else {
        ;(fg as Record<string, unknown>).layout = layoutValue
      }
      const newRaw = yamlStringify(doc)
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }

    case 'background': {
      const { doc, section } = mutableConfigSection(
        sources.configYaml,
        unit.parentIndex
      )
      if (trimmed === '') {
        delete (section as Record<string, unknown>).background
      } else {
        section.background = parseYaml(editedText)
      }
      const newRaw = yamlStringify(doc)
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }

    case 'defaults': {
      // `defaults` is top-level (not section-scoped). Reuse mutableConfigSection
      // only to parse the whole doc + preserve the rest of config.yaml; the
      // returned section is ignored.
      const { doc } = mutableConfigSection(sources.configYaml, unit.parentIndex)
      if (trimmed === '') {
        delete (doc as Record<string, unknown>).defaults
      } else {
        ;(doc as Record<string, unknown>).defaults = parseYaml(editedText)
      }
      const newRaw = yamlStringify(doc)
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }

    case 'foreground': {
      const { doc, section } = mutableConfigSection(
        sources.configYaml,
        unit.parentIndex
      )
      if (trimmed === '') {
        delete (section as Record<string, unknown>).foreground
      } else {
        // Accept any shape the user types — regions-object, flat
        // VizLayer[], or a single layer object. The server validator
        // catches structural issues post-write (200 + warning).
        section.foreground = parseYaml(editedText)
      }
      const newRaw = yamlStringify(doc)
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }

    case 'region': {
      if (!regionKey) {
        throw new Error(
          "mergeSlice('region') requires regionKey (which named region to edit)"
        )
      }
      const { doc, section } = mutableConfigSection(
        sources.configYaml,
        unit.parentIndex
      )
      const fg = section.foreground
      // Region edits only make sense in regions shape. Promoting flat /
      // absent foreground to regions here would clobber the user's
      // layer stack. The canvas already only mounts region junctions
      // when shape === 'regions', but this is a belt-and-suspenders
      // guard against direct callers and stale clicks.
      if (!fg || typeof fg !== 'object' || Array.isArray(fg)) {
        throw new Error(
          `Region '${regionKey}' edit only applies to regions-shaped foreground; this section's foreground is ${
            Array.isArray(fg) ? 'a flat layer stack' : 'absent'
          }. Edit the Foreground field as a whole if you want to switch shapes.`
        )
      }
      const regions =
        (fg as { regions?: Record<string, unknown> }).regions ??
        ((fg as { regions: Record<string, unknown> }).regions = {})
      if (trimmed === '') {
        delete regions[regionKey]
      } else {
        regions[regionKey] = parseYaml(editedText)
      }
      const newRaw = yamlStringify(doc)
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }

    case 'layer': {
      if (!slotPath) {
        throw new Error(
          "mergeSlice('layer') requires slotPath (which layer to edit)"
        )
      }
      // Empty body clears the layer back to a bare `{}` (legacy maps) or an
      // empty layer object (modern). We don't delete the slot entirely —
      // that's a structural change the user should do from the parent
      // Background/Foreground edit, where the surrounding array is visible.
      const parsed =
        trimmed === '' ? {} : (parseYaml(editedText) as Record<string, unknown>)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Layer YAML must be a mapping (e.g. `center: …`)')
      }
      const newRaw = replaceLayer(
        sources.configYaml,
        unit.parentIndex,
        slotPath,
        parsed
      )
      return {
        target: 'config',
        patch: { configYaml: newRaw },
        newRaw,
      }
    }
  }
}

/**
 * Persist a merged slice to the right admin endpoint. Resolves on 2xx;
 * rejects with the server's error message on 4xx/5xx.
 *
 * Endpoint layout:
 *   share    → PUT  /api/stories/<slug>          { share_yaml }
 *   config   → PUT  /api/stories/<slug>          { config_yaml }
 *   markdown → PUT  /api/stories/<slug>          { markdown }
 *   report   → PUT  /api/stories/<slug>/report   { raw }
 *   map      → PUT  /api/stories/<slug>/map      { raw }
 *   tts      → PUT  /api/stories/<slug>/tts      { raw }
 */
export async function saveSlice(
  slug: string,
  result: MergeResult
): Promise<void> {
  const { target, newRaw } = result
  // Targets that PUT the story-level endpoint with a typed body key,
  // versus per-file sub-endpoints that all take `{ raw }`.
  const STORY_BODY_KEY: Partial<
    Record<MergeResult['target'], 'share_yaml' | 'config_yaml' | 'markdown'>
  > = {
    share: 'share_yaml',
    config: 'config_yaml',
    markdown: 'markdown',
  }
  const storyKey = STORY_BODY_KEY[target]
  let url: string
  let body: unknown
  if (storyKey) {
    url = `/api/stories/${encodeURIComponent(slug)}`
    body = { [storyKey]: newRaw }
  } else {
    url = `/api/stories/${encodeURIComponent(slug)}/${target}`
    body = { raw: newRaw }
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(
      `Save failed (${res.status})${err?.error ? `: ${err.error}` : ''}`
    )
  }
  // The story-config endpoint returns 200 with a `warning` field when the
  // file wrote but failed structural validation. Surface that as a soft
  // error so the user knows to fix it before publish.
  if (target === 'config') {
    const payload = (await res.json().catch(() => null)) as
      | { warning?: string; error?: string }
      | null
    if (payload?.error) {
      throw new Error(
        `${payload.error}${payload.warning ? ` (${payload.warning})` : ''}`
      )
    }
  }
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function safeParseYaml(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  try {
    return parseYaml(raw)
  } catch {
    return null
  }
}

function safeStringify(value: unknown): string {
  try {
    return yamlStringify(value, { lineWidth: 80 })
  } catch {
    return ''
  }
}

/* ─── Per-kind placeholder hints ─────────────────────────────────── */

const SHARE_PLACEHOLDER = `# Share card overrides for this section. Examples:
#
# heading: "Custom share title"
# hidePretext: true
# paragraphsOverride:
#   - "Replacement paragraph 1"
#   - "Replacement paragraph 2"
# ratios:
#   3:4:
#     map:
#       zoom: 6.5`

function reportPagePlaceholder(
  unit: ResolvedUnit,
  format: 'slides' | 'report'
): string {
  return `# ${format === 'slides' ? 'Slides' : 'Report'} override for this section. Examples:
#
# unit: { parentIndex: ${unit.parentIndex}, subIndex: ${unit.subIndex} }
# include: false       # exclude this unit from the export
# heading: "Custom heading"
# paragraphs:
#   - "Replacement paragraph"
# mapOverride:
#   zoom: 7.5
#   pitch: 30`
}

function mapOverridePlaceholder(unit: ResolvedUnit): string {
  return `# Autoplay map override for this unit. Example:
#
# target: { parentIndex: ${unit.parentIndex}, subIndex: ${unit.subIndex} }
# map:
#   center: [78.0, 22.0]
#   zoom: 5.5
#   pitch: 35
#   bearing: 0`
}

const SHARE_MAP_PLACEHOLDER = `# Share-card map override for this section. Examples:
#
# center: [78.0, 22.0]
# zoom: 5.5
# pitch: 35
# bearing: 0
# pins:
#   - coordinates: [78.0, 22.0]
#     label: "Pin"
# ratios:
#   3:4:
#     zoom: 6.5
#   1:1:
#     center: [80.0, 22.0]
#
# Empty body removes the override. Wraps live under \`sections.<id>.map:\`
# in share.yaml — same shape ShareCard reads.`

const DEFAULTS_PLACEHOLDER = `# Story-wide defaults (config.yaml \`defaults:\`). Deck stories use:
#
# storyBackground:        # page-level backdrop, renders once behind every slide
#   type: aura            #   aura | image | color | none
#   slug: "my-aura-slug"
#   fixed: true
# overlay:                # legibility layer between backdrop and content
#   color: "#000"
#   opacity: 0.3
# panel:                  # default frosted-glass chrome for foreground slots
#   background: "rgb(var(--color-panel-rgb) / 0.6)"
#   borderRadius: "12px"
#   backdropBlur: "12px"
# scroll:                 # snap = slide deck; continuous = cinematic scroll
#   mode: snap
#   paddingY: "12vh"
# chart:                  # chart theme + grid defaults
#   theme: light-editorial
`

const BACKGROUND_PLACEHOLDER = `# Section background layer stack (replaces the legacy \`map:\` field).
# Examples:
#
# type: map
# center: [78.0, 22.0]
# zoom: 5.5
#
# - type: map
#   center: [78.0, 22.0]
# - type: scene
#   id: liquid-sunset
#
# Set to \`{ type: none }\` to suppress the persistent map for this section.`

// One specific layer's YAML — what `getLayer` returns. For a map layer
// the user typically lands here from the canvas's map-block click, with
// MapPickerModal already open on top; this hint is for the case where
// they close the modal and want to edit pins / palette / style directly.
const LAYER_PLACEHOLDER = `# This layer's fields. For a map:
#
# center: [78.0, 22.0]
# zoom: 5.5
# pitch: 0
# bearing: 0
# pins:
#   - coordinates: [78.0, 22.0]
#     label: "Pin"
#
# Empty body clears the layer's contents. To remove the layer slot
# itself, edit the parent Background/Foreground array instead.`

// Foreground is shape-polymorphic — the editor accepts any of three
// encodings and writes back exactly what the user types. Documenting all
// three here is the cheapest way to make a flat-section author find their
// way to a regions setup (and vice versa).
const FOREGROUND_PLACEHOLDER = `# Section foreground — three valid shapes:
#
# 1) Flat layer stack (no layout, no named regions):
#
# - type: chart
#   id: oil-share
# - type: text
#   content: "Hello"
#
# 2) Named regions (layout-driven):
#
# layout: lead-charts-body
# regions:
#   lead:
#     type: text
#     content: "Section lead text"
#   charts:
#     - type: chart
#       id: oil-share
#   body:
#     type: prose
#     ...
#
# 3) Single layer (shorthand for a one-element flat stack):
#
# type: chart
# id: oil-share
#
# Leave the editor empty to remove the foreground entirely.`

function regionPlaceholder(regionKey: string): string {
  if (regionKey === 'charts') {
    return `# Charts region for this section. Examples:
#
# type: chart
# id: oil-share
# props:
#   showLegend: true
#
# - type: chart
#   id: oil-share
# - type: chart
#   id: gdp-trend`
  }
  const label = regionKey
    ? regionKey[0].toUpperCase() + regionKey.slice(1)
    : 'Region'
  return `# ${label} region for this section. Example:
#
# type: prose          # or 'chart', 'image', 'spacer', etc.
# content: "Optional region body"
#
# Region content is layout-defined; see your design system for the
# expected shape per layout.`
}

/* ─── Config (config.yaml) helpers ──────────────────────────────── */

/** Read-only accessor: returns the section object at `parentIndex`, or
 *  null if the config is unset / shape doesn't match. Used by
 *  buildEditableSlice to display current values. */
function readConfigSection(
  configYaml: string | null,
  parentIndex: number
): Record<string, unknown> | null {
  const doc = safeParseYaml(configYaml)
  if (!doc || typeof doc !== 'object') return null
  const sections = (doc as { sections?: unknown }).sections
  if (!Array.isArray(sections)) return null
  const section = sections[parentIndex]
  if (!section || typeof section !== 'object') return null
  return section as Record<string, unknown>
}

/** Mutable accessor: parses the config, ensures the section at
 *  `parentIndex` exists, returns the (mutable) doc + section so the
 *  caller can splice an edited field back in. Throws if the section is
 *  out of range — the canvas indexes by an existing unit, so this is a
 *  hard error, not a user-facing one. */
function mutableConfigSection(
  configYaml: string | null,
  parentIndex: number
): { doc: Record<string, unknown>; section: Record<string, unknown> } {
  const doc =
    (safeParseYaml(configYaml) as Record<string, unknown> | null) ?? {}
  const sections = Array.isArray(doc.sections)
    ? (doc.sections as unknown[])
    : []
  if (parentIndex < 0 || parentIndex >= sections.length) {
    throw new Error(
      `section ${parentIndex} not in config (config has ${sections.length} sections)`
    )
  }
  const section = sections[parentIndex]
  if (!section || typeof section !== 'object') {
    throw new Error(`section ${parentIndex} is malformed in config`)
  }
  doc.sections = sections
  return {
    doc,
    section: section as Record<string, unknown>,
  }
}

/* ─── Markdown body splicer ─────────────────────────────────────── */

/** The anchor a section uses to look up its markdown body. Matches the
 *  rule the renderer applies in resolveUnits: subsections take their own
 *  `text:` field; bare sections fall back to the section's `text:`. */
function unitAnchorText(unit: ResolvedUnit): string | undefined {
  const subs = unit.parentConfig.subsections
  if (Array.isArray(subs) && subs.length > 0) {
    return subs[unit.subIndex]?.text
  }
  return unit.parentConfig.text
}

/** Read the body of the markdown section that `anchor` resolves to,
 *  returning the joined lines (with internal blank lines preserved). */
function readMarkdownSectionBody(
  rawMarkdown: string,
  anchor: string
): string | null {
  const { bodyStartLine, contentLines, sections } = parseMarkdownStructure(
    rawMarkdown
  )
  const idx = resolveAnchorIndex(sections, anchor)
  if (idx === -1) return null
  const range = sections[idx]
  const slice = contentLines.slice(range.bodyStart, range.bodyEnd)
  // Trim trailing blank lines so the editor doesn't show phantom
  // padding from the gap before the next heading.
  while (slice.length > 0 && slice[slice.length - 1].trim() === '') {
    slice.pop()
  }
  // `bodyStartLine` only matters for the splicer; the reader hands back
  // the body in isolation.
  void bodyStartLine
  return slice.join('\n')
}

/** Splice `newBody` into the markdown at the section that `anchor`
 *  resolves to, preserving frontmatter and the rest of the document. */
function spliceMarkdownSectionBody(
  rawMarkdown: string,
  anchor: string,
  newBody: string
): string {
  const struct = parseMarkdownStructure(rawMarkdown)
  const idx = resolveAnchorIndex(struct.sections, anchor)
  if (idx === -1) {
    throw new Error(`anchor "${anchor}" not found in markdown`)
  }
  const range = struct.sections[idx]
  const newBodyLines = newBody.split('\n')
  // Preserve one trailing blank line between this section's body and
  // the next heading (or EOF) so the source markdown stays readable.
  const nextRange = struct.sections[idx + 1]
  const hadTrailingBlank =
    nextRange && struct.contentLines[range.bodyEnd - 1]?.trim() === ''
  const bodyWithPad =
    hadTrailingBlank && newBodyLines[newBodyLines.length - 1]?.trim() !== ''
      ? [...newBodyLines, '']
      : newBodyLines
  const stitched = [
    ...struct.contentLines.slice(0, range.bodyStart),
    ...bodyWithPad,
    ...struct.contentLines.slice(range.bodyEnd),
  ]
  return [
    ...struct.frontmatterLines,
    ...stitched,
  ].join('\n')
}

interface MarkdownSectionRange {
  heading: string
  level: number
  /** Index (within contentLines) of the first body line — one past the heading. */
  bodyStart: number
  /** Index of the line *after* the last body line (exclusive end). */
  bodyEnd: number
}

interface MarkdownStructure {
  /** Lines of the YAML frontmatter envelope, including the fenced `---`
   *  delimiters. Empty if the file has no frontmatter. Re-emitted as-is
   *  by the splicer so we don't disturb keys we don't understand. */
  frontmatterLines: string[]
  /** Index in the original file where the content (post-frontmatter)
   *  begins — preserved for splicer math, not used by the reader. */
  bodyStartLine: number
  /** Content lines (post-frontmatter), split on \n. */
  contentLines: string[]
  /** Level 1–3 heading ranges — matching `getStoryContent`'s parse rule
   *  so resolveAnchorIndex agrees with the server's section list. */
  sections: MarkdownSectionRange[]
}

function parseMarkdownStructure(raw: string): MarkdownStructure {
  const allLines = raw.split('\n')
  let bodyStartLine = 0
  const frontmatterLines: string[] = []
  if (allLines[0]?.trim() === '---') {
    for (let i = 1; i < allLines.length; i++) {
      if (allLines[i].trim() === '---') {
        bodyStartLine = i + 1
        frontmatterLines.push(...allLines.slice(0, i + 1))
        break
      }
    }
  }
  const contentLines = allLines.slice(bodyStartLine)
  const sections: MarkdownSectionRange[] = []
  let current: MarkdownSectionRange | null = null
  for (let i = 0; i < contentLines.length; i++) {
    const m = contentLines[i].match(/^(#{1,3})\s+(.+)$/)
    if (m) {
      if (current) {
        current.bodyEnd = i
        sections.push(current)
      }
      current = {
        heading: m[2].trim(),
        level: m[1].length,
        bodyStart: i + 1,
        bodyEnd: contentLines.length,
      }
    } else if (!current) {
      // Pre-first-heading prelude (uncommon, but matches getStoryContent's
      // behavior of synthesising an implicit intro "section" with empty
      // heading and level 0).
      current = {
        heading: '',
        level: 0,
        bodyStart: 0,
        bodyEnd: contentLines.length,
      }
    }
  }
  if (current) sections.push(current)
  return { frontmatterLines, bodyStartLine, contentLines, sections }
}

/** Mirrors `resolveAnchor` from @vismay/content-source/contentAnchors.
 *  Inlined here so the canvas client doesn't drag the gray-matter chain
 *  from `./content` into the browser bundle. */
function resolveAnchorIndex(
  sections: MarkdownSectionRange[],
  anchor: string
): number {
  const segments = anchor
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length === 0) return -1

  const parentIdx = sections.findIndex(
    (s) =>
      s.level > 0 && s.level <= 2 && headingMatches(s.heading, segments[0])
  )
  if (parentIdx === -1) return -1
  if (segments.length === 1) return parentIdx

  let cursor = parentIdx
  let parentLevel = sections[parentIdx].level
  for (let segIdx = 1; segIdx < segments.length; segIdx++) {
    let found = -1
    for (let i = cursor + 1; i < sections.length; i++) {
      const s = sections[i]
      if (s.level <= parentLevel) break
      if (headingMatches(s.heading, segments[segIdx])) {
        found = i
        break
      }
    }
    if (found === -1) return -1
    cursor = found
    parentLevel = sections[found].level
  }
  return cursor
}

function headingMatches(heading: string, segment: string): boolean {
  const headingForms = [normalize(heading), stripActPrefix(normalize(heading))]
  const segmentForms = [normalize(segment), stripActPrefix(normalize(segment))]
  for (const h of headingForms) {
    for (const s of segmentForms) {
      if (!s) continue
      if (h === s) return true
      if (h.startsWith(s)) {
        const next = h.charAt(s.length)
        if (next === '' || /[^a-z0-9]/.test(next)) return true
      }
    }
  }
  return false
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()
}

function stripActPrefix(s: string): string {
  return s.replace(/^act\s+[ivx0-9]+:\s*/i, '')
}

/* ─── Local shape mirrors (kept narrow on purpose) ─────────────── */

interface ReportPage {
  unit?: { parentIndex?: number; subIndex?: number }
  [k: string]: unknown
}

interface MapOverrideEntry {
  target?: { parentIndex?: number; subIndex?: number }
  map?: unknown
}

interface TtsUnitEntry {
  unit?: { parentIndex?: number; subIndex?: number; sliceIndex?: number }
  script?: string
}
