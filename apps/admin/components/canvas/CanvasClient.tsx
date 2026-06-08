'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit, Theme, StoryDefaults } from '@vismay/viz-engine'
import { getForegroundLayout, getVizModule } from '@vismay/viz-engine'
import type { ClassicScheme, ReactArea2D } from 'rete-react-plugin'
import {
  shareNode,
  reportNodeFormat,
  mapOverrideNode,
  shareMapOverrideNode,
  narrationNode,
  contentNode,
  parseCanvasSources,
  liveUnit,
  buildInputGraph,
  type CanvasSources,
  type InputGraph,
} from './canvasInputs'
import type { InputNodeData } from './InputNode'
import {
  seedLayerForType,
  appendBackgroundLayer,
  appendForegroundFlatLayer,
  appendForegroundRegionLayer,
  addForegroundRegion,
  createBackgroundWithLayer,
  seedShareSection,
  seedReportPage,
  seedMapOverride,
  seedTtsUnit,
} from './canvasSlotAdd'
import AddMenu, {
  type AddMenuTarget,
  type AddMenuChoice,
} from './AddMenu'
// Re-imported for the addLeaf type — InputNodeData['slot'] is the discriminator
// the leaf click dispatcher branches on.
import {
  buildOutputsForUnit,
  canvasFrameId,
  OUTPUT_GROUPS,
  type OutputGroupId,
} from './canvasOutputs'
import {
  buildEditableSlice,
  mergeSlice,
  saveSlice,
  type EditableKind,
  type EditableSlice,
} from './canvasEditing'
import {
  getLayer,
  getSection,
  readDefaultsMapStyle,
  replaceLayer,
  replaceTheme,
  saveConfigYaml,
  saveMarkdown,
  unwrapLayerFromMapPicker,
  wrapLayerForMapPicker,
  writeDefaultsMapStyle,
  type SlotPath,
} from './canvasSlotEditing'
import { appendStorySection } from '@vismay/content-source/storySection'
import AssistantLauncher from '@/components/AssistantLauncher'
import {
  registerAssistantContextProvider,
  capValue,
} from '@/lib/assistantContext'
import EditorPanel from './EditorPanel'
import PromptBar from './PromptBar'
import FixPanel from './FixPanel'
import EvaluatorPanel from './EvaluatorPanel'
import GenerationFeedback from './GenerationFeedback'
import MapPickerModal from '@/components/vizmaya/MapPickerModal'
import ImageEditModal, { type ImageLayerDraft } from './ImageEditModal'
import SlotInspector from './SlotInspector'
import ThemeEditOverlay from './ThemeEditOverlay'
import ChartEditPanel from './ChartEditPanel'
import { ComposeFlowPanel } from './compose/ComposeFlowPanel'
import type { ComposeState } from '@vismay/content-source/composeState'
import type { StorySource } from '@vismay/content-source/storySources'

interface Props {
  slug: string
  units: ResolvedUnit[]
  sources: CanvasSources
  /** Story-wide theme (from frontmatter). Surfaced as a frame input. */
  theme: Theme | null
  /**
   * Pre-signed iframe URLs keyed by output id (e.g. `section-1:share-3-4`)
   * and canvas-frame id (`canvas-frame:section-1`). Server signs at request
   * time with a long TTL so the canvas can stay open without re-signing.
   * Empty values fall back to a blank src.
   */
  signedSrcById: Record<string, string>
  /**
   * Module `type` strings available for the "+ add layer" picker, grouped
   * by slot. Resolved server-side via `getModuleTypesForVertical` so the
   * canvas knows what's in the registry for this story's vertical
   * without dragging vertical bundles into the client.
   */
  moduleTypes: {
    background: string[]
    foreground: string[]
  }
  /**
   * Story format from frontmatter. Drives deck-aware affordances (the Deck
   * defaults editor; future deck-only graph framing). Defaults to `'map'`.
   */
  format?: 'map' | 'deck'
  /**
   * Compose scaffold for this story, if one is in progress (sources → angles →
   * outline). Non-null surfaces the "✨ Research & outline" drawer from the
   * header; null surfaces a one-click "start compose" on the same button.
   */
  composeState?: ComposeState | null
  /** Sources already attached to the compose draft (hydrates the drawer). */
  composeSources?: StorySource[]
}

/**
 * Editor target for the click-to-edit slot flow. Disjoint from the canvas's
 * existing override-edit flow (EditableKind/EditorPanel) so the two save
 * paths stay independent and the side panel / modal mounts don't compete.
 */
type SlotTarget =
  | { mode: 'map'; unit: ResolvedUnit; slotPath: SlotPath }
  // Camera-only editor for the per-section override files. `overrideKind`
  // disambiguates the underlying file (map.yaml for autoplay/slides/report
  // vs share.yaml for the per-section share-card camera); the modal reads
  // and writes the same center/zoom/pitch/bearing fields either way.
  | {
      mode: 'mapOverride'
      unit: ResolvedUnit
      overrideKind: 'map' | 'shareMap'
    }
  | {
      mode: 'image'
      unit: ResolvedUnit
      slotPath: SlotPath
      initial: ImageLayerDraft
    }
  // Generic form editor for any layer whose module declares an `adminForm`
  // and has no bespoke visual editor (everything except map/image/chart).
  // `initialLayer` is the on-disk layer object, used to seed the form.
  | {
      mode: 'form'
      unit: ResolvedUnit
      slotPath: SlotPath
      layerType: string
      initialLayer: Record<string, unknown>
    }
  | { mode: 'theme' }
  // A chart's DATA, keyed only by chartId. The data lives in the `chart_data`
  // store (not config.yaml), so its editor saves via the chart PUT route rather
  // than the config-slot save path — hence no `unit`/`slotPath`.
  | { mode: 'chart'; chartId: string }

/* ─── Layout constants ───────────────────────────────────────────── */
const FRAME_W = 1920
const FRAME_H = 1080
const FRAME_MIN_W = 480
const FRAME_MIN_H = 270

/** Stringify a value to YAML for display, swallowing any serialisation error. */
function safeStringifyYaml(value: unknown): string {
  try {
    return yamlStringify(value, { lineWidth: 0 }).trimEnd()
  } catch {
    return '# (could not render)'
  }
}

/** Clip a multi-line preview to a node-sized excerpt (first N lines). */
function truncateForNode(text: string, maxLines = 12): string {
  const lines = text.split('\n')
  return lines.length <= maxLines ? text : `${lines.slice(0, maxLines).join('\n')}\n…`
}

const INPUT_W = 320
const INPUT_H = 150

const COL_GAP = 280

/* ── Left-side input graph (leaf → region → group → frame) ──────────
 * Three tiers feed the frame from the left. Leaves are source-layer cards
 * (same width as override cards); region/group junctions are short label
 * nodes. Bands stack vertically; the whole graph is centered on the frame. */
const LEAF_H = 176
const JUNCTION_H = 96
const LGAP_Y = 28
const BAND_GAP = 64
// Horizontal pitch between the three left tiers.
const LCOL_PITCH = INPUT_W + 150

const HEADER_W = 320
const HEADER_H = 88
const HEADER_GAP_Y = 28

const OUTPUT_GAP_Y = 100
const OVERRIDE_GAP_Y = 36

// Reserved strip across the top of the frame iframe for the pagination
// overlay (◀ §3 of 5 — heading ▶). Other iframes have no overlay.
const FRAME_OVERLAY_H = 56

/** Which override input sockets each output group exposes. Drives both
 *  socket creation on the OutputNode and the override → output wiring.
 *
 *  `content` (markdown body) and `map` (map.yaml override) are shared data
 *  feeding every output — wiring them in as sockets on share / slides /
 *  report makes that lineage visible (and clickable to edit) from each
 *  group instead of forcing the user back to the frame's left column.
 *  Autoplay already wires `map`; it doesn't get `content` because narration
 *  IS its content surface for that group. */
const OVERRIDE_SOCKETS_BY_GROUP: Record<OutputGroupId, string[]> = {
  share: ['variants', 'content', 'map'],
  slides: ['override', 'content', 'map'],
  report: ['override', 'content', 'map'],
  autoplay: ['map', 'narration'],
}

/**
 * Per-group override builder: how to slice the parsed sources into the
 * override input cards that feed each output group's iframe(s).
 *
 * `editKind` tags each spec with the EditableKind that the editor panel
 * uses to extract / merge that override's slice. Drives the click-to-edit
 * affordance attached to each rendered override node.
 */
interface OverrideSpec {
  data: InputNodeData
  socket: string
  editKind: EditableKind
}
function buildOverridesForGroup(
  groupId: OutputGroupId,
  unit: ResolvedUnit,
  parsed: ReturnType<typeof parseCanvasSources>
): OverrideSpec[] {
  // Content is a shared input every output consumes — editing it from any
  // group writes the same markdown as editing from the frame's left column.
  //
  // Map is per-group on purpose: share renders against share.yaml's
  // sections[<id>].map, while slides/report/autoplay render against
  // map.yaml's overrides[]. Wiring a single shared `map` card would have
  // the visual lineage lying about which file feeds which output — which
  // is exactly what bit the share output before (edits landed in map.yaml,
  // but Share Cards read share.yaml so nothing visibly changed).
  const sharedFeeds: OverrideSpec[] = [
    {
      data: contentNode(unit),
      socket: 'content',
      editKind: 'content',
    },
    {
      data: mapOverrideNode(unit, parsed),
      socket: 'map',
      editKind: 'map',
    },
  ]
  switch (groupId) {
    case 'share':
      return [
        {
          data: shareNode(unit, parsed),
          socket: 'variants',
          editKind: 'share',
        },
        {
          data: contentNode(unit),
          socket: 'content',
          editKind: 'content',
        },
        // Share Cards read camera fields from share.yaml's per-section map;
        // map.yaml is the autoplay surface and doesn't reach share. Editing
        // this card now writes share.yaml so the iframe reflects the edit.
        {
          data: shareMapOverrideNode(unit, parsed),
          socket: 'map',
          editKind: 'shareMap',
        },
      ]
    case 'slides':
      return [
        {
          data: reportNodeFormat(unit, parsed, 'slides'),
          socket: 'override',
          editKind: 'slides',
        },
        ...sharedFeeds,
      ]
    case 'report':
      return [
        {
          data: reportNodeFormat(unit, parsed, 'report'),
          socket: 'override',
          editKind: 'report',
        },
        ...sharedFeeds,
      ]
    case 'autoplay':
      return [
        {
          data: mapOverrideNode(unit, parsed),
          socket: 'map',
          editKind: 'map',
        },
        {
          data: narrationNode(unit, parsed),
          socket: 'narration',
          editKind: 'narration',
        },
      ]
  }
}

/**
 * Append `&_v=<nonce>` (or `?_v=`) so the iframe reloads when the user
 * saves an edit — the underlying YAML changes but the canonical URL
 * doesn't, so without a cache buster the browser would serve the prior
 * render.
 */
