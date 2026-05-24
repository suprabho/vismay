'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { ClassicScheme, ReactArea2D } from 'rete-react-plugin'
import {
  contentNode,
  layoutNode,
  backgroundNode,
  leadNode,
  chartsNode,
  bodyNode,
  shareNode,
  reportNodeFormat,
  mapOverrideNode,
  narrationNode,
  parseCanvasSources,
  type CanvasSources,
} from './canvasInputs'
import type { InputNodeData } from './InputNode'
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
import EditorPanel from './EditorPanel'

interface Props {
  slug: string
  units: ResolvedUnit[]
  sources: CanvasSources
  /**
   * Pre-signed iframe URLs keyed by output id (e.g. `section-1:share-3-4`)
   * and canvas-frame id (`canvas-frame:section-1`). Server signs at request
   * time with a long TTL so the canvas can stay open without re-signing.
   * Empty values fall back to a blank src.
   */
  signedSrcById: Record<string, string>
}

/* ─── Layout constants ───────────────────────────────────────────── */
const FRAME_W = 1920
const FRAME_H = 1080
const FRAME_MIN_W = 480
const FRAME_MIN_H = 270

const INPUT_W = 320
const INPUT_H = 150
const INPUT_GAP_Y = 36

// Decorative group labels in the input column ("Viz", "Foreground"). Same
// width as wired input cards so the column edges line up; shorter height
// since they carry just a label, no preview body.
const INPUT_HEADER_H = 52

const COL_GAP = 280

const HEADER_W = 320
const HEADER_H = 88
const HEADER_GAP_Y = 28

const OUTPUT_GAP_Y = 100
const OVERRIDE_GAP_Y = 36

// Reserved strip across the top of the frame iframe for the pagination
// overlay (◀ §3 of 5 — heading ▶). Other iframes have no overlay.
const FRAME_OVERLAY_H = 56

/** Which override input sockets each output group exposes. Drives both
 *  socket creation on the OutputNode and the override → output wiring. */
