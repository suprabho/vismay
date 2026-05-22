'use client'

import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { ClassicScheme, ReactArea2D } from 'rete-react-plugin'
import {
  contentNode,
  configNode,
  chartNode,
  shareNode,
  reportNodeFormat,
  mapOverrideNode,
  narrationNode,
  parseCanvasSources,
  type CanvasSources,
} from '../canvas/canvasInputs'
import type { InputNodeData } from '../canvas/InputNode'
import { buildOutputsForUnit } from '../canvas/canvasOutputs'
import type { OutputNodeData } from '../canvas/OutputNode'

interface Props {
  slug: string
  units: ResolvedUnit[]
  sources: CanvasSources
  publicSiteUrl: string
}

/* ─── Layout constants (per section) ─────────────────────────────── */
const FRAME_W = 1920
const FRAME_H = 1080
const FRAME_MIN_W = 480
const FRAME_MIN_H = 270

const INPUT_W = 320
const INPUT_H = 150
const INPUT_GAP_Y = 36

const COL_GAP = 280
const SECTION_GAP = 700

const OUTPUT_GAP_Y = 100
const OVERRIDE_GAP_Y = 36

/**
 * Round-2 Rete spike. Adds:
 *   1. Output nodes — one per export (share×3 / slides / report / autoplay×2)
 *      at native dimensions, fed from the section frame's `render` socket.
 *   2. Per-output override nodes — Share Variants, Report Override,
 *      Slides Override, Map Override, Narration. These connect ONLY to
 *      their downstream outputs, not to the frame (the user's call —
 *      cleaner semantics than the custom canvas, where overrides were
 *      duplicated on both the frame's left and each output's left).
 *   3. Frame resize — drag the bottom-right corner of a section frame
 *      to resize. Rete handles re-routing connections on the fly.
 *
 * Still out of scope: group collapse, tabbing share aspects, focus state,
 * per-section auto-layout when frames are resized. Free-form positions
 * — user drags nodes around as needed.
 */