function withCacheBust(url: string, nonce: number): string {
  if (nonce === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_v=${nonce}`
}

/**
 * Section-derived data bundle: everything the editor needs to render one
 * section's nodes. Recomputed on section switch; the left input subgraph
 * is rebuilt from it, while the frame + right-side nodes update in place.
 */
interface SectionView {
  sectionId: string
  heading: string
  frameSrc: string
  /** Tiered input lineage feeding the frame (leaf → region → group). */
  graph: InputGraph
  /** Override card data per group; only the expanded group's is actually
   *  read at any moment, but we precompute all four so toggling is cheap. */
  overrides: Record<OutputGroupId, OverrideSpec[]>
  /** Output iframe URLs + dims per group. Same: all four precomputed. */
  outputs: Record<OutputGroupId, ReturnType<typeof buildOutputsForUnit>>
}

function buildSectionView(
  unit: ResolvedUnit,
  parsed: ReturnType<typeof parseCanvasSources>,
  configYaml: string | null,
  slug: string,
  signedSrcById: Record<string, string>,
  dataNonce: number,
  theme: Theme | null
): SectionView {
  // Layer the live configYaml over the unit so frame input previews
  // (Layout / Background / Lead / Charts / Body) reflect in-canvas saves
  // without waiting for the user to paginate. The original unit's other
  // fields (heading, paragraphs, sliceIndex) are kept intact — those come
  // from server-side resolveUnits and don't change on a config save.
  const live = liveUnit(unit, configYaml)
  const sectionId =
    live.parentConfig.id ?? `section-${live.parentIndex}`
  const heading =
    live.heading ||
    live.paragraphs[0]?.replace(/\*+/g, '') ||
    `Section ${live.parentIndex + 1}`
  const frameSrc = withCacheBust(
    signedSrcById[canvasFrameId(sectionId)] ?? '',
    dataNonce
  )
  const allOutputs = buildOutputsForUnit(live, slug, signedSrcById).map(
    (o) => ({ ...o, src: withCacheBust(o.src, dataNonce) })
  )
  const outputs: SectionView['outputs'] = {
    share: allOutputs.filter((o) => o.group === 'share'),
    slides: allOutputs.filter((o) => o.group === 'slides'),
    report: allOutputs.filter((o) => o.group === 'report'),
    autoplay: allOutputs.filter((o) => o.group === 'autoplay'),
  }
  return {
    sectionId,
    heading,
    frameSrc,
    // Feed the live unit (with configYaml-fresh parentConfig) so the
    // graph rebuilds against the latest background/foreground/regions
    // after an in-canvas edit — without it, the iframe would update via
    // cache-bust but the input subgraph would lag by a section switch.
    graph: buildInputGraph(live, theme),
    overrides: {
      share: buildOverridesForGroup('share', live, parsed),
      slides: buildOverridesForGroup('slides', live, parsed),
      report: buildOverridesForGroup('report', live, parsed),
      autoplay: buildOverridesForGroup('autoplay', live, parsed),
    },
    outputs,
  }
}

/**
 * Section canvas, powered by Rete v2.
 *
 * Layout (single section at a time):
 *   col 1 — frame inputs (Content / Config / Chart Data)
 *   col 2 — section frame iframe (resizable, with pagination overlay)
 *   col 3 — output group headers (Share / Slides / Report / Autoplay)
 *   col 4 — override input(s) for the expanded group
 *   col 5 — output iframe(s) for the expanded group
 *
 * Iframe count is bounded: 2 in the default state (frame + share),
 * 3 max when Autoplay is expanded (9:16 + 16:9 stacked), 1 with all
 * groups collapsed. Independent of section count — navigation between
 * sections happens via the ◀ § N of M ▶ overlay on the frame iframe
 * (or ← / → keys), updating the same Rete nodes in place rather than
 * mounting fresh ones.
 */
export default function CanvasClient({
  slug,
  units,
  sources: initialSources,
  theme,
  signedSrcById,
  moduleTypes,
  format = 'map',
  composeState = null,
  composeSources = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Sources live in state so save handlers can patch them locally,
  // triggering iframe reload + preview re-render without a full page
  // refetch. Server's initial value seeds it once.
  //
  // CanvasSources now carries configYaml + markdown alongside the override
  // YAMLs; slot-editor click handlers read them through refs (mirrored
  // below) so the latest in-memory copy is spliced even after intervening
  // edits.
  const [sources, setSources] = useState<CanvasSources>(initialSources)
  const configYamlRef = useRef(sources.configYaml)
  const markdownRef = useRef(sources.markdown)
  // Whole-bundle ref for the +Add dispatcher: override seeding reads
  // share/report/map/tts yamls and we don't want to track each in its
  // own ref when one mirror covers them all.
  const sourcesRef = useRef(sources)
  useEffect(() => {
    configYamlRef.current = sources.configYaml
  }, [sources.configYaml])
  useEffect(() => {
    markdownRef.current = sources.markdown
  }, [sources.markdown])
  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])
  // Bumped on every successful save — appended to iframe URLs as a
  // cache-bust so the iframes pull the fresh render.
  const [dataNonce, setDataNonce] = useState(0)

  // The frontmatter theme isn't carried in CanvasSources, so a theme save
  // can't piggyback on the setSources flow. Local override keeps the canvas
  // in sync with the just-saved value until the next server render reseeds
  // the prop. Theme edits are rare, so we don't bother re-syncing on prop
  // change — the user reloading the page reseeds via this useState's init.
  const [localTheme, setLocalTheme] = useState<Theme | null>(theme)

  /* ─── Slot editor state (map / image modal, theme overlay) ───── */
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null)
  const setSlotTargetRef = useRef(setSlotTarget)
  useEffect(() => {
    setSlotTargetRef.current = setSlotTarget
  }, [setSlotTarget])
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)

  /* ─── Add-menu state ────────────────────────────────────────── */
  // Drives the floating context menu on junction / header right-click.
  // Null when no menu is open; the menu's `target` drives the picker UI;
  // `context` rides alongside to tell the dispatcher how to interpret
  // the user's pick (which append helper to call, etc.).
  type AddDispatchContext =
    | {
        kind: 'layer'
        dispatch:
          | { kind: 'background-append' }
          | { kind: 'background-create' }
          | { kind: 'foreground-flat-append' }
          | { kind: 'foreground-region-append'; regionKey: string }
      }
    | { kind: 'region'; layoutHint: string }
    | {
        kind: 'override'
        overrideKind: 'share' | 'slides' | 'report' | 'map' | 'narration'
      }
  const [addMenu, setAddMenu] = useState<{
    position: { x: number; y: number }
    target: AddMenuTarget
    /** Section the menu was opened against. The dispatcher reads the
     *  section's current sources at save time, but the unit identity
     *  (parentIndex / subIndex) is captured here so the menu acts on the
     *  section the user right-clicked, not whatever section becomes
     *  active by the time they pick. */
    sourceSectionIndex: number
    context: AddDispatchContext
  } | null>(null)
  const setAddMenuRef = useRef(setAddMenu)
  useEffect(() => {
    setAddMenuRef.current = setAddMenu
  }, [setAddMenu])
  // moduleTypes from props, mirrored for closures captured at editor build.
  const moduleTypesRef = useRef(moduleTypes)
  useEffect(() => {
    moduleTypesRef.current = moduleTypes
  }, [moduleTypes])
  // Story format, mirrored for the same reason — the graph builder reads it to
  // frame deck sections as slides (drop the map-era Background band, relabel
  // the foreground as the slide).
  const formatRef = useRef(format)
  useEffect(() => {
    formatRef.current = format
  }, [format])

  const parsedSources = useMemo(() => parseCanvasSources(sources), [sources])
  const sectionUnits = useMemo(
    () => units.filter((u) => u.subIndex === 0),
    [units]
  )
  // Section views are pure data; cheap to memoise once and index into.
  // Includes dataNonce so URL changes propagate after a save, and
  // sources.configYaml so liveUnit picks up frame-input edits.
  const sectionViews = useMemo(
    () =>
      sectionUnits.map((u) =>
        buildSectionView(
          u,
          parsedSources,
          sources.configYaml,
          slug,
          signedSrcById,
          dataNonce,
          localTheme
        )
      ),
    [
      sectionUnits,
      parsedSources,
      sources.configYaml,
      slug,
      signedSrcById,
      dataNonce,
      localTheme,
    ]
  )
  // Latest sectionViews available to closures captured during the
  // initial build (which only runs once per `units` change). Without
  // this, applySection would see stale URLs/data after a save.
  const sectionViewsRef = useRef(sectionViews)
  useEffect(() => {
    sectionViewsRef.current = sectionViews
  }, [sectionViews])
  const sectionUnitsRef = useRef(sectionUnits)
  useEffect(() => {
    sectionUnitsRef.current = sectionUnits
  }, [sectionUnits])

  const [activeSectionIndex, setActiveSectionIndex] = useState(0)
  const [expandedGroup, setExpandedGroup] = useState<OutputGroupId | null>(
    'share'
  )

  /* ─── Editor state (right side panel) ────────────────────────── */
  // `regionKey` is only meaningful when `kind === 'region'`; it names
  // which foreground region the click targeted. Carried alongside so the
  // single 'region' edit kind handles every named region the layout
  // produces (lead / charts / body / sidebar / …) without per-key cases.
  // `slotPath` is only meaningful when `kind === 'layer'`; it names
  // which background/foreground layer the click targeted. Carried
  // alongside for the same reason — one edit kind handles every layer
  // slot the canvas surfaces.
  const [editorTarget, setEditorTarget] = useState<{
    kind: EditableKind
    unit: ResolvedUnit
    regionKey?: string
    slotPath?: SlotPath
    /** Open the standalone ✨ PromptBar for this slot instead of the full
     *  EditorPanel (the on-node Generate affordance — Feature 1). */
    promptOnly?: boolean
    /** Open the ✨ FixPanel for this slot — schema-mismatch repair. Carries the
     *  detected problems to feed the `canvas/fix` route. */
    fix?: { problems: string[] }
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // ✨ Generate-section (section-generate): brief input, then a preview the
  // author approves before anything is written. `genResult` holds the generated
  // section while it awaits confirmation (null = still in the brief phase).
  const [genSectionOpen, setGenSectionOpen] = useState(false)
  const [genBrief, setGenBrief] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<{
    heading: string
    paragraphs: string[]
    kind: string
    body: Record<string, unknown>
  } | null>(null)
  // ✦ Evaluator (Feature 3): screenshot + vision critique of the active section.
  const [evalOpen, setEvalOpen] = useState(false)
  // ✨ Research & outline (compose) drawer. The panel stays mounted while this
  // toggles (visibility only) so in-session research survives close → reopen.
  // `composeStarting` covers the no-state case where the header button kicks
  // off a fresh compose scaffold (then reloads).
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeStarting, setComposeStarting] = useState(false)
  // Header button: if a compose scaffold exists, toggle the drawer; otherwise
  // attach a fresh one (the `start` route) and reload so it mounts.
  async function onComposeButton() {
    if (composeState) {
      setComposeOpen((o) => !o)
      return
    }
    if (composeStarting) return
    setComposeStarting(true)
    try {
      const res = await fetch(`/api/stories/${slug}/canvas/compose/start`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (res.ok && data.ok) {
        window.location.reload()
        return
      }
    } catch {
      // fall through to re-enable the button
    }
    setComposeStarting(false)
  }
  // Audit-row id of the current draft (for the feedback row) + the author's
  // refine note for the next regeneration.
  const [genId, setGenId] = useState<string | null>(null)
  const [genRefine, setGenRefine] = useState('')
  // Derived from editorTarget + current sources; updates if the user
  // saves and the slice re-derives, but the panel stays open.
  const editorSlice: EditableSlice | null = useMemo(
    () =>
      editorTarget
        ? buildEditableSlice(
            editorTarget.kind,
            editorTarget.unit,
            sources,
            editorTarget.regionKey,
            editorTarget.slotPath
          )
        : null,
    [editorTarget, sources]
  )

  // Refs so the (pull-based) assistant context provider reads fresh state.
  const editorTargetRef = useRef(editorTarget)
  const editorSliceRef = useRef(editorSlice)
  useEffect(() => {
    editorTargetRef.current = editorTarget
  }, [editorTarget])
  useEffect(() => {
    editorSliceRef.current = editorSlice
  }, [editorSlice])

  // Expose "what the author is looking at" to the ✨ Ask assistant: the active
  // section and the focused (open-in-editor) node. Pull-based — the launcher
  // snapshots this on open; refs keep it current without re-registering.
  useEffect(() => {
    return registerAssistantContextProvider(() => {
      const idx = stateRef.current.activeSectionIndex
      const unit = sectionUnitsRef.current[idx]
      const section = unit
        ? {
            slug,
            index: idx,
            id:
              typeof unit.parentConfig?.id === 'string'
                ? unit.parentConfig.id
                : undefined,
            kind:
              typeof unit.parentConfig?.kind === 'string'
                ? unit.parentConfig.kind
                : undefined,
            heading:
              typeof unit.parentConfig?.text === 'string'
                ? unit.parentConfig.text
                : undefined,
          }
        : undefined

      const t = editorTargetRef.current
      const sl = editorSliceRef.current
      let node:
        | { label: string; kind: string; layerType?: string; value: string }
        | undefined
      if (t && sl) {
        const layerType =
          t.kind === 'layer'
            ? sl.text.match(/^type:\s*['"]?([A-Za-z][A-Za-z0-9]*)/m)?.[1]
            : undefined
        node = {
          label: sl.title,
          kind: t.kind,
          layerType,
          value: capValue(sl.text),
        }
      }

      if (!section && !node) return null
      return { section, node }
    })
  }, [slug])

  // Story-wide deck defaults (config.yaml `defaults:`), parsed for the slot
  // inspector's live preview so it merges `defaults.panel` etc. like the real
  // render. Re-parses on each in-canvas config save.
  const deckDefaults = useMemo<StoryDefaults>(() => {
    try {
      const doc = parseYaml(sources.configYaml ?? '') as
        | { defaults?: StoryDefaults }
        | null
      return (doc?.defaults ?? {}) as StoryDefaults
    } catch {
      return {} as StoryDefaults
    }
  }, [sources.configYaml])

  // `Map-Edit` affordance for the editor panel header. Defined only when
  // the current slice is camera-shaped — a map layer, an autoplay map
  // override (map.yaml), or a per-section share map (share.yaml). For
  // other kinds the button is hidden so the panel doesn't gain a no-op
  // control. The click routes to the right SlotTarget mode; the modal
  // mounts handle the file-specific wrap / save semantics.
  const editorMapEdit: (() => void) | undefined = useMemo(() => {
    if (!editorTarget) return undefined
    if (editorTarget.kind === 'layer' && editorTarget.slotPath) {
      const slotPath = editorTarget.slotPath
      // legacyMap is always a map. For modern bg/foreground layer paths,
      // peek at the on-disk layer's `type` field — if it isn't `map`, the
      // visual picker has nothing to do here.
      let isMap = slotPath.kind === 'legacyMap'
      if (!isMap) {
        const section = getSection(
          sources.configYaml,
          editorTarget.unit.parentIndex
        )
        const layer = section ? getLayer(section, slotPath) : null
        isMap = !!layer && (layer as { type?: unknown }).type === 'map'
      }
      if (!isMap) return undefined
      const unit = editorTarget.unit
      return () => {
        setSlotTarget({ mode: 'map', unit, slotPath })
      }
    }
    if (editorTarget.kind === 'map' || editorTarget.kind === 'shareMap') {
      const overrideKind = editorTarget.kind
      const unit = editorTarget.unit
      return () => {
        setSlotTarget({ mode: 'mapOverride', unit, overrideKind })
      }
    }
    return undefined
  }, [editorTarget, sources])
  const setEditorTargetRef = useRef(setEditorTarget)
  useEffect(() => {
    setEditorTargetRef.current = setEditorTarget
  }, [setEditorTarget])

  // Latest setters via refs so callbacks captured during initial editor
  // build always dispatch to the current React state, not stale closures.
  const setActiveSectionIndexRef = useRef(setActiveSectionIndex)
  const setExpandedGroupRef = useRef(setExpandedGroup)
  useEffect(() => {
    setActiveSectionIndexRef.current = setActiveSectionIndex
  }, [setActiveSectionIndex])
  useEffect(() => {
    setExpandedGroupRef.current = setExpandedGroup
  }, [setExpandedGroup])

  // Mirror state into refs so the build effect can read initial values
  // and the apply-* effects can read latest values.
  const stateRef = useRef({ activeSectionIndex: 0, expandedGroup: 'share' as OutputGroupId | null })
  useEffect(() => {
    stateRef.current.activeSectionIndex = activeSectionIndex
  }, [activeSectionIndex])
  useEffect(() => {
    stateRef.current.expandedGroup = expandedGroup
  }, [expandedGroup])

  // The editor scene — populated by the build effect, consumed by the
  // apply-* effects. `null` until the async setup completes.
  type Scene = {
    applySection: (idx: number) => Promise<void>
    applyExpandedGroup: (group: OutputGroupId | null) => Promise<void>
    destroy: () => void
  }
  const sceneRef = useRef<Scene | null>(null)

  /* ─── Build editor (once per data version) ───────────────────── */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false

    ;(async () => {
      const { createRoot } = await import('react-dom/client')
      const { NodeEditor, ClassicPreset } = await import('rete')
      const { AreaPlugin, AreaExtensions } = await import('rete-area-plugin')
      const { ConnectionPlugin, Presets: ConnectionPresets } =
        await import('rete-connection-plugin')
      const { ReactPlugin, Presets: ReactPresets } =
        await import('rete-react-plugin')

      if (disposed) return

      /* ── Custom controls ─────────────────────────────────────── */

      // For the frame iframe + the output iframes. Optional pagination
      // overlay is only used on the frame (for section navigation).
      class IframeControl extends ClassicPreset.Control {
        src: string
        width: number
        height: number
        resizable: boolean
        // True for output iframes (Share/Slides/Report/Autoplay) — the
        // user clicks Tune / Download / aspect tabs inside them. False
        // for the frame iframe, which is a static reference render and
        // shouldn't swallow canvas pan-drag from inside its bounds.
        interactive: boolean
        onResize?: (w: number, h: number) => void
        // Pagination overlay — only used on the frame iframe.
        pagination?: {
          current: number
          total: number
          label: string
        }
        constructor(
          src: string,
          w: number,
          h: number,
          opts: { resizable?: boolean; interactive?: boolean } = {}
        ) {
          super()
          this.src = src
          this.width = w
          this.height = h
          this.resizable = opts.resizable ?? false
          this.interactive = opts.interactive ?? false
        }
      }

      class TextPreviewControl extends ClassicPreset.Control {
        // Set by the build path when the node is editable (the 5
        // override types). When present, the React renderer shows a
        // hover state + opens the editor panel on click.
        onClick?: () => void
        // Set on editable text/YAML leaves (content/layout/overrides/YAML
        // layers). When present, a ✨ chip opens the standalone PromptBar
        // for this slot (Feature 1's on-node Generate affordance).
        onGenerate?: () => void
        constructor(
          public label: string,
          public tag: string,
          public body: string,
          public variant: 'mono' | 'muted'
        ) {
          super()
        }
      }

      // Group header — click to expand/collapse. No data flow.
      //
      // `onContextMenu` is set in the header build loop so right-clicking
      // the header opens the AddMenu's override-seed picker for that
      // group (e.g. seed a Share variant entry that the section doesn't
      // have yet).
      class GroupHeaderControl extends ClassicPreset.Control {
        onContextMenu?: (clientX: number, clientY: number) => void
        constructor(
          public groupId: OutputGroupId,
          public label: string,
          public expanded: boolean,
          public childCount: number
        ) {
          super()
        }
      }

      // Region / group junction label (e.g. "Charts", "Foreground"). Sits
      // on a node that fans its upstream inputs into one output, so unlike
      // the old decorative header it DOES carry sockets + data flow.
      //
      // `onClick` is set on junctions whose underlying YAML the user can
      // edit in place — Background (the whole layer stack) and each
      // foreground region (lead / charts / body / …). Unset on the
      // Foreground group junction, since editing the whole foreground
      // stack at once would conflate layout + regions.
      class JunctionControl extends ClassicPreset.Control {
        onClick?: () => void
        // Set on editable junctions (Background / Foreground / region) so a
        // ✨ chip can open the standalone PromptBar for that slot's YAML.
        onGenerate?: () => void
        // Right-click handler — set on Background / Foreground / region
        // junctions so the user can open the +Add picker from any of
        // them. Sticking it on the control (not the node) so the React
        // view reads it through the same render-customize path the rest
        // of the canvas uses.
        onContextMenu?: (clientX: number, clientY: number) => void
        // Layout-region mismatch warning — set on region junctions whose
        // key isn't in `getForegroundLayout(layoutName).regions`. The
        // view renders it as a small ⚠ chip so the user sees that the
        // region won't render until the layout is updated.
        warning?: string
        // Set alongside `warning` so the ⚠ chip can offer a ✨ FIX action
        // that opens the FixPanel against the whole foreground (renaming a
        // region key / changing the layout spans the entire foreground).
        onFix?: () => void
        constructor(public sub: string) {
          super()
        }
      }

      /* ── Node classes ────────────────────────────────────────── */

      const socket = new ClassicPreset.Socket('canvas')

      class FrameNode extends ClassicPreset.Node {
        kind = 'frame' as const
        constructor(iframeCtrl: IframeControl) {
          super('Frame')
          this.addInput('content', new ClassicPreset.Input(socket, 'Content'))
          this.addInput('layout', new ClassicPreset.Input(socket, 'Layout'))
          this.addInput('theme', new ClassicPreset.Input(socket, 'Theme'))
          this.addInput(
            'background',
            new ClassicPreset.Input(socket, 'Background')
          )
          this.addInput(
            'foreground',
            new ClassicPreset.Input(socket, 'Foreground')
          )
          this.addOutput(
            'render',
            new ClassicPreset.Output(socket, 'render', true)
          )
          this.addControl('iframe', iframeCtrl)
        }
      }

      class OutputNode extends ClassicPreset.Node {
        kind = 'output' as const
        constructor(
          label: string,
          iframeCtrl: IframeControl,
          overrideKeys: string[]
        ) {
          super(label)
          this.addInput('render', new ClassicPreset.Input(socket, 'render'))
          for (const key of overrideKeys) {
            this.addInput(key, new ClassicPreset.Input(socket, key))
          }
          this.addControl('iframe', iframeCtrl)
        }
      }

      class DataNode extends ClassicPreset.Node {
        kind = 'data' as const
        previewCtrl: TextPreviewControl
        constructor(
          label: string,
          tag: string,
          body: string,
          variant: 'mono' | 'muted'
        ) {
          super(label)
          this.addOutput(
            'value',
            new ClassicPreset.Output(socket, 'value', true)
          )
          this.previewCtrl = new TextPreviewControl(label, tag, body, variant)
          this.addControl('preview', this.previewCtrl)
        }
      }

      class GroupHeaderNode extends ClassicPreset.Node {
        kind = 'header' as const
        headerCtrl: GroupHeaderControl
        constructor(
          public groupId: OutputGroupId,
          label: string,
          expanded: boolean,
          childCount: number
        ) {
          super(label)
          this.headerCtrl = new GroupHeaderControl(
            groupId,
            label,
            expanded,
            childCount
          )
          this.addControl('header', this.headerCtrl)
        }
      }

      // Region / group node: fans N upstream connections (`in`, multi) into
      // one downstream `value`. Used for foreground regions and the
      // Foreground / Background groups.
      class JunctionNode extends ClassicPreset.Node {
        kind = 'junction' as const
        constructor(label: string, sub: string) {
          super(label)
          this.addInput('in', new ClassicPreset.Input(socket, 'in', true))
          this.addOutput(
            'value',
            new ClassicPreset.Output(socket, 'value', true)
          )
          this.addControl('ctrl', new JunctionControl(sub))
        }
      }

      /* ── React control renderers ────────────────────────────── */

      function PaginationStrip({
        current,
        total,
        label,
        onPrev,
        onNext,
      }: {
        current: number
        total: number
        label: string
        onPrev: () => void
        onNext: () => void
      }) {
        const stop = (e: React.MouseEvent | React.PointerEvent) =>
          e.stopPropagation()
        return (
          <div
            onPointerDown={stop}
            onMouseDown={stop}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: FRAME_OVERLAY_H - 8,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: 'rgba(20,20,20,0.85)',
              backdropFilter: 'blur(8px)',
              borderBottom: '1px solid #1f1f1f',
              borderRadius: '8px 8px 0 0',
              zIndex: 4,
              pointerEvents: 'auto',
              color: '#ccc',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 14,
            }}
          >
            <button
              onClick={onPrev}
              disabled={current === 0}
              style={{
                background: 'transparent',
                color: current === 0 ? '#444' : '#ddd',
                border: '1px solid #2a2a2a',
                borderRadius: 4,
                padding: '4px 12px',
                cursor: current === 0 ? 'default' : 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ◀
            </button>
            <span style={{ fontWeight: 500, flex: 1 }}>
              §{current + 1} of {total}
              <span style={{ marginLeft: 12, color: '#888', fontWeight: 400 }}>
                {label}
              </span>
            </span>
            <button
              onClick={onNext}
              disabled={current === total - 1}
              style={{
                background: 'transparent',
                color: current === total - 1 ? '#444' : '#ddd',
                border: '1px solid #2a2a2a',
                borderRadius: 4,
                padding: '4px 12px',
                cursor:
                  current === total - 1 ? 'default' : 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ▶
            </button>
          </div>
        )
      }

      function IframeControlView({ data }: { data: IframeControl }) {
        const [, force] = useReducer((n: number) => n + 1, 0)

        const onResizeStart = (e: React.MouseEvent) => {
          if (!data.resizable) return
          e.preventDefault()
          e.stopPropagation()
          const startX = e.clientX
          const startY = e.clientY
          const startW = data.width
          const startH = data.height
          const onMove = (ev: MouseEvent) => {
            data.width = Math.max(FRAME_MIN_W, startW + (ev.clientX - startX))
            data.height = Math.max(
              FRAME_MIN_H,
              startH + (ev.clientY - startY)
            )
            data.onResize?.(data.width, data.height)
            force()
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }

        const overlayPad = data.pagination ? FRAME_OVERLAY_H : 0

        return (
          <div
            style={{
              width: data.width,
              height: data.height + overlayPad,
              background: '#0a0a0a',
              border: '1px solid #262626',
              borderRadius: 8,
              overflow: 'visible',
              position: 'relative',
            }}
          >
            {data.pagination && (
              <PaginationStrip
                current={data.pagination.current}
                total={data.pagination.total}
                label={data.pagination.label}
                onPrev={() =>
                  setActiveSectionIndexRef.current((i) => Math.max(0, i - 1))
                }
                onNext={() =>
                  setActiveSectionIndexRef.current((i) =>
                    Math.min(data.pagination!.total - 1, i + 1)
                  )
                }
              />
            )}
            <div
              // For interactive iframes, swallow mousedown on the
              // wrapper so Rete doesn't start a node-drag when the user
              // clicks into the embedded module. The iframe itself owns
              // events past its borders.
              onPointerDown={
                data.interactive
                  ? (e) => e.stopPropagation()
                  : undefined
              }
              onMouseDown={
                data.interactive
                  ? (e) => e.stopPropagation()
                  : undefined
              }
              style={{
                position: 'absolute',
                top: overlayPad,
                left: 0,
                width: data.width,
                height: data.height,
                overflow: 'hidden',
              }}
            >
              <iframe
                // Keyed by src so a tab switch genuinely remounts the
                // iframe (otherwise some browsers keep the prior render
                // until the next paint, and Mapbox especially leaks).
                key={data.src}
                src={data.src}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 0,
                  display: 'block',
                  background: '#0a0a0a',
                  // Output iframes (Share/Slides/Report/Autoplay) get
                  // full pointer events so their in-page controls work
                  // from inside the canvas. The frame iframe stays
                  // passive so the user can pan/drag the canvas through
                  // its area.
                  pointerEvents: data.interactive ? 'auto' : 'none',
                }}
              />
            </div>
            {data.resizable && (
              <div
                onMouseDown={onResizeStart}
                onPointerDown={(e) => e.stopPropagation()}
                title="drag to resize"
                style={{
                  position: 'absolute',
                  right: -7,
                  bottom: -7,
                  width: 16,
                  height: 16,
                  background: '#fff',
                  border: '2px solid #888',
                  borderRadius: 3,
                  cursor: 'nwse-resize',
                  zIndex: 5,
                  pointerEvents: 'auto',
                }}
              />
            )}
          </div>
        )
      }

      function TextPreviewControlView({
        data,
      }: {
        data: TextPreviewControl
      }) {
        const editable = typeof data.onClick === 'function'
        const generatable = typeof data.onGenerate === 'function'
        const stop = (e: React.MouseEvent | React.PointerEvent) =>
          e.stopPropagation()
        const onClick = (e: React.MouseEvent) => {
          if (!editable) return
          stop(e)
          data.onClick?.()
        }
        const onGenerate = (e: React.MouseEvent) => {
          stop(e)
          data.onGenerate?.()
        }
        return (
          <div
            onClick={onClick}
            onPointerDown={editable || generatable ? stop : undefined}
            onMouseDown={editable || generatable ? stop : undefined}
            title={editable ? 'click to edit' : undefined}
            style={{
              width: INPUT_W - 24,
              minHeight: 96,
              padding: 8,
              background: '#0a0a0a',
              border: '1px solid #262626',
              borderRadius: 6,
              fontFamily:
                data.variant === 'mono'
                  ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
                  : 'system-ui, sans-serif',
              fontSize: data.variant === 'mono' ? 10 : 11,
              color: data.variant === 'mono' ? '#9a9a9a' : '#555',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              fontStyle: data.variant === 'muted' ? 'italic' : 'normal',
              overflow: 'hidden',
              cursor: editable ? 'pointer' : 'default',
              transition: 'border-color 120ms',
            }}
            onMouseEnter={(e) => {
              if (editable) e.currentTarget.style.borderColor = '#3a5da0'
            }}
            onMouseLeave={(e) => {
              if (editable) e.currentTarget.style.borderColor = '#262626'
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: '#666',
                letterSpacing: '0.14em',
                marginBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{data.tag}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {generatable && (
                  <span
                    onClick={onGenerate}
                    onPointerDown={stop}
                    onMouseDown={stop}
                    title="Generate with AI"
                    style={{ color: '#b07cd8', cursor: 'pointer' }}
                  >
                    ✨ AI
                  </span>
                )}
                {editable && <span style={{ color: '#3a5da0' }}>EDIT</span>}
              </span>
            </div>
            {data.body}
          </div>
        )
      }

      function GroupHeaderControlView({
        data,
      }: {
        data: GroupHeaderControl
      }) {
        const stop = (e: React.MouseEvent | React.PointerEvent) =>
          e.stopPropagation()
        const onClick = (e: React.MouseEvent) => {
          stop(e)
          setExpandedGroupRef.current((prev) =>
            prev === data.groupId ? null : data.groupId
          )
        }
        // Right-click opens the override-seed AddMenu, anchored at cursor.
        // Preventing default keeps the browser menu from layering on top.
        const onContextMenu = (e: React.MouseEvent) => {
          if (!data.onContextMenu) return
          e.preventDefault()
          stop(e)
          data.onContextMenu(e.clientX, e.clientY)
        }
        return (
          <button
            type="button"
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={onClick}
            onContextMenu={onContextMenu}
            style={{
              width: HEADER_W - 24,
              height: HEADER_H - 20,
              background: data.expanded ? '#161616' : '#0e0e0e',
              border: `1px solid ${data.expanded ? '#555' : '#262626'}`,
              borderRadius: 8,
              color: '#ddd',
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
            }}
          >
            <span
              style={{
                fontSize: 18,
                color: data.expanded ? '#fff' : '#888',
                width: 14,
                lineHeight: 1,
              }}
            >
              {data.expanded ? '▾' : '▸'}
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: data.expanded ? '#fff' : '#bbb',
              }}
            >
              {data.label}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                color: '#555',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {data.expanded
                ? 'loaded'
                : `${data.childCount} · click`}
            </span>
          </button>
        )
      }

      function JunctionControlView({ data }: { data: JunctionControl }) {
        // A funnel node — the Rete node title already shows the name, so the
        // control just carries the subtitle (layer count / layout name). No
        // body preview; visually lighter than a leaf card.
        //
        // When the junction is editable (Background / region junctions), an
        // EDIT chip lights up and the box becomes clickable. Matches the
        // hover affordance on leaf TextPreviewControls so the user reads
        // both as "click to edit". A right-click on any junction opens the
        // +Add menu via `onContextMenu` — independent of whether the
        // junction is left-click editable.
        const editable = typeof data.onClick === 'function'
        const hasContextMenu = typeof data.onContextMenu === 'function'
        const generatable = typeof data.onGenerate === 'function'
        const fixable = typeof data.onFix === 'function'
        // Pointer events need to be 'auto' if edit, right-click, generate, OR
        // fix is wired — otherwise those events never reach us.
        const wantsPointer = editable || hasContextMenu || generatable || fixable
        const stop = (e: React.MouseEvent | React.PointerEvent) =>
          e.stopPropagation()
        const onClick = (e: React.MouseEvent) => {
          if (!editable) return
          stop(e)
          data.onClick?.()
        }
        const onGenerate = (e: React.MouseEvent) => {
          stop(e)
          data.onGenerate?.()
        }
        const onFix = (e: React.MouseEvent) => {
          stop(e)
          data.onFix?.()
        }
        const onContextMenu = (e: React.MouseEvent) => {
          if (!hasContextMenu) return
          e.preventDefault()
          stop(e)
          data.onContextMenu?.(e.clientX, e.clientY)
        }
        const titleHint = editable
          ? hasContextMenu
            ? 'click to edit · right-click to add'
            : 'click to edit'
          : hasContextMenu
            ? 'right-click to add'
            : undefined
        return (
          <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            onPointerDown={wantsPointer ? stop : undefined}
            onMouseDown={wantsPointer ? stop : undefined}
            title={titleHint}
            style={{
              width: INPUT_W - 24,
              padding: '6px 10px',
              background: '#121212',
              border: `1px solid ${data.warning ? '#a07a3a' : '#333'}`,
              borderRadius: 8,
              fontFamily: 'system-ui, sans-serif',
              fontSize: 10,
              color: '#777',
              letterSpacing: '0.06em',
              cursor: editable ? 'pointer' : 'default',
              pointerEvents: wantsPointer ? 'auto' : 'none',
              transition: 'border-color 120ms',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (editable) e.currentTarget.style.borderColor = '#3a5da0'
            }}
            onMouseLeave={(e) => {
              if (editable) {
                e.currentTarget.style.borderColor = data.warning
                  ? '#a07a3a'
                  : '#333'
              }
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{data.sub}</span>
            {data.warning && (
              <span
                title={data.warning}
                style={{ color: '#a07a3a', letterSpacing: '0.14em' }}
              >
                ⚠ MISMATCH
              </span>
            )}
            {data.warning && fixable && (
              <span
                onClick={onFix}
                onPointerDown={stop}
                onMouseDown={stop}
                title="Fix this mismatch with AI"
                style={{
                  color: '#b07cd8',
                  letterSpacing: '0.14em',
                  cursor: 'pointer',
                }}
              >
                ✨ FIX
              </span>
            )}
            {generatable && !data.warning && (
              <span
                onClick={onGenerate}
                onPointerDown={stop}
                onMouseDown={stop}
                title="Generate with AI"
                style={{
                  color: '#b07cd8',
                  letterSpacing: '0.14em',
                  cursor: 'pointer',
                }}
              >
                ✨ AI
              </span>
            )}
            {editable && !data.warning && (
              <span style={{ color: '#3a5da0', letterSpacing: '0.14em' }}>
                EDIT
              </span>
            )}
            {hasContextMenu && !editable && !data.warning && (
              <span style={{ color: '#555', letterSpacing: '0.14em' }}>
                + ADD
              </span>
            )}
          </div>
        )
      }

      /* ── Plugin wiring ───────────────────────────────────────── */

      type Schemes = ClassicScheme
      type AreaExtra = ReactArea2D<Schemes>

      const editor = new NodeEditor<Schemes>()
      const area = new AreaPlugin<Schemes, AreaExtra>(container)
      const connection = new ConnectionPlugin<Schemes, AreaExtra>()
      const reactPlugin = new ReactPlugin<Schemes, AreaExtra>({ createRoot })

      reactPlugin.addPreset(
        ReactPresets.classic.setup({
          customize: {
            control(data) {
              if (data.payload instanceof IframeControl) {
                return IframeControlView as never
              }
              if (data.payload instanceof TextPreviewControl) {
                return TextPreviewControlView as never
              }
              if (data.payload instanceof GroupHeaderControl) {
                return GroupHeaderControlView as never
              }
              if (data.payload instanceof JunctionControl) {
                return JunctionControlView as never
              }
              return null
            },
          },
        })
      )
      connection.addPreset(ConnectionPresets.classic.setup())

      editor.use(area)
      area.use(connection)
      area.use(reactPlugin)

      AreaExtensions.simpleNodesOrder(area)
      AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
        accumulating: AreaExtensions.accumulateOnCtrl(),
      })

      /* ── Initial build (single section) ──────────────────────── */

      // Read the latest section views through the ref — by the time
      // this async setup completes, parent state could have changed.
      const initialView =
        sectionViewsRef.current[stateRef.current.activeSectionIndex] ??
        sectionViewsRef.current[0]
      const sectionCount = sectionViewsRef.current.length

      // Column X coords. Left of the frame: three input tiers
      // (leaf → region → group). Right of the frame: headers → overrides →
      // outputs, far enough that even the slides node (1920 wide) doesn't
      // reach back into the header lane.
      const leafColX = 0
      const regionColX = leafColX + LCOL_PITCH
      const groupColX = regionColX + LCOL_PITCH
      const frameColX = groupColX + INPUT_W + COL_GAP
      const headerColX = frameColX + FRAME_W + COL_GAP
      const overrideColX = headerColX + HEADER_W + COL_GAP
      const outputColX = overrideColX + INPUT_W + COL_GAP

      /* Frame (always present) */
      const frameIframeCtrl = new IframeControl(
        initialView.frameSrc,
        FRAME_W,
        FRAME_H,
        { resizable: true }
      )
      frameIframeCtrl.pagination = {
        current: stateRef.current.activeSectionIndex,
        total: sectionCount,
        label: initialView.heading,
      }
      const frame = new FrameNode(frameIframeCtrl)
      frameIframeCtrl.onResize = (w, h) => {
        void area.resize(frame.id, w, h)
      }
      await editor.addNode(frame)
      await area.translate(frame.id, { x: frameColX, y: 0 })

      /* ── Left input graph (leaf → region → group → frame) ──────────
       *
       * The frame's lineage, laid out in three columns:
       *   leaf col   — one card per source VizLayer (map / chart / image …)
       *   region col — foreground regions (Charts / Body / …), the Background
       *                group, and the standalone Content / Layout / Theme
       *                inputs
       *   group col  — the Foreground group (regions funnel through it)
       *
       * Node count + shape vary per section (different regions, different
       * layer stacks), so the whole subgraph is torn down and rebuilt on a
       * section switch rather than updated in place. `leftNodeIds` tracks
       * everything created here so `unmountInputs` can clear it. */
      let leftNodeIds = new Set<string>()

      const stackH = (n: number): number =>
        n > 0 ? n * LEAF_H + (n - 1) * LGAP_Y : 0
      const bandH = (n: number): number => Math.max(stackH(n), JUNCTION_H)

      // Total height of the left graph, used to vertically center it on the
      // frame. Mirrors the placement walk in `mountInputs`.
      function measureLeftHeight(g: InputGraph): number {
        // Content / Layout / Theme standalone block.
        let h = 3 * LEAF_H + 2 * LGAP_Y + BAND_GAP
        // Background band (>=1 row: a placeholder when empty). Deck sections
        // with no per-section background drop the band entirely — the backdrop
        // is page-level (edited via the Deck defaults button), so a
        // "(no background)" box is just map-era noise. Must mirror mountInputs.
        const deckNoBg =
          formatRef.current === 'deck' && g.background.layers.length === 0
        if (!deckNoBg) {
          h += bandH(Math.max(1, g.background.layers.length)) + BAND_GAP
        }
        // Foreground band.
        if (g.foreground.shape === 'regions') {
          const regions = g.foreground.regions
          let fh = 0
          regions.forEach((r, i) => {
            fh += bandH(Math.max(1, r.layers.length))
            if (i < regions.length - 1) fh += LGAP_Y
          })
          h += Math.max(fh, JUNCTION_H)
        } else if (g.foreground.shape === 'flat') {
          h += bandH(g.foreground.layers.length)
        } else {
          h += LEAF_H
        }
        return h
      }

      /**
       * Build a click-to-edit handler that opens the editor panel against
       * the CURRENT active section's unit (read via refs at click time, so
       * paginating then clicking targets the right section rather than the
       * build-time one). Used for both leaf DataNodes (Content / Layout)
       * and junction nodes (Background / regions); the regionKey is only
       * passed for region junctions and is ignored by other kinds.
       */
      function makeEditClick(
        kind: EditableKind,
        regionKey?: string
      ): () => void {
        return () => {
          const idx = stateRef.current.activeSectionIndex
          const targetUnit = sectionUnitsRef.current[idx]
          if (!targetUnit) return
          setEditorTargetRef.current({
            kind,
            unit: targetUnit,
            regionKey,
          })
        }
      }

      // Sibling of makeEditClick that opens the standalone ✨ PromptBar
      // (promptOnly) for the slot instead of the full YAML editor. Shares the
      // same target shape, so the generated value persists through handleSave.
      function makeGenerateClick(
        kind: EditableKind,
        regionKey?: string,
        slotPath?: SlotPath
      ): () => void {
        return () => {
          const idx = stateRef.current.activeSectionIndex
          const targetUnit = sectionUnitsRef.current[idx]
          if (!targetUnit) return
          setEditorTargetRef.current({
            kind,
            unit: targetUnit,
            regionKey,
            slotPath,
            promptOnly: true,
          })
        }
      }

      // Sibling of makeGenerateClick that opens the ✨ FixPanel against the
      // whole foreground. A region-key / layout mismatch can only be repaired
      // by editing the whole foreground (rename the key OR change the layout),
      // so the fix always targets `kind: 'foreground'` regardless of which
      // region's ⚠ chip was clicked. `problems` carries the detected
      // mismatch(es) through to the repair route.
      function makeFixClick(problems: string[]): () => void {
        return () => {
          const idx = stateRef.current.activeSectionIndex
          const targetUnit = sectionUnitsRef.current[idx]
          if (!targetUnit) return
          setEditorTargetRef.current({
            kind: 'foreground',
            unit: targetUnit,
            fix: { problems },
          })
        }
      }

      /**
       * Open the +Add menu at `(cx, cy)`. The `context` field travels
       * with the menu's target so the dispatcher knows what to do when
       * the user picks. Reads the active section through refs at call
       * time so right-clicking targets the section the user is looking
       * at, not the build-time one.
       *
       * Returns nothing — the JunctionControl's onContextMenu is what
       * the React event fires into; this helper produces those handlers.
       */
      function makeAddLayerOpener(opts: {
        slot: 'background' | 'foreground'
        label: string
        /** Discriminator for the dispatcher: how to splice the new layer. */
        dispatch:
          | { kind: 'background-append' }
          | { kind: 'background-create' }
          | { kind: 'foreground-flat-append' }
          | { kind: 'foreground-region-append'; regionKey: string }
      }): (clientX: number, clientY: number) => void {
        return (clientX, clientY) => {
          const idx = stateRef.current.activeSectionIndex
          setAddMenuRef.current({
            position: { x: clientX, y: clientY },
            target: {
              kind: 'layer',
              slot: opts.slot,
              availableTypes: moduleTypesRef.current[opts.slot],
              label: opts.label,
            },
            sourceSectionIndex: idx,
            context: { kind: 'layer', dispatch: opts.dispatch },
          })
        }
      }

      function makeAddRegionOpener(opts: {
        knownKeys: string[]
        existingKeys: string[]
        layoutName: string
      }): (clientX: number, clientY: number) => void {
        return (clientX, clientY) => {
          const idx = stateRef.current.activeSectionIndex
          setAddMenuRef.current({
            position: { x: clientX, y: clientY },
            target: {
              kind: 'region',
              knownKeys: opts.knownKeys,
              existingKeys: opts.existingKeys,
              layoutName: opts.layoutName,
            },
            sourceSectionIndex: idx,
            context: { kind: 'region', layoutHint: opts.layoutName },
          })
        }
      }

      function makeAddOverrideOpener(opts: {
        label: string
        overrideKind: 'share' | 'slides' | 'report' | 'map' | 'narration'
      }): (clientX: number, clientY: number) => void {
        return (clientX, clientY) => {
          const idx = stateRef.current.activeSectionIndex
          setAddMenuRef.current({
            position: { x: clientX, y: clientY },
            target: {
              kind: 'override',
              label: opts.label,
              overrideKind: opts.overrideKind,
            },
            sourceSectionIndex: idx,
            context: { kind: 'override', overrideKind: opts.overrideKind },
          })
        }
      }

      async function mountInputs(view: SectionView): Promise<void> {
        const g = view.graph
        const offset = FRAME_H / 2 - measureLeftHeight(g) / 2

        const addLeaf = async (
          d: {
            label: string
            tag: string
            body: string
            variant: 'mono' | 'muted'
            slot?: InputNodeData['slot']
          },
          x: number,
          y: number,
          editKind?: EditableKind
        ): Promise<DataNode> => {
          const node = new DataNode(d.label, d.tag, d.body, d.variant)
          // Two complementary click paths share addLeaf:
          //   - `d.slot` (theme + map/image layer leaves) dispatches to the
          //     dedicated slot editors (MapPickerModal / ImageEditModal /
          //     ThemeEditOverlay) via setSlotTargetRef.
          //   - `editKind` (content / layout) dispatches to the YAML
          //     EditorPanel via setEditorTargetRef.
          // They don't overlap in practice — the only leaf that has both a
          // slot AND would carry an editKind is theme, which intentionally
          // gets the visual editor; the slot branch wins by being first.
          if (d.slot) {
            const slot = d.slot
            node.previewCtrl.onClick = () => {
              if (slot.kind === 'theme') {
                setSlotTargetRef.current({ mode: 'theme' })
                return
              }
              if (slot.kind === 'chartData') {
                // Chart data is story-scoped by id (no section unit needed) and
                // saves to the chart_data store via its own editor.
                setSlotTargetRef.current({ mode: 'chart', chartId: slot.chartId })
                return
              }
              const idx = stateRef.current.activeSectionIndex
              const targetUnit = sectionUnitsRef.current[idx]
              if (!targetUnit) return
              if (slot.layerType === 'map') {
                // Panel-first affordance: open the YAML editor only. The
                // panel exposes a "Map-Edit" button (wired in CanvasClient
                // via the editorMapEdit callback) that opens the visual
                // picker on demand — so the user starts with the source of
                // truth and explicitly drops into the camera tool. Same
                // panel handles pin/style tweaks the picker doesn't cover.
                setEditorTargetRef.current({
                  kind: 'layer',
                  unit: targetUnit,
                  slotPath: slot.path,
                })
              } else if (slot.layerType === 'image') {
                const section = getSection(
                  configYamlRef.current,
                  targetUnit.parentIndex
                )
                const layer = section ? getLayer(section, slot.path) : null
                const initial: ImageLayerDraft = {
                  src: typeof layer?.src === 'string' ? layer.src : '',
                  alt: typeof layer?.alt === 'string' ? layer.alt : undefined,
                  fit: (layer?.fit as ImageLayerDraft['fit']) ?? 'cover',
                  focus:
                    typeof layer?.focus === 'string' ? layer.focus : undefined,
                  background:
                    typeof layer?.background === 'string'
                      ? layer.background
                      : undefined,
                }
                setSlotTargetRef.current({
                  mode: 'image',
                  unit: targetUnit,
                  slotPath: slot.path,
                  initial,
                })
              } else {
                // Any other module with an adminForm opens the generic form
                // editor. Types with no adminForm (chart, or a malformed /
                // unknown layer that resolved to no module) fall through to
                // the YAML layer editor — the surface they'd land on before.
                const mod = getVizModule(slot.layerType)
                if (mod?.adminForm) {
                  const section = getSection(
                    configYamlRef.current,
                    targetUnit.parentIndex
                  )
                  const layer = section
                    ? getLayer(section, slot.path)
                    : null
                  setSlotTargetRef.current({
                    mode: 'form',
                    unit: targetUnit,
                    slotPath: slot.path,
                    layerType: slot.layerType,
                    initialLayer: layer ?? { type: slot.layerType },
                  })
                } else {
                  setEditorTargetRef.current({
                    kind: 'layer',
                    unit: targetUnit,
                    slotPath: slot.path,
                  })
                }
              }
            }
          } else if (editKind) {
            node.previewCtrl.onClick = makeEditClick(editKind)
            node.previewCtrl.onGenerate = makeGenerateClick(editKind)
          }
          // ✨ Generate on layer leaves, but only those that edit through the
          // YAML editor (map layers + types with no adminForm) — those persist
          // via handleSave. Image + adminForm-form layers use separate editors
          // (image modal / SlotInspector) and keep their in-panel AI for now.
          if (d.slot && d.slot.kind === 'layer' && d.slot.layerType !== 'image') {
            const slot = d.slot
            const usesYamlEditor =
              slot.layerType === 'map' || !getVizModule(slot.layerType)?.adminForm
            if (usesYamlEditor) {
              node.previewCtrl.onGenerate = makeGenerateClick(
                'layer',
                undefined,
                slot.path
              )
            }
          }
          await editor.addNode(node)
          await area.translate(node.id, { x, y })
          leftNodeIds.add(node.id)
          return node
        }
        const addJunction = async (
          label: string,
          sub: string,
          x: number,
          y: number,
          onClick?: () => void,
          opts?: {
            onContextMenu?: (clientX: number, clientY: number) => void
            warning?: string
            onGenerate?: () => void
            onFix?: () => void
          }
        ): Promise<JunctionNode> => {
          const node = new JunctionNode(label, sub)
          const ctrl = node.controls.ctrl as InstanceType<typeof JunctionControl>
          if (onClick) ctrl.onClick = onClick
          if (opts?.onGenerate) ctrl.onGenerate = opts.onGenerate
          // Set onContextMenu + warning + onFix BEFORE addNode so the initial
          // React render sees them — the +ADD chip and the ⚠ MISMATCH / ✨ FIX
          // chips all depend on these being present at first paint.
          if (opts?.onContextMenu) ctrl.onContextMenu = opts.onContextMenu
          if (opts?.warning) ctrl.warning = opts.warning
          if (opts?.onFix) ctrl.onFix = opts.onFix
          await editor.addNode(node)
          await area.translate(node.id, { x, y })
          leftNodeIds.add(node.id)
          return node
        }
        const wire = async (
          src: DataNode | JunctionNode,
          srcKey: string,
          dst: JunctionNode | FrameNode,
          dstKey: string
        ): Promise<void> => {
          await editor.addConnection(
            new ClassicPreset.Connection(
              src,
              srcKey,
              dst,
              dstKey
            ) as Schemes['Connection']
          )
        }

        // Chart layers reference a chart id; the chart's DATA lives in the
        // separate chart_data store, not the section config. For each distinct
        // chart id in the section we hang a "Chart Data" node one column LEFT of
        // its chart leaf, feeding the same junction the leaf does, and lazily
        // load the data into the node's body. Clicking it opens the chart editor
        // (generate / edit / save). Routed through `addLeaf` so the node lands in
        // `leftNodeIds` and is torn down on section switch like every other leaf.
        const mountedChartIds = new Set<string>()
        const addChartDataNode = async (
          chartId: string,
          dst: JunctionNode,
          leafX: number,
          leafY: number
        ): Promise<void> => {
          if (mountedChartIds.has(chartId)) return
          mountedChartIds.add(chartId)
          const node = await addLeaf(
            {
              label: 'Chart Data',
              tag: 'JSON',
              body: '…loading chart data',
              variant: 'mono',
              slot: { kind: 'chartData', chartId },
            },
            leafX - LCOL_PITCH,
            leafY
          )
          await wire(node, 'value', dst, 'in')
          void (async () => {
            let body: string
            try {
              const res = await fetch(
                `/api/stories/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}`,
                { cache: 'no-store' }
              )
              if (res.ok) {
                const json = (await res.json()) as { data?: unknown }
                body =
                  json.data != null
                    ? truncateForNode(JSON.stringify(json.data, null, 2))
                    : '(no data yet — click to generate)'
              } else if (res.status === 404) {
                body = '(no data yet — click to generate)'
              } else {
                body = '(failed to load chart data)'
              }
            } catch {
              return // section likely switched away; leave the placeholder
            }
            try {
              node.previewCtrl.body = body
              await area.update('control', node.previewCtrl.id)
            } catch {
              // node torn down by a section switch before the fetch resolved
            }
          })()
        }

        let y = offset

        /* Standalone direct frame inputs (region column). Content is
         * always editable (markdown body); Layout is editable only when
         * the foreground is regions-shaped — on a flat layer stack the
         * "layout" field is meaningless and saving one would clobber the
         * stack. Theme lives in markdown frontmatter and stays
         * non-editable here — frontmatter editing is its own concern. */
        // Deck sections read as slide parts, not map inputs.
        const isDeck = formatRef.current === 'deck'
        const deckLeafLabel: Partial<Record<'content' | 'layout' | 'theme', string>> =
          isDeck ? { content: 'Slide text', layout: 'Slide layout' } : {}
        for (const key of ['content', 'layout', 'theme'] as const) {
          let editKind: EditableKind | undefined
          if (key === 'content') {
            editKind = 'content'
          } else if (key === 'layout' && g.foreground.shape === 'regions') {
            editKind = 'layout'
          }
          const relabel = deckLeafLabel[key]
          const data = relabel ? { ...g[key], label: relabel } : g[key]
          const node = await addLeaf(data, regionColX, y, editKind)
          await wire(node, 'value', frame, key)
          y += LEAF_H + LGAP_Y
        }
        y += BAND_GAP - LGAP_Y

        /* Background band: layer leaves → Background group → frame. Dropped
           for deck sections with no per-section background (the backdrop is
           page-level — see the Deck defaults editor); mirrors measureLeftHeight. */
        if (!(isDeck && g.background.layers.length === 0)) {
          const leaves =
            g.background.layers.length > 0
              ? g.background.layers
              : [
                  {
                    label: 'Background',
                    tag: '—',
                    body: '(no background — none / inherited)',
                    variant: 'muted' as const,
                  },
                ]
          const h = bandH(leaves.length)
          // Editable: clicking opens the whole background layer stack as
          // YAML. Empty save deletes the field; the renderer then falls
          // back to whatever the legacy `map:` shim or absence implies.
          // Right-click: opens the +Add layer picker. When shape is
          // 'none', the dispatcher creates the background array from
          // scratch ('background-create'); otherwise it appends to the
          // existing array ('background-append').
          const bgNode = await addJunction(
            'Background',
            leaves.length === 1 && g.background.shape === 'none'
              ? 'none'
              : `${g.background.layers.length} layer${
                  g.background.layers.length === 1 ? '' : 's'
                }`,
            regionColX,
            y + h / 2 - JUNCTION_H / 2,
            makeEditClick('background'),
            {
              onContextMenu: makeAddLayerOpener({
                slot: 'background',
                label: 'Background',
                dispatch:
                  g.background.shape === 'none'
                    ? { kind: 'background-create' }
                    : { kind: 'background-append' },
              }),
              onGenerate: makeGenerateClick('background'),
            }
          )
          await wire(bgNode, 'value', frame, 'background')
          let ly = y + (h - stackH(leaves.length)) / 2
          for (const leaf of leaves) {
            const ln = await addLeaf(leaf, leafColX, ly)
            await wire(ln, 'value', bgNode, 'in')
            ly += LEAF_H + LGAP_Y
          }
          y += h + BAND_GAP
        }

        /* Foreground band: layer leaves → region → Foreground group → frame. */
        const fg = g.foreground
        if (fg.shape === 'regions') {
          const fgTop = y
          const regionCenters: number[] = []
          const regionNodes: JunctionNode[] = []
          // Cache the layout's known region keys once per mount so the
          // warning check + region picker suggestions all read the same
          // source of truth. `getForegroundLayout(layoutName)` returns
          // undefined for an unknown layout; we treat that as "no known
          // keys" rather than throwing — the user might be mid-rename.
          const layoutName = fg.layout ?? ''
          const layoutDef = layoutName
            ? getForegroundLayout(layoutName)
            : undefined
          const layoutKnownKeys = layoutDef
            ? Object.keys(layoutDef.regions)
            : []
          const existingRegionKeys = fg.regions.map((r) => r.key)
          for (const region of fg.regions) {
            const leaves =
              region.layers.length > 0
                ? region.layers
                : [
                    {
                      label: region.label,
                      tag: '—',
                      body: '(no layers)',
                      variant: 'muted' as const,
                    },
                  ]
            const h = bandH(leaves.length)
            // Warning if the layout doesn't reference this region key —
            // the YAML will write but the renderer's layout dispatcher
            // won't paint it, so the user needs to know.
            const isUnknownToLayout =
              layoutDef !== undefined && !layoutKnownKeys.includes(region.key)
            const regionWarning = isUnknownToLayout
              ? `Region '${region.key}' is not used by layout '${layoutName}'. The renderer won't paint this region until the layout is updated or the region key is changed.`
              : undefined
            // Each region (lead / charts / body / …) is editable as its
            // own YAML slice of foreground.regions[region.key]. The
            // generic 'region' kind handles any region name the layout
            // produces; the regionKey is what tells canvasEditing which
            // slot to read or splice.
            const rj = await addJunction(
              region.label,
              `${region.layers.length} layer${
                region.layers.length === 1 ? '' : 's'
              } · region`,
              regionColX,
              y + h / 2 - JUNCTION_H / 2,
              makeEditClick('region', region.key),
              {
                onContextMenu: makeAddLayerOpener({
                  slot: 'foreground',
                  label: `${region.label} region`,
                  dispatch: {
                    kind: 'foreground-region-append',
                    regionKey: region.key,
                  },
                }),
                warning: regionWarning,
                onGenerate: makeGenerateClick('region', region.key),
                onFix: regionWarning
                  ? makeFixClick([regionWarning])
                  : undefined,
              }
            )
            regionNodes.push(rj)
            regionCenters.push(y + h / 2)
            let ly = y + (h - stackH(leaves.length)) / 2
            for (const leaf of leaves) {
              const ln = await addLeaf(leaf, leafColX, ly)
              await wire(ln, 'value', rj, 'in')
              if ('slot' in leaf && leaf.slot?.kind === 'layer' && leaf.slot.chartId) {
                await addChartDataNode(leaf.slot.chartId, rj, leafColX, ly)
              }
              ly += LEAF_H + LGAP_Y
            }
            y += h + LGAP_Y
          }
          const fgBottom = y - LGAP_Y
          const center =
            regionCenters.length > 0
              ? (regionCenters[0] + regionCenters[regionCenters.length - 1]) / 2
              : (fgTop + fgBottom) / 2
          // Foreground group junction is editable in every shape — opens
          // the whole foreground YAML so the user can edit it freeform
          // (and switch shapes by rewriting). Region junctions give
          // finer-grained per-region edits when shape === 'regions';
          // this is the catch-all entry point and the ONLY editor on
          // flat / none shapes.
          //
          // Right-click: regions-shape opens the region picker so the
          // user can add a new region under foreground.regions; the
          // picker surfaces layout-defined region suggestions.
          const fgNode = await addJunction(
            isDeck ? 'Slide' : 'Foreground',
            fg.layout ? `layout: ${fg.layout}` : 'regions',
            groupColX,
            center - JUNCTION_H / 2,
            makeEditClick('foreground'),
            {
              onContextMenu: makeAddRegionOpener({
                knownKeys: layoutKnownKeys,
                existingKeys: existingRegionKeys,
                layoutName,
              }),
              onGenerate: makeGenerateClick('foreground'),
            }
          )
          await wire(fgNode, 'value', frame, 'foreground')
          for (const rj of regionNodes) await wire(rj, 'value', fgNode, 'in')
        } else if (fg.shape === 'flat') {
          const leaves = fg.layers
          const h = bandH(leaves.length)
          // Right-click on flat foreground appends a new layer to the
          // existing flat array. Switching shape (flat → regions) would
          // clobber the layer stack, so the picker stays in layer mode.
          const fgNode = await addJunction(
            isDeck ? 'Slide' : 'Foreground',
            isDeck ? 'single region' : 'flat layer stack',
            groupColX,
            y + h / 2 - JUNCTION_H / 2,
            makeEditClick('foreground'),
            {
              onContextMenu: makeAddLayerOpener({
                slot: 'foreground',
                label: 'Foreground (flat)',
                dispatch: { kind: 'foreground-flat-append' },
              }),
              onGenerate: makeGenerateClick('foreground'),
            }
          )
          await wire(fgNode, 'value', frame, 'foreground')
          let ly = y + (h - stackH(leaves.length)) / 2
          for (const leaf of leaves) {
            const ln = await addLeaf(leaf, regionColX, ly)
            await wire(ln, 'value', fgNode, 'in')
            if (leaf.slot?.kind === 'layer' && leaf.slot.chartId) {
              await addChartDataNode(leaf.slot.chartId, fgNode, regionColX, ly)
            }
            ly += LEAF_H + LGAP_Y
          }
        } else {
          // 'none' shape: foreground is absent. Right-click opens the
          // region picker; adding a region promotes the foreground to
          // regions shape with the default layout (`split-37-63-two-row`).
          // Picker shows that default's region keys as suggestions.
          const defaultLayout = 'split-37-63-two-row'
          const defaultLayoutDef = getForegroundLayout(defaultLayout)
          const fgNode = await addJunction(
            isDeck ? 'Slide' : 'Foreground',
            isDeck ? 'no slots yet' : 'none',
            groupColX,
            y,
            makeEditClick('foreground'),
            {
              onContextMenu: makeAddRegionOpener({
                knownKeys: defaultLayoutDef
                  ? Object.keys(defaultLayoutDef.regions)
                  : [],
                existingKeys: [],
                layoutName: defaultLayout,
              }),
              onGenerate: makeGenerateClick('foreground'),
            }
          )
          await wire(fgNode, 'value', frame, 'foreground')
          const ln = await addLeaf(
            {
              label: 'Foreground',
              tag: '—',
              body: '(no foreground)',
              variant: 'muted',
            },
            regionColX,
            y
          )
          await wire(ln, 'value', fgNode, 'in')
        }
      }

      async function unmountInputs(): Promise<void> {
        if (leftNodeIds.size === 0) return
        // Connections must go before their endpoints. This also clears the
        // group → frame.<input> edges (frame survives; only its incoming
        // connections are removed).
        for (const conn of [...editor.getConnections()]) {
          if (leftNodeIds.has(conn.source) || leftNodeIds.has(conn.target)) {
            await editor.removeConnection(conn.id)
          }
        }
        for (const id of leftNodeIds) await editor.removeNode(id)
        leftNodeIds = new Set<string>()
      }

      await mountInputs(initialView)

      /* Group header column (always present, 4 headers) */
      const headerNodes: Record<OutputGroupId, GroupHeaderNode> = {} as Record<
        OutputGroupId,
        GroupHeaderNode
      >
      const headersTotalH =
        OUTPUT_GROUPS.length * HEADER_H +
        (OUTPUT_GROUPS.length - 1) * HEADER_GAP_Y
      const headersStartY = 0 + FRAME_H / 2 - headersTotalH / 2
      // Map of group → which override "seed" the right-click menu offers.
      // Share/Slides/Report each have one override; Autoplay covers both
      // map and narration but the menu can only pick one — we go with
      // narration as the canonical Autoplay add (map overrides are
      // editable in-place via the map override card or the map slot on
      // the canvas's left side).
      const GROUP_OVERRIDE_KIND: Record<
        OutputGroupId,
        'share' | 'slides' | 'report' | 'map' | 'narration'
      > = {
        share: 'share',
        slides: 'slides',
        report: 'report',
        autoplay: 'narration',
      }
      for (let i = 0; i < OUTPUT_GROUPS.length; i++) {
        const group = OUTPUT_GROUPS[i]
        const childCount = initialView.outputs[group.id].length
        // For tabbed groups the visual count is 1 (the tabbed node);
        // for stacked groups it's the actual number of outputs.
        const displayedCount = group.tabbed ? 1 : childCount
        const expanded = stateRef.current.expandedGroup === group.id
        const node = new GroupHeaderNode(
          group.id,
          group.label,
          expanded,
          displayedCount
        )
        // Right-click on the header opens the +Add menu's override-seed
        // picker for this group's primary override kind. Idempotent
        // server-side: if the override already exists for this section,
        // the seed helper leaves it alone so the user can still right-
        // click to re-open the editor on a missing field.
        node.headerCtrl.onContextMenu = makeAddOverrideOpener({
          label: `${group.label} · this section`,
          overrideKind: GROUP_OVERRIDE_KIND[group.id],
        })
        headerNodes[group.id] = node
        await editor.addNode(node)
        await area.translate(node.id, {
          x: headerColX,
          y: headersStartY + i * (HEADER_H + HEADER_GAP_Y),
        })
      }

      /* ── Mutable per-group expanded content ─────────────────── */

      // Holds the currently-rendered override + output nodes for the
      // expanded group. Mutated by applyExpandedGroup; consulted by
      // applySection so it can update the iframe srcs in place.
      interface ExpandedSlot {
        // Override nodes by socket name; e.g. autoplay has 'map' + 'narration'.
        overrides: Map<string, DataNode>
        // Output nodes: stacked (one per output) for non-tabbed groups;
        // a single tabbed node for share. Key = output id; share's
        // single-node key is the first share output id.
        outputs: Map<string, OutputNode>
      }
      let expandedSlot: { group: OutputGroupId; nodes: ExpandedSlot } | null = null

      /**
       * Build the override + output nodes for one group, hook up their
       * connections, and place them in columns 4 + 5 aligned with the
       * group's header Y. Mutates `expandedSlot` so subsequent calls can
       * tear them down. Tabbed groups (Share) produce ONE OutputNode
       * with internal aspect tabs.
       */
      async function mountGroup(groupId: OutputGroupId): Promise<void> {
        const view = sectionViewsRef.current[stateRef.current.activeSectionIndex]
        if (!view) return
        const group = OUTPUT_GROUPS.find((g) => g.id === groupId)!
        const groupOutputs = view.outputs[groupId]
        if (groupOutputs.length === 0) return

        const overrideSpecs = view.overrides[groupId]
        const overrideMap = new Map<string, DataNode>()
        const outputMap = new Map<string, OutputNode>()

        // Y baseline: align with the group's header. Override + output
        // columns extend down from that anchor.
        const baseY =
          headersStartY +
          OUTPUT_GROUPS.findIndex((g) => g.id === groupId) *
            (HEADER_H + HEADER_GAP_Y)

        /* Overrides column */
        let overrideY = baseY
        for (const spec of overrideSpecs) {
          const node = new DataNode(
            spec.data.label,
            spec.data.tag,
            spec.data.body,
            spec.data.variant
          )
          // Wire click-to-edit. The handler reads the LATEST active
          // section's unit (not the build-time one) so paginating then
          // clicking opens the editor for the right section.
          const editKind = spec.editKind
          node.previewCtrl.onClick = () => {
            const idx = stateRef.current.activeSectionIndex
            const targetUnit = sectionUnitsRef.current[idx]
            if (!targetUnit) return
            setEditorTargetRef.current({
              kind: editKind,
              unit: targetUnit,
            })
          }
          node.previewCtrl.onGenerate = makeGenerateClick(editKind)
          overrideMap.set(spec.socket, node)
          await editor.addNode(node)
          await area.translate(node.id, {
            x: overrideColX,
            y: overrideY,
          })
          overrideY += INPUT_H + OVERRIDE_GAP_Y
        }

        /* Outputs column */
        let outY = baseY
        if (group.tabbed) {
          // "Tabbed" groups (just Share for now) collapse to a SINGLE
          // iframe — the underlying page has its own aspect toggle, so
          // a Rete-side tab strip would just duplicate it. We mount the
          // default first variant (Share 3:4) and let the user switch
          // ratios from inside the iframe (interactive: true wires up
          // pointer events for the in-page AspectRatioToggle + Download).
          const first = groupOutputs[0]
          const ctrl = new IframeControl(first.src, first.w, first.h, {
            interactive: true,
          })
          const node = new OutputNode(
            group.label,
            ctrl,
            OVERRIDE_SOCKETS_BY_GROUP[groupId]
          )
          outputMap.set(first.id, node)
          await editor.addNode(node)
          await area.translate(node.id, { x: outputColX, y: outY })
          // Frame → output
          await editor.addConnection(
            new ClassicPreset.Connection(
              frame,
              'render',
              node,
              'render'
            ) as Schemes['Connection']
          )
          // Overrides → output (share has one, but the loop generalises
          // if other groups ever collapse to a single iframe).
          for (const spec of overrideSpecs) {
            const overrideNode = overrideMap.get(spec.socket)!
            await editor.addConnection(
              new ClassicPreset.Connection(
                overrideNode,
                'value',
                node,
                spec.socket
              ) as Schemes['Connection']
            )
          }
        } else {
          // Stacked: one OutputNode per output, all connected from the
          // same overrides and the same frame render socket. interactive
          // for the same reason as tabbed — Autoplay's Tune/Download,
          // Slides/Report's in-page controls all live inside.
          for (const o of groupOutputs) {
            const ctrl = new IframeControl(o.src, o.w, o.h, {
              interactive: true,
            })
            const node = new OutputNode(
              o.label,
              ctrl,
              OVERRIDE_SOCKETS_BY_GROUP[groupId]
            )
            outputMap.set(o.id, node)
            await editor.addNode(node)
            await area.translate(node.id, { x: outputColX, y: outY })
            await editor.addConnection(
              new ClassicPreset.Connection(
                frame,
                'render',
                node,
                'render'
              ) as Schemes['Connection']
            )
            for (const spec of overrideSpecs) {
              const overrideNode = overrideMap.get(spec.socket)!
              await editor.addConnection(
                new ClassicPreset.Connection(
                  overrideNode,
                  'value',
                  node,
                  spec.socket
                ) as Schemes['Connection']
              )
            }
            outY += o.h + OUTPUT_GAP_Y
          }
        }

        expandedSlot = {
          group: groupId,
          nodes: { overrides: overrideMap, outputs: outputMap },
        }
      }

      async function unmountGroup(): Promise<void> {
        if (!expandedSlot) return
        // Remove connections involving any of these nodes first — Rete
        // requires connections to be cleared before their endpoints.
        const slotNodeIds = new Set<string>()
        for (const n of expandedSlot.nodes.overrides.values())
          slotNodeIds.add(n.id)
        for (const n of expandedSlot.nodes.outputs.values())
          slotNodeIds.add(n.id)
        for (const conn of [...editor.getConnections()]) {
          if (slotNodeIds.has(conn.source) || slotNodeIds.has(conn.target)) {
            await editor.removeConnection(conn.id)
          }
        }
        for (const id of slotNodeIds) {
          await editor.removeNode(id)
        }
        expandedSlot = null
      }

      /* ── Apply* methods exposed to the React effects ─────────── */

      async function applyExpandedGroup(
        next: OutputGroupId | null
      ): Promise<void> {
        const currentlyExpanded = expandedSlot?.group ?? null
        if (currentlyExpanded === next) return

        await unmountGroup()
        if (next) await mountGroup(next)

        // Refresh header labels so their "loaded / click" subtext + caret
        // reflect the new state.
        for (const group of OUTPUT_GROUPS) {
          const node = headerNodes[group.id]
          node.headerCtrl.expanded = next === group.id
          await area.update('control', node.headerCtrl.id)
        }
      }

      async function applySection(idx: number): Promise<void> {
        const view = sectionViewsRef.current[idx]
        if (!view) return

        // Frame iframe + pagination overlay
        frameIframeCtrl.src = view.frameSrc
        frameIframeCtrl.pagination = {
          current: idx,
          total: sectionViewsRef.current.length,
          label: view.heading,
        }
        await area.update('control', frameIframeCtrl.id)

        // Left input graph — node count + shape vary per section (different
        // regions / layer stacks), so rebuild rather than patch in place.
        await unmountInputs()
        await mountInputs(view)

        // Expanded group's overrides + output iframes (if any group open)
        if (expandedSlot) {
          const groupId = expandedSlot.group
          const overrideSpecs = view.overrides[groupId]
          for (const spec of overrideSpecs) {
            const node = expandedSlot.nodes.overrides.get(spec.socket)
            if (!node) continue
            node.previewCtrl.label = spec.data.label
            node.previewCtrl.tag = spec.data.tag
            node.previewCtrl.body = spec.data.body
            node.previewCtrl.variant = spec.data.variant
            await area.update('control', node.previewCtrl.id)
          }
          const group = OUTPUT_GROUPS.find((g) => g.id === groupId)!
          const newOutputs = view.outputs[groupId]
          if (group.tabbed) {
            // Single-iframe group (Share). The output node persists; we
            // just point it at the new section's default variant.
            const node = [...expandedSlot.nodes.outputs.values()][0]
            if (node) {
              const ctrl = node.controls.iframe as IframeControl
              const first = newOutputs[0]
              ctrl.src = first.src
              ctrl.width = first.w
              ctrl.height = first.h
              await area.update('control', ctrl.id)
            }
          } else {
            // Stacked — outputs are keyed by output id, but a section
            // switch changes those ids. Easiest correct path: tear down
            // and rebuild this group with the new section's data.
            await unmountGroup()
            await mountGroup(groupId)
          }
        }
      }

      // Bootstrap: mount the initial expanded group (if any).
      if (stateRef.current.expandedGroup) {
        await mountGroup(stateRef.current.expandedGroup)
      }

      await AreaExtensions.zoomAt(area, editor.getNodes())

      sceneRef.current = {
        applySection,
        applyExpandedGroup,
        destroy: () => area.destroy(),
      }
    })().catch((err) => {
      console.error('[CanvasClient] setup failed', err)
    })

    return () => {
      disposed = true
      sceneRef.current?.destroy()
      sceneRef.current = null
    }
    // Rebuild only when the structural inputs change (different story
    // slug, different unit list, or fresh signed-URL set). Source edits
    // + nonce bumps don't trigger a rebuild — they flow through the
    // `sources changed` effect below.
  }, [slug, sectionUnits, signedSrcById])

  /* ─── Apply state changes (without rebuilding the editor) ───── */
  useEffect(() => {
    void sceneRef.current?.applySection(activeSectionIndex)
    // A section switch with the editor open would show a stale slice
    // (the captured unit is the old section's). Close it; user can
    // re-open on the new section. Same rule for the slot editors —
    // their captured unit/path also belong to the previous section.
    setEditorTarget(null)
    setSlotTarget((cur) => (cur?.mode === 'theme' ? cur : null))
  }, [activeSectionIndex])

  useEffect(() => {
    void sceneRef.current?.applyExpandedGroup(expandedGroup)
  }, [expandedGroup])

  // After a save: sources change → parsedSources change → sectionViews
  // recompute (now with bumped nonce in URLs). Re-applySection pushes
  // the new srcs + preview text into the existing nodes, prompting the
  // iframes to reload against the fresh data.
  const sourcesInitialMountRef = useRef(true)
  useEffect(() => {
    if (sourcesInitialMountRef.current) {
      sourcesInitialMountRef.current = false
      return
    }
    void sceneRef.current?.applySection(activeSectionIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedSources, dataNonce])

  /* ─── Save handler for the editor panel ────────────────────── */
  const handleSave = useCallback(
    async (editedText: string) => {
      if (!editorTarget) return
      setSaving(true)
      setSaveError(null)
      try {
        const merge = mergeSlice(
          editorTarget.kind,
          editorTarget.unit,
          sources,
          editedText,
          editorTarget.regionKey,
          editorTarget.slotPath
        )
        await saveSlice(slug, merge)
        // Apply locally so the canvas updates without a refetch round
        // trip; bump the iframe cache-bust so embedded routes re-render
        // against the freshly written file.
        setSources((prev) => ({ ...prev, ...merge.patch }))
        setDataNonce((n) => n + 1)
        setEditorTarget(null)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    },
    [editorTarget, sources, slug]
  )

  // ✨ Generate a section from the brief for REVIEW — produces a preview the
  // author confirms before anything is written. Nothing touches the story here.
  // When `refine` is passed, the current draft + the author's note are sent so
  // the model revises that draft instead of starting fresh.
  const handleGenerateSection = useCallback(
    async (refine?: { feedback: string; previous: typeof genResult }) => {
      const brief = genBrief.trim()
      if (!brief || genBusy) return
      setGenBusy(true)
      setGenError(null)
      try {
        const res = await fetch(
          `/api/stories/${encodeURIComponent(slug)}/canvas/generate-section`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brief,
              format,
              feedback: refine?.feedback,
              previous: refine?.previous ?? undefined,
            }),
          }
        )
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          generation?: { id?: string | null }
          section?: {
            heading: string
            paragraphs: string[]
            kind: string
            body: Record<string, unknown>
          }
          error?: string
        }
        if (!res.ok || !body.ok || !body.section) {
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        setGenResult(body.section)
        setGenId(body.generation?.id ?? null)
        if (refine) setGenRefine('')
      } catch (e) {
        setGenError(e instanceof Error ? e.message : 'Section generation failed.')
      } finally {
        setGenBusy(false)
      }
    },
    [genBrief, genBusy, slug, format]
  )

  // Apply the approved preview: append to the story (markdown + config via
  // appendStorySection), save both, bump the nonce, and jump to the new section.
  const handleApplySection = useCallback(async () => {
    if (!genResult || genBusy) return
    setGenBusy(true)
    setGenError(null)
    try {
      const next = appendStorySection(
        markdownRef.current ?? '',
        configYamlRef.current ?? '',
        {
          heading: genResult.heading,
          paragraphs: genResult.paragraphs,
          kind: genResult.kind,
          body: genResult.body,
        }
      )
      // The appended section lands at the end → its index is the old count.
      const newIndex = sectionViewsRef.current.length
      await saveMarkdown(slug, next.markdown)
      await saveConfigYaml(slug, next.configYaml)
      setSources((prev) => ({
        ...prev,
        markdown: next.markdown,
        configYaml: next.configYaml,
      }))
      setDataNonce((n) => n + 1)
      setActiveSectionIndex(newIndex)
      setGenSectionOpen(false)
      setGenBrief('')
      setGenResult(null)
      setGenId(null)
      setGenRefine('')
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Could not apply section.')
    } finally {
      setGenBusy(false)
    }
  }, [genResult, genBusy, slug])

  /* ─── Slot-edit save handlers (map / image / theme) ─────────── */
  // After a successful slot save we:
  //  1) splice the new layer / theme into the in-memory YAML/markdown
  //     and patch sources locally — `liveUnit` + the `parsedSources`
  //     effect propagate the change to every leaf preview without a
  //     server round-trip,
  //  2) bump dataNonce so already-mounted iframes reload against the
  //     freshly-written file.
  // No router.refresh() — the local update is the source of truth until
  // the next full page load, and the rebuild it would force loses the
  // user's zoom/pan.
  const handleMapSlotApply = useCallback(
    async (nextWrappedRaw: string, target: SlotTarget & { mode: 'map' }) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        // Unwrap the picker's `map:` block back into either a bg-layer object
        // (modern; needs `type: 'map'` re-stamped) or a raw section.map
        // object (legacy; no `type` key).
        const section = getSection(
          configYamlRef.current,
          target.unit.parentIndex
        )
        const originalLayer = section
          ? getLayer(section, target.slotPath) ?? {}
          : {}
        const core = unwrapLayerFromMapPicker(nextWrappedRaw, originalLayer)
        const nextLayer =
          target.slotPath.kind === 'legacyMap'
            ? core
            : { type: 'map', ...core }
        const nextConfigYaml = replaceLayer(
          configYamlRef.current,
          target.unit.parentIndex,
          target.slotPath,
          nextLayer
        )
        await saveConfigYaml(slug, nextConfigYaml)
        setSources((prev) => ({ ...prev, configYaml: nextConfigYaml }))
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  // Map-override apply: the visual picker hands back a `{map: {...}}`-shaped
  // YAML chunk (the same shape its extract/apply helpers operate on). We
  // route it through `mergeSlice` for the editor kind that owns the file
  // (map.yaml for autoplay overrides, share.yaml for per-section share
  // maps), so the modal write goes to the exact same place the panel's
  // YAML save would.
  const handleMapOverrideApply = useCallback(
    async (
      nextWrappedRaw: string,
      target: SlotTarget & { mode: 'mapOverride' }
    ) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        const overrideKind = target.overrideKind
        const editedText = nextOverrideTextFromPickerYaml(
          overrideKind,
          target.unit,
          sourcesRef.current,
          nextWrappedRaw
        )
        const merge = mergeSlice(
          overrideKind,
          target.unit,
          sourcesRef.current,
          editedText
        )
        await saveSlice(slug, merge)
        setSources((prev) => ({ ...prev, ...merge.patch }))
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  const handleImageSlotApply = useCallback(
    async (
      next: ImageLayerDraft,
      target: SlotTarget & { mode: 'image' }
    ) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        // Merge with the on-disk layer so any keys the modal doesn't expose
        // (custom style overrides, future fields) survive the round-trip.
        const section = getSection(
          configYamlRef.current,
          target.unit.parentIndex
        )
        const originalLayer = section
          ? getLayer(section, target.slotPath) ?? {}
          : {}
        const nextLayer: Record<string, unknown> = {
          ...originalLayer,
          type: 'image',
          src: next.src,
        }
        // Optional fields — set when the modal returned a value, delete
        // otherwise so leaving a field blank clears the YAML key.
        if (next.alt != null) nextLayer.alt = next.alt
        else delete nextLayer.alt
        if (next.fit != null) nextLayer.fit = next.fit
        else delete nextLayer.fit
        if (next.focus != null) nextLayer.focus = next.focus
        else delete nextLayer.focus
        if (next.background != null) nextLayer.background = next.background
        else delete nextLayer.background
        const nextConfigYaml = replaceLayer(
          configYamlRef.current,
          target.unit.parentIndex,
          target.slotPath,
          nextLayer
        )
        await saveConfigYaml(slug, nextConfigYaml)
        setSources((prev) => ({ ...prev, configYaml: nextConfigYaml }))
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  // Persist a chart's DATA to the chart_data store (its own route — NOT the
  // config-YAML slot save path). The frame iframe fetches chart data at
  // runtime, so a `dataNonce` bump is enough to re-render it.
  const handleChartSave = useCallback(
    async (raw: string, chartId: string) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        const res = await fetch(
          `/api/stories/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ raw }),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          throw new Error(err?.error ?? `Save failed (${res.status})`)
        }
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  const handleSlotFormApply = useCallback(
    async (
      nextConfig: Record<string, unknown>,
      target: SlotTarget & { mode: 'form' }
    ) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        const section = getSection(
          configYamlRef.current,
          target.unit.parentIndex
        )
        const originalLayer = section
          ? (getLayer(section, target.slotPath) ?? {})
          : {}
        // Drop the keys this module's form manages from the on-disk layer,
        // then overlay the form result. This honors fields the user cleared
        // (absent from nextConfig) while preserving untracked keys (style,
        // region, and any field the form doesn't expose). Dotted adminForm
        // keys (e.g. `textStyle.size`) collapse to their top-level container
        // (`textStyle`) so the whole nested object is form-managed.
        const mod = getVizModule(target.layerType)
        const managed = new Set(
          (mod?.adminForm?.(originalLayer as never) ?? []).map(
            (f) => f.key.split('.')[0]
          )
        )
        // The inspector also owns the slot's `style` (position/size/panel),
        // so treat it as managed — dropped from `preserved` and re-applied
        // from the patch, which lets clearing it remove the key.
        managed.add('style')
        const preserved: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(originalLayer)) {
          if (k === 'type' || managed.has(k)) continue
          preserved[k] = v
        }
        const nextLayer: Record<string, unknown> = {
          ...preserved,
          ...nextConfig,
          type: target.layerType,
        }
        const nextConfigYaml = replaceLayer(
          configYamlRef.current,
          target.unit.parentIndex,
          target.slotPath,
          nextLayer
        )
        await saveConfigYaml(slug, nextConfigYaml)
        setSources((prev) => ({ ...prev, configYaml: nextConfigYaml }))
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  // Escape hatch from the form modal into the existing layer-YAML editor for
  // the same slot. Closes the form first so the two surfaces never co-mount,
  // then reuses the EditorPanel save path verbatim.
  const openSlotAsYaml = useCallback(
    (target: SlotTarget & { mode: 'form' }) => {
      setSlotTarget(null)
      setSlotError(null)
      setEditorTarget({
        kind: 'layer',
        unit: target.unit,
        slotPath: target.slotPath,
      })
    },
    []
  )

  const handleThemeSave = useCallback(
    async (nextTheme: Theme) => {
      setSlotSaving(true)
      setSlotError(null)
      try {
        // markdownRef.current can be null when the story page falls back
        // to an empty buffer — replaceTheme handles '' by creating fresh
        // frontmatter, so we coerce here rather than refusing the save.
        const nextMarkdown = replaceTheme(
          markdownRef.current ?? '',
          nextTheme
        )
        await saveMarkdown(slug, nextMarkdown)
        setSources((prev) => ({ ...prev, markdown: nextMarkdown }))
        // Theme prop isn't in sources — bump local override so the theme
        // leaf and any frame-input theme reads see the new value too.
        setLocalTheme(nextTheme)
        setDataNonce((n) => n + 1)
        setSlotTarget(null)
      } catch (e) {
        setSlotError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSlotSaving(false)
      }
    },
    [slug]
  )

  const closeSlot = useCallback(() => {
    setSlotTarget(null)
    setSlotError(null)
  }, [])

  // Story-wide `defaults.mapStyle` write, called from the map picker's URL
  // input. Bumps dataNonce so the iframes pick up the new style URL on the
  // next render. Throws on save failure so the modal can surface the error
  // inline next to the input.
  const handleMapStyleChange = useCallback(
    async (nextStyle: string) => {
      const nextConfigYaml = writeDefaultsMapStyle(
        configYamlRef.current,
        nextStyle
      )
      await saveConfigYaml(slug, nextConfigYaml)
      setSources((prev) => ({ ...prev, configYaml: nextConfigYaml }))
      setDataNonce((n) => n + 1)
    },
    [slug]
  )

  /* ─── +Add menu dispatcher ────────────────────────────────────── */
  // When the user picks something in the floating menu, route to the right
  // canvasSlotAdd helper, persist via the matching save endpoint, patch
  // `sources` locally so the canvas re-renders, then open the editor on
  // the newly-created item so the user can fill it in. Errors bubble to
  // a toast — we don't keep the menu open after a save failure since the
  // local state and disk state would have diverged either way.
  const handleAddMenuPick = useCallback(
    async (choice: AddMenuChoice) => {
      const cur = addMenu
      if (!cur) return
      const targetUnit =
        sectionUnitsRef.current[cur.sourceSectionIndex] ??
        sectionUnitsRef.current[stateRef.current.activeSectionIndex]
      if (!targetUnit) return

      try {
        const currentConfig = configYamlRef.current
        const currentSources = sourcesRef.current

        if (choice.kind === 'layer' && cur.context.kind === 'layer') {
          // Build the seed body for this type. For map/image we'll open
          // the visual editor next; for others, the YAML EditorPanel.
          const seed = seedLayerForType(choice.type)
          let next: { yaml: string; path: SlotPath }
          switch (cur.context.dispatch.kind) {
            case 'background-append':
              next = appendBackgroundLayer(
                currentConfig,
                targetUnit.parentIndex,
                seed
              )
              break
            case 'background-create':
              next = createBackgroundWithLayer(
                currentConfig,
                targetUnit.parentIndex,
                seed
              )
              break
            case 'foreground-flat-append':
              next = appendForegroundFlatLayer(
                currentConfig,
                targetUnit.parentIndex,
                seed
              )
              break
            case 'foreground-region-append':
              next = appendForegroundRegionLayer(
                currentConfig,
                targetUnit.parentIndex,
                cur.context.dispatch.regionKey,
                seed
              )
              break
          }
          await saveConfigYaml(slug, next.yaml)
          setSources((p) => ({ ...p, configYaml: next.yaml }))
          setDataNonce((n) => n + 1)
          setAddMenu(null)
          // Open the right editor for the new slot. Map gets the visual
          // picker; image gets the image modal; everything else lands in
          // the YAML editor scoped to this layer.
          if (choice.type === 'map') {
            // Panel-first: open the YAML editor; the user clicks "Map-Edit"
            // in the panel header to drop into the visual picker. Matches
            // the click-existing-map-leaf flow above.
            setEditorTarget({
              kind: 'layer',
              unit: targetUnit,
              slotPath: next.path,
            })
          } else if (choice.type === 'image') {
            setSlotTarget({
              mode: 'image',
              unit: targetUnit,
              slotPath: next.path,
              initial: {
                src: typeof seed.src === 'string' ? seed.src : '',
                fit: 'cover',
              },
            })
          } else {
            // Any other module with an adminForm opens the generic form
            // editor seeded with the just-written layer; types without one
            // (chart) land in the YAML editor.
            const mod = getVizModule(choice.type)
            if (mod?.adminForm) {
              setSlotTarget({
                mode: 'form',
                unit: targetUnit,
                slotPath: next.path,
                layerType: choice.type,
                initialLayer: seed,
              })
            } else {
              setEditorTarget({
                kind: 'layer',
                unit: targetUnit,
                slotPath: next.path,
              })
            }
          }
          return
        }

        if (choice.kind === 'region' && cur.context.kind === 'region') {
          // Promote `none` foreground to regions with `layoutHint`, or
          // append to an existing regions block. addForegroundRegion is
          // idempotent so a duplicate pick (UI prevents it but belt+braces)
          // is a no-op.
          const nextYaml = addForegroundRegion(
            currentConfig,
            targetUnit.parentIndex,
            choice.key,
            cur.context.layoutHint || undefined
          )
          await saveConfigYaml(slug, nextYaml)
          setSources((p) => ({ ...p, configYaml: nextYaml }))
          setDataNonce((n) => n + 1)
          setAddMenu(null)
          // Don't auto-open the region editor — the region is empty and
          // the natural next action is to add a layer to it (right-click
          // on the now-present region junction). The rebuild after
          // setSources will mount that junction with its +ADD chip.
          return
        }

        if (choice.kind === 'override' && cur.context.kind === 'override') {
          const sectionId =
            targetUnit.parentConfig.id ??
            `section-${targetUnit.parentIndex}`
          let nextRaw: string
          let patch: Partial<CanvasSources>
          let target: 'share' | 'report' | 'map' | 'tts'
          let editKind: EditableKind
          switch (cur.context.overrideKind) {
            case 'share':
              nextRaw = seedShareSection(currentSources.shareYaml, sectionId)
              patch = { shareYaml: nextRaw }
              target = 'share'
              editKind = 'share'
              break
            case 'slides':
              nextRaw = seedReportPage(
                currentSources.reportYaml,
                'slides',
                targetUnit.parentIndex,
                targetUnit.subIndex
              )
              patch = { reportYaml: nextRaw }
              target = 'report'
              editKind = 'slides'
              break
            case 'report':
              nextRaw = seedReportPage(
                currentSources.reportYaml,
                'report',
                targetUnit.parentIndex,
                targetUnit.subIndex
              )
              patch = { reportYaml: nextRaw }
              target = 'report'
              editKind = 'report'
              break
            case 'map':
              nextRaw = seedMapOverride(
                currentSources.mapYaml,
                targetUnit.parentIndex,
                targetUnit.subIndex
              )
              patch = { mapYaml: nextRaw }
              target = 'map'
              editKind = 'map'
              break
            case 'narration':
              nextRaw = seedTtsUnit(
                currentSources.ttsYaml,
                targetUnit.parentIndex,
                targetUnit.subIndex,
                targetUnit.sliceIndex ?? 0
              )
              patch = { ttsYaml: nextRaw }
              target = 'tts'
              editKind = 'narration'
              break
          }
          await saveSlice(slug, { target, patch, newRaw: nextRaw })
          setSources((p) => ({ ...p, ...patch }))
          setDataNonce((n) => n + 1)
          setAddMenu(null)
          // Open the YAML editor on the newly-seeded entry. The slice
          // builder reads from `sources` which we just patched, so the
          // editor lands on the seed body (e.g. `unit: {…}` for report).
          setEditorTarget({ kind: editKind, unit: targetUnit })
          return
        }

        // Type mismatch (choice vs context) — only reachable via a bug,
        // not by user action. Surface to console so we notice in dev.
        console.warn('[CanvasClient] AddMenu pick/context mismatch', {
          choice,
          context: cur.context,
        })
        setAddMenu(null)
      } catch (e) {
        // Hold the menu open on error so the user sees the failure and
        // can retry. Detailed error surface (toast/banner) is TODO; for
        // now the console + the absence of a side effect is the signal.
        console.error('[CanvasClient] +Add failed:', e)
        setAddMenu(null)
      }
    },
    [addMenu, slug]
  )

  /* ─── Keyboard pagination (← / →) ────────────────────────────── */
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') {
        setActiveSectionIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight') {
        setActiveSectionIndex((i) =>
          Math.min(sectionViews.length - 1, i + 1)
        )
      }
    },
    [sectionViews.length]
  )
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0a',
        color: '#ccc',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <header
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(20,20,20,0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #2a2a2a',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        <strong style={{ fontSize: 13 }}>{slug}</strong>
        <span style={{ marginLeft: 12, color: '#888' }}>
          {sectionViews.length} sections · ← / → to paginate
        </span>
        <span style={{ pointerEvents: 'auto', marginLeft: 12 }}>
          <AssistantLauncher />
        </span>
        <button
          onClick={onComposeButton}
          disabled={composeStarting}
          title={
            composeState
              ? 'Research the sources and draft an outline for this story'
              : 'Start researching sources and drafting an outline for this story'
          }
          style={{
            pointerEvents: 'auto',
            marginLeft: 12,
            background: composeState && composeOpen ? '#10303f' : 'transparent',
            color: '#7dd3fc',
            border: `1px solid ${composeState && composeOpen ? '#5aa9d8' : '#2a6d8f'}`,
            borderRadius: 5,
            padding: '3px 9px',
            fontSize: 11,
            cursor: composeStarting ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: composeStarting ? 0.5 : 1,
          }}
        >
          {composeStarting ? 'Starting…' : '✨ Research & outline'}
        </button>
        <button
          onClick={() => {
            setGenError(null)
            setEvalOpen(false)
            setGenSectionOpen((o) => !o)
          }}
          title="Generate a new section from a brief"
          style={{
            pointerEvents: 'auto',
            marginLeft: 12,
            background: 'transparent',
            color: '#c79bd8',
            border: '1px solid #5a2a8f',
            borderRadius: 5,
            padding: '3px 9px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + ✨ Section
        </button>
        {sectionUnits.length > 0 && (
          <button
            onClick={() => {
              setGenSectionOpen(false)
              setEvalOpen((o) => !o)
            }}
            title="Evaluate the current section — render it and get a vision critique"
            style={{
              pointerEvents: 'auto',
              marginLeft: 12,
              background: 'transparent',
              color: '#e8a04f',
              border: '1px solid #8f5a2a',
              borderRadius: 5,
              padding: '3px 9px',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✦ Evaluate
          </button>
        )}
        {format === 'deck' && sectionUnits.length > 0 && (
          <button
            onClick={() =>
              setEditorTarget({ kind: 'defaults', unit: sectionUnits[0] })
            }
            title="Edit story-wide deck defaults — page backdrop, overlay, panel, scroll, chart"
            style={{
              pointerEvents: 'auto',
              marginLeft: 12,
              background: 'transparent',
              color: '#9bb0d8',
              border: '1px solid #2a4d8f',
              borderRadius: 5,
              padding: '3px 9px',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Deck defaults
          </button>
        )}
      </header>
      {composeState && (
        <ComposeFlowPanel
          slug={slug}
          initialState={composeState}
          initialSources={composeSources}
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          frameSrcById={signedSrcById}
        />
      )}
      {evalOpen && sectionUnits[activeSectionIndex] && (
        <EvaluatorPanel
          slug={slug}
          sectionId={
            sectionUnits[activeSectionIndex].parentConfig?.id ??
            `section-${sectionUnits[activeSectionIndex].parentIndex}`
          }
          sectionConfig={safeStringifyYaml(
            sectionUnits[activeSectionIndex].parentConfig,
          )}
          onSendToPrompt={(aspect) => {
            const u = sectionUnits[activeSectionIndex]
            if (u) {
              setEditorTarget({
                kind: aspect as EditableKind,
                unit: u,
                promptOnly: true,
              })
            }
            setEvalOpen(false)
          }}
          onClose={() => setEvalOpen(false)}
        />
      )}
      {genSectionOpen && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 16,
            width: 440,
            maxHeight: 'calc(100vh - 96px)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
            background: '#0c0c0c',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: '1px solid #1f1f1f',
            }}
          >
            <span style={{ fontSize: 12, color: '#ddd' }}>
              {genResult ? '✨ Review section' : '✨ Generate section'}
            </span>
            <button
              type="button"
              onClick={() => {
                setGenSectionOpen(false)
                setGenResult(null)
                setGenId(null)
                setGenRefine('')
                setGenError(null)
              }}
              aria-label="Close"
              style={{
                marginLeft: 'auto',
                color: '#888',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 14 }}>
            {!genResult ? (
              <>
                <textarea
                  value={genBrief}
                  onChange={(e) => setGenBrief(e.target.value)}
                  disabled={genBusy}
                  rows={4}
                  autoFocus
                  placeholder="Describe the section you want… e.g. “a bigStat slide showing FY2025 revenue $18.7B with a +33% YoY delta”"
                  style={{
                    width: '100%',
                    background: '#111',
                    color: '#eee',
                    border: '1px solid #2a2a2a',
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <span style={{ fontSize: 10, color: '#666' }}>
                    {format} story · appended at end
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleGenerateSection()}
                    disabled={genBusy || !genBrief.trim()}
                    style={{
                      marginLeft: 'auto',
                      background: '#fff',
                      color: '#0a0a0a',
                      border: 'none',
                      borderRadius: 5,
                      padding: '5px 12px',
                      fontSize: 12,
                      cursor:
                        genBusy || !genBrief.trim() ? 'default' : 'pointer',
                      opacity: genBusy || !genBrief.trim() ? 0.4 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {genBusy ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#666',
                      letterSpacing: '0.12em',
                      marginBottom: 2,
                    }}
                  >
                    HEADING · {genResult.kind}
                  </div>
                  <div style={{ fontSize: 14, color: '#eee', fontWeight: 600 }}>
                    {genResult.heading}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#666',
                      letterSpacing: '0.12em',
                      marginBottom: 4,
                    }}
                  >
                    BODY
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {genResult.paragraphs.map((p, i) => (
                      <p
                        key={i}
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: '#bbb',
                        }}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>

                {Object.keys(genResult.body).length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: '#666',
                        letterSpacing: '0.12em',
                        marginBottom: 4,
                      }}
                    >
                      VISUAL (YAML)
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        background: '#111',
                        border: '1px solid #1f1f1f',
                        borderRadius: 6,
                        padding: 8,
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: '#9a9a9a',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                      }}
                    >
                      {safeStringifyYaml(genResult.body)}
                    </pre>
                  </div>
                )}

                {/* Refine: revise this draft from a note instead of regenerating
                    from scratch. Sends the current draft + the note to the route. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <textarea
                    value={genRefine}
                    onChange={(e) => setGenRefine(e.target.value)}
                    disabled={genBusy}
                    rows={2}
                    placeholder="Refine this draft… e.g. “tighten the prose”, “make it a quote section”, “fix the delta to +33%”"
                    style={{
                      flex: 1,
                      background: '#111',
                      color: '#eee',
                      border: '1px solid #2a2a2a',
                      borderRadius: 6,
                      padding: 8,
                      fontSize: 11,
                      lineHeight: 1.5,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void handleGenerateSection({
                        feedback: genRefine,
                        previous: genResult,
                      })
                    }
                    disabled={genBusy || !genRefine.trim()}
                    style={{
                      flexShrink: 0,
                      background: '#1a1a1a',
                      color: '#eee',
                      border: '1px solid #333',
                      borderRadius: 5,
                      padding: '6px 12px',
                      fontSize: 12,
                      cursor: genBusy || !genRefine.trim() ? 'default' : 'pointer',
                      opacity: genBusy || !genRefine.trim() ? 0.4 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {genBusy ? 'Refining…' : 'Refine'}
                  </button>
                </div>

                <GenerationFeedback slug={slug} generationId={genId} />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color: '#666' }}>
                    appended at end · not saved yet
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGenResult(null)
                      setGenId(null)
                      setGenRefine('')
                      setGenError(null)
                    }}
                    disabled={genBusy}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      color: '#9bb0d8',
                      border: '1px solid #2a4d8f',
                      borderRadius: 5,
                      padding: '5px 10px',
                      fontSize: 12,
                      cursor: genBusy ? 'default' : 'pointer',
                      opacity: genBusy ? 0.4 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={handleApplySection}
                    disabled={genBusy}
                    style={{
                      background: '#fff',
                      color: '#0a0a0a',
                      border: 'none',
                      borderRadius: 5,
                      padding: '5px 12px',
                      fontSize: 12,
                      cursor: genBusy ? 'default' : 'pointer',
                      opacity: genBusy ? 0.4 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {genBusy ? 'Applying…' : 'Apply section'}
                  </button>
                </div>
              </div>
            )}

            {genError && (
              <div style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>
                {genError}
              </div>
            )}
          </div>
        </div>
      )}
      {editorSlice && !editorTarget?.promptOnly && !editorTarget?.fix && (
        <EditorPanel
          slice={editorSlice}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onClose={() => {
            setEditorTarget(null)
            setSaveError(null)
          }}
          onMapEdit={editorMapEdit}
          slug={slug}
          // Every EditorPanel-backed slot gets the AI prompt input. The slot's
          // EditableKind is a subset of AiSlotKind, so it maps 1:1; aiSlots.ts
          // supplies the modality, model subset, and default system prompt.
          aiKind={editorTarget?.kind}
        />
      )}
      {/* On-node ✨ Generate (Feature 1): a standalone PromptBar for the slot,
          no full editor. onApply persists straight through handleSave (the same
          merge→save path) and closes. layerType is omitted so the bar recovers
          a layer's type from its current YAML. */}
      {editorSlice && editorTarget?.promptOnly && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            background: '#0c0c0c',
            borderLeft: '1px solid #262626',
            zIndex: 50,
            padding: 14,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: '#ddd' }}>
              ✨ Generate · {editorSlice.title}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditorTarget(null)
                setSaveError(null)
              }}
              style={{
                marginLeft: 'auto',
                color: '#888',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <PromptBar
            slug={slug}
            kind={editorTarget.kind}
            currentValue={editorSlice.text}
            onApply={(v) => handleSave(v)}
            onClose={() => {
              setEditorTarget(null)
              setSaveError(null)
            }}
          />
          {saveError && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>
              {saveError}
            </div>
          )}
        </div>
      )}
      {/* ✨ Fix with AI: schema-mismatch repair for the foreground. Auto-runs
          the canvas/fix route, previews the corrected YAML, and Apply persists
          through the same handleSave (merge→save) path a manual edit uses. */}
      {editorSlice && editorTarget?.fix && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            background: '#0c0c0c',
            borderLeft: '1px solid #262626',
            zIndex: 50,
            padding: 14,
            overflowY: 'auto',
          }}
        >
          <FixPanel
            slug={slug}
            kind={editorTarget.kind}
            currentValue={editorSlice.text}
            problems={editorTarget.fix.problems}
            onApply={(v) => handleSave(v)}
            onClose={() => {
              setEditorTarget(null)
              setSaveError(null)
            }}
          />
          {saveError && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>
              {saveError}
            </div>
          )}
        </div>
      )}
      {/* Slot-edit surfaces — mutually exclusive by construction (slotTarget
          is a single discriminated union). Map + image take over with their
          own portal modals; theme slides in from the right like EditorPanel
          so the canvas behind it stays visible. */}
      {slotTarget?.mode === 'map' && (
        <MapPickerSlotMount
          target={slotTarget}
          configYaml={sources.configYaml}
          sectionUnits={sectionUnits}
          mapStyle={readDefaultsMapStyle(sources.configYaml) ?? undefined}
          onMapStyleChange={handleMapStyleChange}
          onApply={(raw) => handleMapSlotApply(raw, slotTarget)}
          onClose={closeSlot}
        />
      )}
      {slotTarget?.mode === 'mapOverride' && (
        <MapOverridePickerMount
          target={slotTarget}
          sources={sources}
          sectionUnits={sectionUnits}
          mapStyle={readDefaultsMapStyle(sources.configYaml) ?? undefined}
          onMapStyleChange={handleMapStyleChange}
          onApply={(raw) => handleMapOverrideApply(raw, slotTarget)}
          onClose={closeSlot}
        />
      )}
      {slotTarget?.mode === 'image' && (
        <ImageEditModal
          slug={slug}
          sectionLabel={imageSlotLabel(slotTarget, sectionUnits)}
          initial={slotTarget.initial}
          onApply={(next) => handleImageSlotApply(next, slotTarget)}
          onClose={closeSlot}
        />
      )}
      {slotTarget?.mode === 'form' && (
        <SlotInspector
          key={`${slotTarget.unit.parentIndex}:${JSON.stringify(slotTarget.slotPath)}`}
          slug={slug}
          sectionLabel={formSlotLabel(slotTarget, sectionUnits)}
          layerType={slotTarget.layerType}
          initialLayer={slotTarget.initialLayer}
          theme={localTheme ?? theme}
          defaults={deckDefaults}
          unitKey={`${slotTarget.unit.parentIndex}.${slotTarget.unit.subIndex ?? 0}`}
          saving={slotSaving}
          error={slotError}
          onApply={(next) => handleSlotFormApply(next, slotTarget)}
          onEditAsYaml={() => openSlotAsYaml(slotTarget)}
          onClose={closeSlot}
        />
      )}
      {slotTarget?.mode === 'theme' && (
        <ThemeEditOverlay
          initial={localTheme}
          saving={slotSaving}
          error={slotError}
          onSave={handleThemeSave}
          onClose={closeSlot}
          slug={slug}
        />
      )}
      {slotTarget?.mode === 'chart' && (
        <ChartEditPanel
          key={slotTarget.chartId}
          slug={slug}
          chartId={slotTarget.chartId}
          saving={slotSaving}
          error={slotError}
          onSave={(raw) => handleChartSave(raw, slotTarget.chartId)}
          onClose={closeSlot}
        />
      )}
      {/* Floating +Add context menu. Anchored at the right-click cursor
          via React portal so it isn't clipped by the rete canvas's
          transformed area. */}
      {addMenu && (
        <AddMenu
          position={addMenu.position}
          target={addMenu.target}
          onPick={handleAddMenuPick}
          onClose={() => setAddMenu(null)}
        />
      )}
    </div>
  )
}

/* ─── Map slot mount helper ────────────────────────────────────────
 * MapPickerModal wants whole-section YAML for the legacy path and a
 * wrapped `{map: layer}` snippet for the modern path. Doing that derivation
 * inline in the JSX bloats the render; this thin wrapper isolates it. */
function MapPickerSlotMount({
  target,
  configYaml,
  sectionUnits,
  mapStyle,
  onMapStyleChange,
  onApply,
  onClose,
}: {
  target: SlotTarget & { mode: 'map' }
  configYaml: string | null
  sectionUnits: ResolvedUnit[]
  mapStyle?: string
  onMapStyleChange?: (next: string) => Promise<void> | void
  onApply: (nextRaw: string) => void
  onClose: () => void
}) {
  // configYaml is null when the story has no config.yaml on disk; the picker
  // still mounts with an empty wrapped layer (`map: {}`), so the user can
  // pick a starting camera and the apply path will create the section's map
  // block from scratch.
  const section = configYaml
    ? getSection(configYaml, target.unit.parentIndex)
    : null
  const layer = section ? getLayer(section, target.slotPath) : null
  // Always pass wrapped YAML — the picker's helpers look for `map.<key>` at
  // the top level, which is exactly what `wrapLayerForMapPicker` produces
  // for both legacy `section.map` values and modern bg-layer fields.
  const sectionRaw = wrapLayerForMapPicker(layer ?? {})
  const unitIdx = sectionUnits.findIndex(
    (u) => u.parentIndex === target.unit.parentIndex
  )
  const sectionLabel =
    target.unit.heading ||
    target.unit.parentConfig.id ||
    `Section ${unitIdx + 1}`
  return (
    <MapPickerModal
      sectionRaw={sectionRaw}
      sectionLabel={sectionLabel}
      style={mapStyle}
      onMapStyleChange={onMapStyleChange}
      onApply={onApply}
      onClose={onClose}
      // Canvas is desktop-only; the mobile target would patch a separate
      // `mobile:` sub-block, which isn't where the canvas's bg layer lives.
      hideMobileTarget
    />
  )
}

/* ─── Map override mount helper ────────────────────────────────────
 * Routes the visual MapPickerModal into the per-section override files
 * (map.yaml for autoplay, share.yaml for share cards). The picker reads
 * camera fields from a YAML where `map:` sits at the top level — that's
 * already true for map.yaml entries (which have `target: { ... }; map: { ... }`)
 * but needs wrapping for share.yaml's `sections[<id>].map` slice. The mount
 * does the wrap/unwrap and labels the modal so the user reads at a glance
 * which file they're editing.
 */
function MapOverridePickerMount({
  target,
  sources,
  sectionUnits,
  mapStyle,
  onMapStyleChange,
  onApply,
  onClose,
}: {
  target: SlotTarget & { mode: 'mapOverride' }
  sources: CanvasSources
  sectionUnits: ResolvedUnit[]
  mapStyle?: string
  onMapStyleChange?: (next: string) => Promise<void> | void
  onApply: (nextRaw: string) => void
  onClose: () => void
}) {
  const sliceText = buildEditableSlice(
    target.overrideKind,
    target.unit,
    sources
  ).text
  // share.yaml's map slice has no enclosing `map:` key — wrap so the picker's
  // top-level `map.<key>` lookup resolves. map.yaml entries already have the
  // key as part of the override entry, so pass them straight through.
  const sectionRaw =
    target.overrideKind === 'shareMap'
      ? wrapShareMapForPicker(sliceText)
      : sliceText
  const unitIdx = sectionUnits.findIndex(
    (u) => u.parentIndex === target.unit.parentIndex
  )
  const base =
    target.unit.heading ||
    target.unit.parentConfig.id ||
    `Section ${unitIdx + 1}`
  const fileLabel = target.overrideKind === 'shareMap' ? 'share.yaml' : 'map.yaml'
  const sectionLabel = `${base} · ${fileLabel}`
  return (
    <MapPickerModal
      sectionRaw={sectionRaw}
      sectionLabel={sectionLabel}
      style={mapStyle}
      onMapStyleChange={onMapStyleChange}
      onApply={onApply}
      onClose={onClose}
      hideMobileTarget
    />
  )
}

/** Wrap a share.yaml map-slice (which has fields at the top level — no
 *  enclosing `map:` key) so MapPickerModal's `extractMapView` / `applyMapView`
 *  can find the camera under `map.<key>`. Empty slice produces a bare
 *  `map:` line that the modal can still patch into via `ensureMapBlock`. */
function wrapShareMapForPicker(sliceText: string): string {
  const trimmed = sliceText.trim()
  if (!trimmed) return 'map:\n'
  let parsed: unknown
  try {
    parsed = parseYaml(sliceText)
  } catch {
    return 'map:\n'
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'map:\n'
  }
  return yamlStringify({ map: parsed }, { lineWidth: 0 })
}

/** Inverse of {@link wrapShareMapForPicker} for share.yaml; pass-through for
 *  map.yaml. Returns the editor-text shape that `mergeSlice` expects for the
 *  given override kind. */
function nextOverrideTextFromPickerYaml(
  kind: 'map' | 'shareMap',
  unit: ResolvedUnit,
  _sources: CanvasSources,
  pickerYaml: string
): string {
  void unit
  if (kind === 'map') {
    // The map.yaml entry editor expects the full entry text (`target: ...;
    // map: ...`). The picker started from that shape and patched the camera
    // in place, so the wrapped output already matches the editor's input
    // contract.
    return pickerYaml
  }
  // shareMap: unwrap the picker's `map:` envelope and return the inner block
  // so the share.yaml splicer writes the camera + any preserved sibling keys
  // (ratios, pins…) back under `sections[<id>].map`.
  let parsed: { map?: unknown } | null = null
  try {
    parsed = parseYaml(pickerYaml) as { map?: unknown } | null
  } catch {
    return ''
  }
  const inner = parsed?.map
  if (inner == null || typeof inner !== 'object') return ''
  return yamlStringify(inner, { lineWidth: 0 })
}

function imageSlotLabel(
  target: SlotTarget & { mode: 'image' },
  sectionUnits: ResolvedUnit[]
): string {
  const idx = sectionUnits.findIndex(
    (u) => u.parentIndex === target.unit.parentIndex
  )
  const base =
    target.unit.heading ||
    target.unit.parentConfig.id ||
    `Section ${idx + 1}`
  const path = target.slotPath
  const where =
    path.kind === 'background'
      ? `background[${path.index}]`
      : path.kind === 'foregroundFlat'
        ? `foreground[${path.index}]`
        : path.kind === 'foregroundRegion'
          ? `foreground.${path.region}[${path.index}]`
          : 'map'
  return `${base} · ${where}`
}

/** Same as `imageSlotLabel` for the generic form-edit modal. */
function formSlotLabel(
  target: SlotTarget & { mode: 'form' },
  sectionUnits: ResolvedUnit[]
): string {
  const idx = sectionUnits.findIndex(
    (u) => u.parentIndex === target.unit.parentIndex
  )
  const base =
    target.unit.heading ||
    target.unit.parentConfig.id ||
    `Section ${idx + 1}`
  const path = target.slotPath
  const where =
    path.kind === 'background'
      ? `background[${path.index}]`
      : path.kind === 'foregroundFlat'
        ? `foreground[${path.index}]`
        : path.kind === 'foregroundRegion'
          ? `foreground.${path.region}[${path.index}]`
          : 'map'
  return `${base} · ${where}`
}
