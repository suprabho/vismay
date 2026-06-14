'use client'

import {
  Component as ReactComponent,
  lazy,
  Suspense,
  use,
  useMemo,
  type ComponentType,
  type ReactNode,
} from 'react'
import {
  getVizModule,
  loadVertical,
  type VizRenderProps,
  type VizPersistentRenderProps,
} from '@vismay/viz-engine'
import { registerAllVerticals, VERTICALS } from '@vismay/verticals'

/**
 * Mounts a single foreground viz module (e.g. `fs:match-card`) from a plain
 * config object, for use inside recap markdown. This is the same boot +
 * registry + lazy-load path the catalog preview uses, packaged for reuse so the
 * admin and footshorts/web recap viewers render identically (see RecapMarkdown).
 *
 * Modules are self-contained — no theme/provider wrapper is required; each ships
 * its own lazy bundle and bundled palette data.
 */

// Client-side vertical boot from the shared registry. Idempotent: loadVertical
// caches the load promise per slug, and registerAllVerticals just re-installs
// the (identical) loader closures.
registerAllVerticals()
const verticalsReady = Promise.all(VERTICALS.map((v) => loadVertical(v.slug)))

const noop = () => {}

export interface RecapVizBlockProps {
  /** Module type, e.g. `fs:match-card`. */
  type: string
  /** Raw config object (already JSON-parsed from the fence body). */
  config: unknown
}

function Fallback({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] leading-snug text-neutral-400">
      {children}
    </div>
  )
}

/**
 * Small local error boundary so one bad module config degrades to a notice
 * instead of taking down the whole recap. Kept here (not imported) to keep
 * @vismay/ui free of an app-specific ErrorBoundary dependency.
 */
class VizErrorBoundary extends ReactComponent<
  { resetKey: string; fallback: (error: Error) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  constructor(props: VizErrorBoundary['props']) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: VizErrorBoundary['props']) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error)
    return this.props.children
  }
}

export function RecapVizBlock(props: RecapVizBlockProps) {
  return (
    <Suspense fallback={<Fallback>Loading {props.type}…</Fallback>}>
      <ReadyBlock {...props} />
    </Suspense>
  )
}

function ReadyBlock({ type, config }: RecapVizBlockProps) {
  use(verticalsReady)
  const vizModule = useMemo(() => getVizModule(type), [type])

  type Parsed = { kind: 'ok'; config: unknown } | { kind: 'error'; message: string }
  const parsed: Parsed = useMemo(() => {
    if (!vizModule) return { kind: 'error', message: `Module '${type}' is not registered` }
    try {
      return { kind: 'ok', config: vizModule.parseConfig(config, { slug: 'daily-recap', label: type }) }
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  }, [vizModule, config, type])

  const Lazy = useMemo(() => {
    if (!vizModule) return null
    if (vizModule.mountingMode === 'persistent-aggregated') {
      if (!vizModule.loadPersistent) return null
      return lazy(vizModule.loadPersistent) as ComponentType<VizPersistentRenderProps<unknown>>
    }
    return lazy(vizModule.load) as ComponentType<VizRenderProps<unknown>>
  }, [vizModule])

  if (parsed.kind === 'error') return <Fallback>{type}: {parsed.message}</Fallback>
  if (!vizModule || !Lazy) return <Fallback>No renderer for {type}</Fallback>

  return (
    <VizErrorBoundary resetKey={type} fallback={(e) => <Fallback>{type}: {e.message}</Fallback>}>
      <Suspense fallback={<Fallback>Loading {type}…</Fallback>}>
        <div className="my-4 overflow-hidden rounded-lg" style={{ aspectRatio: '16 / 9' }}>
          {vizModule.mountingMode === 'persistent-aggregated' ? (
            <PersistentRender
              Component={Lazy as ComponentType<VizPersistentRenderProps<unknown>>}
              config={parsed.config}
            />
          ) : (
            <PerUnitRender
              Component={Lazy as ComponentType<VizRenderProps<unknown>>}
              type={type}
              config={parsed.config}
            />
          )}
        </div>
      </Suspense>
    </VizErrorBoundary>
  )
}

function PerUnitRender({
  Component,
  type,
  config,
}: {
  Component: ComponentType<VizRenderProps<unknown>>
  type: string
  config: unknown
}) {
  return (
    <Component
      slug="daily-recap"
      unitKey={type}
      config={config}
      activeStep={0}
      mode="autoplay"
      noteReady={noop}
      isActive
    />
  )
}

function PersistentRender({
  Component,
  config,
}: {
  Component: ComponentType<VizPersistentRenderProps<unknown>>
  config: unknown
}) {
  return (
    <Component slug="daily-recap" configs={[config]} activeUnit={0} mode="autoplay" noteReady={noop} />
  )
}
