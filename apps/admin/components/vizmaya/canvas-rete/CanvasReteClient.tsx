'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { ClassicScheme, ReactArea2D } from 'rete-react-plugin'
import {
  buildInputsForUnit,
  parseCanvasSources,
  type CanvasSources,
} from '../canvas/canvasInputs'

interface Props {
  slug: string
  units: ResolvedUnit[]
  sources: CanvasSources
  publicSiteUrl: string
}

/* ─── Layout constants ──────────────────────────────────────────────
 * Same scale as the custom canvas so the visual feel matches: each
 * section gets a 1920×1080 frame, input cards sit to the left, sections
 * tile horizontally with generous breathing room.
 */
const FRAME_W = 1920
const FRAME_H = 1080
const FRAME_GAP_X = 720
const INPUT_W = 320
const INPUT_H = 140
const INPUT_GAP_Y = 36
const INPUT_TO_FRAME_GAP = 220

/**
 * First-spike Rete editor. Goal: prove that the framework can render our
 * shape — section frame nodes with iframe content, 7 input nodes per
 * frame, connections between them — at the dimensions we need
 * (1920×1080 iframes, ~320×140 input cards). Pan/zoom and connection
 * routing come from Rete's area + connection plugins.
 *
 * Deliberately NOT in this round: output nodes, group collapse, tabs,
 * resize handles, focus state, per-output override columns. Those layer
 * on top once the primitive is confirmed workable.
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
      // Dynamic import keeps Rete out of the SSR bundle and avoids
      // module-init side effects firing on the server build.
      const { createRoot } = await import('react-dom/client')
      const { NodeEditor, ClassicPreset } = await import('rete')
      const { AreaPlugin, AreaExtensions } = await import('rete-area-plugin')
      const { ConnectionPlugin, Presets: ConnectionPresets } =
        await import('rete-connection-plugin')
      const { ReactPlugin, Presets: ReactPresets } =
        await import('rete-react-plugin')
      // React 19 needs the JSX runtime imported in this client module
      // so the dynamically-injected node components can render.
      const React = await import('react')

      if (disposed) return

      /* ─── Custom controls (the node body content) ──────────────── */

      class IframeControl extends ClassicPreset.Control {
        constructor(public src: string, public w: number, public h: number) {
          super()
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

      /* ─── Custom node classes (distinguish for renderer dispatch) ─ */

      const socket = new ClassicPreset.Socket('canvas')

      class FrameNode extends ClassicPreset.Node {
        kind = 'frame' as const
        width = FRAME_W
        height = FRAME_H
        constructor(label: string, iframeSrc: string) {
          super(label)
          // 7 named input sockets to mirror the custom canvas's input
          // column. Ordering matches buildInputsForUnit so connections
          // line up by index.
          for (const key of [
            'content',
            'config',
            'chart',
            'share',
            'report',
            'map-override',
            'narration',
          ]) {
            this.addInput(
              key,
              new ClassicPreset.Input(socket, prettyLabel(key))
            )
          }
          this.addControl(
            'iframe',
            new IframeControl(iframeSrc, FRAME_W, FRAME_H)
          )
        }
      }

      class InputDataNode extends ClassicPreset.Node {
        kind = 'input' as const
        width = INPUT_W
        height = INPUT_H
        constructor(
          label: string,
          tag: string,
          body: string,
          variant: 'mono' | 'muted'
        ) {
          super(label)
          this.addOutput(
            'value',
            new ClassicPreset.Output(socket, 'value')
          )
          this.addControl(
            'preview',
            new TextPreviewControl(tag, body, variant)
          )
        }
      }

      /* ─── React components for the custom controls ────────────── */

      function IframeControlView({ data }: { data: IframeControl }) {
        return React.createElement(
          'div',
          {
            style: {
              width: data.w,
              height: data.h,
              background: '#0a0a0a',
              border: '1px solid #262626',
              borderRadius: 8,
              overflow: 'hidden',
            },
          },
          React.createElement('iframe', {
            src: data.src,
            style: {
              width: '100%',
              height: '100%',
              border: 0,
              display: 'block',
              background: '#0a0a0a',
              // Same trick as the custom canvas — pan-drag passes through
              // the iframe so the canvas-bg drag listener still fires.
              pointerEvents: 'none',
            },
          })
        )
      }

      function TextPreviewControlView({ data }: { data: TextPreviewControl }) {
        return React.createElement(
          'div',
          {
            style: {
              width: INPUT_W - 24,
              minHeight: 70,
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
            },
          },
          React.createElement(
            'div',
            {
              style: {
                fontSize: 9,
                color: '#666',
                letterSpacing: '0.14em',
                marginBottom: 4,
              },
            },
            data.tag
          ),
          data.body
        )
      }

      /* ─── Editor + plugin wiring ──────────────────────────────── */

      // The plugin generics all key off `ClassicScheme` — Rete's stock
      // shape (Classic.Node + Classic.Connection). Our concrete classes
      // (FrameNode / InputDataNode) extend ClassicPreset.Node so they
      // satisfy that shape at runtime; we discriminate via `instanceof`
      // in the custom-control branch.
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

      for (let i = 0; i < sectionUnits.length; i++) {
        const unit = sectionUnits[i]
        const sectionId =
          unit.parentConfig.id ?? `section-${unit.parentIndex}`
        const heading =
          unit.heading ||
          unit.paragraphs[0]?.replace(/\*+/g, '') ||
          `Section ${unit.parentIndex + 1}`
        const iframeSrc = `${publicSiteUrl.replace(/\/$/, '')}/story/${encodeURIComponent(slug)}/canvas-frame/${encodeURIComponent(sectionId)}`

        const frame = new FrameNode(heading, iframeSrc)
        await editor.addNode(frame)
        const fx = i * (FRAME_W + FRAME_GAP_X)
        const fy = 0
        await area.translate(frame.id, { x: fx, y: fy })

        // Build the 7 inputs as separate nodes vertically stacked to the
        // left of the frame. We reuse the slicers from canvasInputs so
        // the data shown matches the custom-canvas exactly.
        const inputData = buildInputsForUnit(unit, parsedSources)
        const totalH =
          inputData.length * INPUT_H +
          (inputData.length - 1) * INPUT_GAP_Y
        const startY = fy + FRAME_H / 2 - totalH / 2
        const inputX = fx - INPUT_W - INPUT_TO_FRAME_GAP

        for (let j = 0; j < inputData.length; j++) {
          const d = inputData[j]
          const node = new InputDataNode(d.label, d.tag, d.body, d.variant)
          await editor.addNode(node)
          await area.translate(node.id, {
            x: inputX,
            y: startY + j * (INPUT_H + INPUT_GAP_Y),
          })
          await editor.addConnection(
            new ClassicPreset.Connection(
              node,
              'value' as never,
              frame,
              d.id as never
            ) as Schemes['Connection']
          )
        }
      }

      // One auto-fit after the graph is built so the user sees the
      // whole story instead of a single zoomed-in frame.
      await AreaExtensions.zoomAt(area, editor.getNodes())

      teardown = () => {
        area.destroy()
      }
    })().catch((err) => {
      // Spike-only: log instead of crashing the page so we can iterate
      // without bricking the route.
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
        // Rete fills its container; we let it own the full viewport.
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
          rete spike · {sectionUnits.length} sections
        </span>
      </header>
      <footer
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          fontSize: 11,
          color: '#555',
          pointerEvents: 'none',
        }}
      >
        scroll to zoom · drag to pan · spike scope: frames + 7 inputs each ·
        no outputs / groups / tabs yet
      </footer>
    </div>
  )
}

function prettyLabel(key: string): string {
  return key
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
