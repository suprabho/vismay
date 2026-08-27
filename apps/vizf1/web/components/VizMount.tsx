'use client'

import {
  Component,
  lazy,
  Suspense,
  use,
  useMemo,
  type ComponentType,
  type ReactNode,
} from 'react'
import { getVizModule, type VizRenderProps } from '@vismay/viz-engine'
import { register as registerF1 } from '@vismay/f1-viz'

/**
 * Mount a single F1 viz module on a plain (non-story) page — the race page's
 * Telemetry tab uses this for f1:telemetry-clip / f1:track-3d / f1:telemetry-chart.
 *
 * Mirrors the catalog's VizModulePreview: register the f1 vertical once
 * (client-side), look the module up in the viz-engine registry, parse the raw
 * config, and render the module's lazy Component with the minimal VizRenderProps.
 * Each module's `load` is a dynamic import, so three.js / echarts stay code-split.
 */

// Cached module-level promise — f1's `register()` runs exactly once per client.
const f1Ready = registerF1()
const noop = () => {}

function Chip({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[12rem] w-full items-center justify-center rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
      {children}
    </div>
  )
}

class RenderBoundary extends Component<
  { children: ReactNode; fallback: (e: Error) => ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}

export default function VizMount({ type, config }: { type: string; config: unknown }) {
  return (
    <Suspense fallback={<Chip>Loading…</Chip>}>
      <Ready type={type} config={config} />
    </Suspense>
  )
}

function Ready({ type, config }: { type: string; config: unknown }) {
  use(f1Ready)
  const vizModule = useMemo(() => getVizModule(type), [type])

  const parsed = useMemo(() => {
    if (!vizModule) return { ok: false as const, error: new Error(`Module '${type}' is not registered`) }
    try {
      return { ok: true as const, config: vizModule.parseConfig(config, { slug: 'vizf1-race', label: type }) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e : new Error(String(e)) }
    }
  }, [vizModule, config, type])

  const Lazy = useMemo(
    () => (vizModule ? (lazy(vizModule.load) as ComponentType<VizRenderProps<unknown>>) : null),
    [vizModule],
  )

  if (!vizModule || !Lazy) return <Chip>No renderer for &lsquo;{type}&rsquo;</Chip>
  if (!parsed.ok) return <Chip>{parsed.error.message}</Chip>

  return (
    <RenderBoundary fallback={(e) => <Chip>Render error: {e.message}</Chip>}>
      <Suspense fallback={<Chip>Loading…</Chip>}>
        <Lazy
          slug="vizf1-race"
          unitKey={type}
          config={parsed.config}
          activeStep={0}
          mode="autoplay"
          noteReady={noop}
          isActive
        />
      </Suspense>
    </RenderBoundary>
  )
}