const OVERRIDE_SOCKETS_BY_GROUP: Record<OutputGroupId, string[]> = {
  share: ['variants'],
  slides: ['override'],
  report: ['override'],
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
  switch (groupId) {
    case 'share':
      return [
        {
          data: shareNode(unit, parsed),
          socket: 'variants',
          editKind: 'share',
        },
      ]
    case 'slides':
      return [
        {
          data: reportNodeFormat(unit, parsed, 'slides'),
          socket: 'override',
          editKind: 'slides',
        },
      ]
    case 'report':
      return [
        {
          data: reportNodeFormat(unit, parsed, 'report'),
          socket: 'override',
          editKind: 'report',
        },
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
 * section's nodes. Recomputed on section switch; passed to the in-place
 * update path so no Rete nodes get remounted.
 */
/** Wired input slot keys on the Frame node. The visual column also includes
 *  two decorative "Viz" / "Foreground" header cards, but those carry no data
 *  and aren't part of this map — they're hard-coded in the build/layout. */
type FrameInputKey =
  | 'content'
  | 'layout'
  | 'background'
  | 'lead'
  | 'charts'
  | 'body'

interface SectionView {
  sectionId: string
  heading: string
  frameSrc: string
  inputs: Record<FrameInputKey, InputNodeData>
  /** Override card data per group; only the expanded group's is actually
   *  read at any moment, but we precompute all four so toggling is cheap. */
  overrides: Record<OutputGroupId, OverrideSpec[]>
  /** Output iframe URLs + dims per group. Same: all four precomputed. */
  outputs: Record<OutputGroupId, ReturnType<typeof buildOutputsForUnit>>
}

function buildSectionView(
  unit: ResolvedUnit,
  parsed: ReturnType<typeof parseCanvasSources>,
  slug: string,
  signedSrcById: Record<string, string>,
  dataNonce: number
): SectionView {
  const sectionId =
    unit.parentConfig.id ?? `section-${unit.parentIndex}`
  const heading =
    unit.heading ||
    unit.paragraphs[0]?.replace(/\*+/g, '') ||
    `Section ${unit.parentIndex + 1}`
  const frameSrc = withCacheBust(
    signedSrcById[canvasFrameId(sectionId)] ?? '',
    dataNonce
  )
  const allOutputs = buildOutputsForUnit(unit, slug, signedSrcById).map(
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
    inputs: {
      content: contentNode(unit),
      layout: layoutNode(unit),
      background: backgroundNode(unit),
      lead: leadNode(unit),
      charts: chartsNode(unit),
      body: bodyNode(unit),
    },
    overrides: {
      share: buildOverridesForGroup('share', unit, parsed),
      slides: buildOverridesForGroup('slides', unit, parsed),
      report: buildOverridesForGroup('report', unit, parsed),
      autoplay: buildOverridesForGroup('autoplay', unit, parsed),
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
  signedSrcById,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Sources live in state so save handlers can patch them locally,
  // triggering iframe reload + preview re-render without a full page
  // refetch. Server's initial value seeds it once.
  const [sources, setSources] = useState<CanvasSources>(initialSources)
  // Bumped on every successful save — appended to iframe URLs as a
  // cache-bust so the iframes pull the fresh render.
  const [dataNonce, setDataNonce] = useState(0)

  const parsedSources = useMemo(() => parseCanvasSources(sources), [sources])
  const sectionUnits = useMemo(
    () => units.filter((u) => u.subIndex === 0),
    [units]
  )
  // Section views are pure data; cheap to memoise once and index into.
  // Includes dataNonce so URL changes propagate after a save.
  const sectionViews = useMemo(
    () =>
      sectionUnits.map((u) =>
        buildSectionView(u, parsedSources, slug, signedSrcById, dataNonce)
      ),
    [sectionUnits, parsedSources, slug, signedSrcById, dataNonce]
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
  const [editorTarget, setEditorTarget] = useState<{
    kind: EditableKind
    unit: ResolvedUnit
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Derived from editorTarget + current sources; updates if the user
  // saves and the slice re-derives, but the panel stays open.
  const editorSlice: EditableSlice | null = useMemo(
    () =>
      editorTarget
        ? buildEditableSlice(editorTarget.kind, editorTarget.unit, sources)
        : null,
    [editorTarget, sources]
  )
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
      class GroupHeaderControl extends ClassicPreset.Control {
        constructor(
          public groupId: OutputGroupId,
          public label: string,
          public expanded: boolean,
          public childCount: number
        ) {
          super()
        }
      }

      // Input-side section label ("Viz", "Foreground"). Purely decorative —
      // visually demarcates the slot tree on the input column. No toggle,
      // no sockets, no data flow.
      class InputHeaderControl extends ClassicPreset.Control {
        constructor(public label: string) {
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
          this.addInput(
            'background',
            new ClassicPreset.Input(socket, 'Background')
          )
          this.addInput('lead', new ClassicPreset.Input(socket, 'Lead'))
          this.addInput('charts', new ClassicPreset.Input(socket, 'Charts'))
          this.addInput('body', new ClassicPreset.Input(socket, 'Body'))
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

      class InputHeaderNode extends ClassicPreset.Node {
        kind = 'input-header' as const
        constructor(label: string) {
          super(label)
          this.addControl('header', new InputHeaderControl(label))
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
        const stop = (e: React.MouseEvent | React.PointerEvent) =>
          e.stopPropagation()
        const onClick = (e: React.MouseEvent) => {
          if (!editable) return
          stop(e)
          data.onClick?.()
        }
        return (
          <div
            onClick={onClick}
            onPointerDown={editable ? stop : undefined}
            onMouseDown={editable ? stop : undefined}
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
              {editable && (
                <span style={{ color: '#3a5da0' }}>EDIT</span>
              )}
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
        return (
          <button
            type="button"
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={onClick}
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

      function InputHeaderControlView({
        data,
      }: {
        data: InputHeaderControl
      }) {
        // Visually distinct from wired DataNodes: thin underline, smaller
        // padding, all-caps label — so the eye reads it as a section
        // divider, not another input card.
        return (
          <div
            style={{
              width: INPUT_W - 24,
              height: INPUT_HEADER_H - 16,
              padding: '0 4px',
              display: 'flex',
              alignItems: 'flex-end',
              borderBottom: '1px solid #2a2a2a',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#888',
              paddingBottom: 6,
              pointerEvents: 'none',
            }}
          >
            {data.label}
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
              if (data.payload instanceof InputHeaderControl) {
                return InputHeaderControlView as never
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

      // Column X coords. Outputs sit to the right of the headers column,
      // far enough that even the slides node (1920 wide) doesn't reach
      // back into the header lane.
      const inputColX = 0
      const frameColX = inputColX + INPUT_W + COL_GAP
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

      /* Frame inputs — interleaved wired slots + decorative group headers.
       *
       * Order (top → bottom):
       *   Content
       *   Layout
       *   [Viz header]
       *   Background
       *   [Foreground header]
       *   Lead
       *   Charts
       *   Body
       *
       * Headers carry no data and aren't wired; they only label the
       * slot tree visually. Each wired slot gets a `value → frame.<key>`
       * connection on the same socket name as its FrameInputKey. */
      type ColumnItem =
        | { kind: 'input'; key: FrameInputKey }
        | { kind: 'header'; label: string }
      const inputColumn: ColumnItem[] = [
        { kind: 'input', key: 'content' },
        { kind: 'input', key: 'layout' },
        { kind: 'header', label: 'Viz' },
        { kind: 'input', key: 'background' },
        { kind: 'header', label: 'Foreground' },
        { kind: 'input', key: 'lead' },
        { kind: 'input', key: 'charts' },
        { kind: 'input', key: 'body' },
      ]
      const itemHeight = (it: ColumnItem): number =>
        it.kind === 'input' ? INPUT_H : INPUT_HEADER_H
      const inputTotalH =
        inputColumn.reduce((acc, it) => acc + itemHeight(it), 0) +
        (inputColumn.length - 1) * INPUT_GAP_Y
      const inputStartY = 0 + FRAME_H / 2 - inputTotalH / 2
      const inputNodes: Partial<Record<FrameInputKey, DataNode>> = {}
      let columnY = inputStartY
      for (const item of inputColumn) {
        if (item.kind === 'header') {
          const headerNode = new InputHeaderNode(item.label)
          await editor.addNode(headerNode)
          await area.translate(headerNode.id, { x: inputColX, y: columnY })
        } else {
          const data = initialView.inputs[item.key]
          const node = new DataNode(
            data.label,
            data.tag,
            data.body,
            data.variant
          )
          inputNodes[item.key] = node
          await editor.addNode(node)
          await area.translate(node.id, { x: inputColX, y: columnY })
          await editor.addConnection(
            new ClassicPreset.Connection(
              node,
              'value',
              frame,
              item.key
            ) as Schemes['Connection']
          )
        }
        columnY += itemHeight(item) + INPUT_GAP_Y
      }

      /* Group header column (always present, 4 headers) */
      const headerNodes: Record<OutputGroupId, GroupHeaderNode> = {} as Record<
        OutputGroupId,
        GroupHeaderNode
      >
      const headersTotalH =
        OUTPUT_GROUPS.length * HEADER_H +
        (OUTPUT_GROUPS.length - 1) * HEADER_GAP_Y
      const headersStartY = 0 + FRAME_H / 2 - headersTotalH / 2
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

        // Input nodes (preview content) — headers don't carry per-section
        // data, so only the wired slots need refreshing here.
        const wiredKeys: FrameInputKey[] = [
          'content',
          'layout',
          'background',
          'lead',
          'charts',
          'body',
        ]
        for (const key of wiredKeys) {
          const node = inputNodes[key]
          if (!node) continue
          const data = view.inputs[key]
          node.previewCtrl.label = data.label
          node.previewCtrl.tag = data.tag
          node.previewCtrl.body = data.body
          node.previewCtrl.variant = data.variant
          await area.update('control', node.previewCtrl.id)
        }

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
    // re-open on the new section.
    setEditorTarget(null)
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
          editedText
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
      </header>
      {editorSlice && (
        <EditorPanel
          slice={editorSlice}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onClose={() => {
            setEditorTarget(null)
            setSaveError(null)
          }}
        />
      )}
    </div>
  )
}