export default function CanvasReteClient({
  slug,
  units,
  sources,
  publicSiteUrl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const parsedSources = useMemo(() => parseCanvasSources(sources), [sources])
  const sectionUnits = useMemo(
    () => units.filter((u) => u.subIndex === 0),
    [units]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let teardown: (() => void) | null = null
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

      /* ─── Custom controls ───────────────────────────────────────
       * Each Rete node uses the default classic chrome (label bar +
       * sockets), but the body comes from one of these custom controls.
       * The control owns its visual size, which lets us mix native-sized
       * iframes (giant) with text-preview cards (small) in the same
       * editor.
       */

      class IframeControl extends ClassicPreset.Control {
        // Mutable so the resize handle can change them; React component
        // reads these at render time and is force-updated on drag.
        width: number
        height: number
        // Optional callback wired up by the editor setup — lets us notify
        // the area plugin so connections re-route on resize.
        onResize?: (w: number, h: number) => void
        // True only for the section frame's iframe; the smaller output
        // iframes use this same control type but without a handle.
        resizable: boolean
        constructor(
          public src: string,
          w: number,
          h: number,
          opts: { resizable?: boolean } = {}
        ) {
          super()
          this.width = w
          this.height = h
          this.resizable = opts.resizable ?? false
        }
      }

      class TextPreviewControl extends ClassicPreset.Control {
        constructor(
          public tag: string,
          public body: string,
          public variant: 'mono' | 'muted'
        ) {
          super()
        }
      }

      /* ─── Node classes ────────────────────────────────────────── */

      const socket = new ClassicPreset.Socket('canvas')

      // Section frame: 3 inputs (content/config/chart), 1 output (render).
      // The render output fans out to every downstream output node.
      class FrameNode extends ClassicPreset.Node {
        kind = 'frame' as const
        constructor(label: string, iframeCtrl: IframeControl) {
          super(label)
          this.addInput('content', new ClassicPreset.Input(socket, 'Content'))
          this.addInput('config', new ClassicPreset.Input(socket, 'Config'))
          this.addInput(
            'chart',
            new ClassicPreset.Input(socket, 'Chart Data')
          )
          this.addOutput(
            'render',
            new ClassicPreset.Output(socket, 'render', true)
          )
          this.addControl('iframe', iframeCtrl)
        }
      }

      // Output node: iframe at native dims, plus N input sockets — one
      // for the frame's render and one per relevant override.
      class OutputNode extends ClassicPreset.Node {
        kind = 'output' as const
        constructor(
          label: string,
          iframeCtrl: IframeControl,
          overrideKeys: string[]
        ) {
          super(label)
          this.addInput(
            'render',
            new ClassicPreset.Input(socket, 'render')
          )
          for (const key of overrideKeys) {
            this.addInput(key, new ClassicPreset.Input(socket, key))
          }
          this.addControl('iframe', iframeCtrl)
        }
      }

      // Pure-data node: a single output socket emitting a preview string.
      // Used for both the frame's left-column inputs (Content / Config /
      // Chart) and the right-side overrides (Share Variants / Map / etc.).
      class DataNode extends ClassicPreset.Node {
        kind = 'data' as const
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
          this.addControl(
            'preview',
            new TextPreviewControl(tag, body, variant)
          )
        }
      }

      /* ─── React renderers for the controls ─────────────────────── */

      function IframeControlView({ data }: { data: IframeControl }) {
        const [, force] = useReducer((n: number) => n + 1, 0)

        const onResizeStart = (e: React.MouseEvent) => {
          if (!data.resizable) return
          // Stop the area plugin from picking this up as a node drag.
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

        return (
          <div
            style={{
              width: data.width,
              height: data.height,
              background: '#0a0a0a',
              border: '1px solid #262626',
              borderRadius: 8,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <iframe
              src={data.src}
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                display: 'block',
                background: '#0a0a0a',
                // Same trick as the custom canvas — pan-drag passes through
                // the iframe so node drag still fires.
                pointerEvents: 'none',
              }}
            />
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
        return (
          <div
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
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: '#666',
                letterSpacing: '0.14em',
                marginBottom: 4,
              }}
            >
              {data.tag}
            </div>
            {data.body}
          </div>
        )
      }

      /* ─── Editor + plugin wiring ──────────────────────────────── */

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

      /* ─── Build the graph ────────────────────────────────────── */

      // Pre-compute column positions: each section gets four vertical
      // lanes side-by-side, then a SECTION_GAP, then the next section.
      const inputColX = 0
      const frameColX = INPUT_W + COL_GAP
      const overrideColX = frameColX + FRAME_W + COL_GAP
      const outputColX = overrideColX + INPUT_W + COL_GAP

      // Outputs vary in width — max is slides @ 1920. Use that for the
      // section's effective right edge so the next section starts cleanly.
      const sectionPitch = outputColX + 1920 + SECTION_GAP

      for (let i = 0; i < sectionUnits.length; i++) {
        const unit = sectionUnits[i]
        const sectionId =
          unit.parentConfig.id ?? `section-${unit.parentIndex}`
        const heading =
          unit.heading ||
          unit.paragraphs[0]?.replace(/\*+/g, '') ||
          `Section ${unit.parentIndex + 1}`
        const sectionX = i * sectionPitch
        const frameTopY = 0
        const frameSrc = `${publicSiteUrl.replace(/\/$/, '')}/story/${encodeURIComponent(slug)}/canvas-frame/${encodeURIComponent(sectionId)}`

        /* ── Frame ─────────────────────────────────────────────── */
        const iframeCtrl = new IframeControl(frameSrc, FRAME_W, FRAME_H, {
          resizable: true,
        })
        const frame = new FrameNode(heading, iframeCtrl)
        // Closure captures `frame` + `area` so resize updates feed back
        // into Rete's node geometry — connection routing follows.
        iframeCtrl.onResize = (w, h) => {
          void area.resize(frame.id, w, h)
        }
        await editor.addNode(frame)
        await area.translate(frame.id, {
          x: sectionX + frameColX,
          y: frameTopY,
        })

        /* ── Frame inputs (Content / Config / Chart) ──────────── */
        // Just three nodes now — the override-type inputs have moved to
        // be attached directly to their downstream outputs instead.
        const frameInputs: { key: string; data: InputNodeData }[] = [
          { key: 'content', data: contentNode(unit) },
          { key: 'config', data: configNode(unit) },
          { key: 'chart', data: chartNode(unit, parsedSources) },
        ]
        const inputColTotalH =
          frameInputs.length * INPUT_H +
          (frameInputs.length - 1) * INPUT_GAP_Y
        const inputStartY = frameTopY + FRAME_H / 2 - inputColTotalH / 2
        for (let j = 0; j < frameInputs.length; j++) {
          const { key, data } = frameInputs[j]
          const node = new DataNode(
            data.label,
            data.tag,
            data.body,
            data.variant
          )
          await editor.addNode(node)
          await area.translate(node.id, {
            x: sectionX + inputColX,
            y: inputStartY + j * (INPUT_H + INPUT_GAP_Y),
          })
          await editor.addConnection(
            new ClassicPreset.Connection(
              node,
              'value',
              frame,
              key
            ) as Schemes['Connection']
          )
        }

        /* ── Output nodes ─────────────────────────────────────── */
        // Output kind → which override socket names it accepts. This is
        // the schema that defines "which override connects to which
        // output" — the connection list below reads from it too.
        const overrideKeysByGroup: Record<string, string[]> = {
          share: ['variants'],
          slides: ['override'],
          report: ['override'],
          autoplay: ['map', 'narration'],
        }

        const outputData = buildOutputsForUnit(unit, slug, publicSiteUrl)
        const outputNodesById = new Map<string, OutputNode>()
        // Stack outputs vertically starting from the frame's top edge.
        // They'll extend well below the frame — that's expected (slides +
        // report + autoplay × 2 is ~5500px tall stacked); user pans.
        let outY = frameTopY
        for (const o of outputData) {
          const ctrl = new IframeControl(o.src, o.w, o.h)
          const node = new OutputNode(
            o.label,
            ctrl,
            overrideKeysByGroup[o.group] ?? []
          )
          outputNodesById.set(o.id, node)
          await editor.addNode(node)
          await area.translate(node.id, {
            x: sectionX + outputColX,
            y: outY,
          })
          await editor.addConnection(
            new ClassicPreset.Connection(
              frame,
              'render',
              node,
              'render'
            ) as Schemes['Connection']
          )
          outY += o.h + OUTPUT_GAP_Y
        }

        /* ── Override nodes (column 3, between frame and outputs) ─ */
        // Each override entry: which slicer to call, the target output
        // group, and the override socket name on the target node.
        interface OverrideSpec {
          data: InputNodeData
          targetGroup: 'share' | 'slides' | 'report' | 'autoplay'
          targetSocket: string
        }
        const overrideSpecs: OverrideSpec[] = [
          {
            data: shareNode(unit, parsedSources),
            targetGroup: 'share',
            targetSocket: 'variants',
          },
          {
            data: reportNodeFormat(unit, parsedSources, 'slides'),
            targetGroup: 'slides',
            targetSocket: 'override',
          },
          {
            data: reportNodeFormat(unit, parsedSources, 'report'),
            targetGroup: 'report',
            targetSocket: 'override',
          },
          {
            data: mapOverrideNode(unit, parsedSources),
            targetGroup: 'autoplay',
            targetSocket: 'map',
          },
          {
            data: narrationNode(unit, parsedSources),
            targetGroup: 'autoplay',
            targetSocket: 'narration',
          },
        ]
        // Override label collisions are possible (e.g. two report formats
        // both named "Override"); we already namespace via the slicers'
        // shape so it's fine, but rename label-defaults for clarity.
        const overrideTotalH =
          overrideSpecs.length * INPUT_H +
          (overrideSpecs.length - 1) * OVERRIDE_GAP_Y
        const overrideStartY = frameTopY + FRAME_H / 2 - overrideTotalH / 2
        for (let j = 0; j < overrideSpecs.length; j++) {
          const spec = overrideSpecs[j]
          const node = new DataNode(
            spec.data.label,
            spec.data.tag,
            spec.data.body,
            spec.data.variant
          )
          await editor.addNode(node)
          await area.translate(node.id, {
            x: sectionX + overrideColX,
            y: overrideStartY + j * (INPUT_H + OVERRIDE_GAP_Y),
          })
          // Fan out to every output in the target group.
          for (const target of outputData) {
            if (target.group !== spec.targetGroup) continue
            const targetNode = outputNodesById.get(target.id)
            if (!targetNode) continue
            await editor.addConnection(
              new ClassicPreset.Connection(
                node,
                'value',
                targetNode,
                spec.targetSocket
              ) as Schemes['Connection']
            )
          }
        }
      }

      // Auto-fit after the whole graph is built so the user sees more
      // than one section on first paint. They can pan/zoom from there.
      await AreaExtensions.zoomAt(area, editor.getNodes())

      teardown = () => {
        area.destroy()
      }
    })().catch((err) => {
      console.error('[CanvasReteClient] setup failed', err)
    })

    return () => {
      disposed = true
      teardown?.()
    }
  }, [slug, sectionUnits, parsedSources, publicSiteUrl])

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
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />
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
          rete spike · {sectionUnits.length} sections · drag frame corner
          to resize
        </span>
      </header>
    </div>
  )
}
