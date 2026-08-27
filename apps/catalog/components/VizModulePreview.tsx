'use client'

import { lazy, Suspense, use, useMemo, type ComponentType } from 'react'
import {
  getVizModule,
  loadVertical,
  type VizRenderProps,
  type VizPersistentRenderProps,
} from '@vismay/viz-engine'
import { registerAllVerticals, VERTICALS } from '@vismay/verticals'
import ErrorBoundary from './ErrorBoundary'

// Client-side vertical boot from the shared registry (see verticalRegistry.ts).
// Idempotent — loadVertical caches the load promise per slug, and
// registerAllVerticals just overwrites the (identical) loader closures.
// Using the registry fixes the prior drift here (starship was missing).
registerAllVerticals()
const verticalsReady = Promise.all(VERTICALS.map((v) => loadVertical(v.slug)))

interface Props {
  type: string
  sample: unknown
  /** Notice shown in every context — for modules that can't render in the catalog at all. */
  previewNotice?: string
  /** Notice shown only on the compact grid card; the detail page renders the live component. */
  cardNotice?: string
  /** True on grid cards, falsy on the detail page. Gates `cardNotice`. */
  compact?: boolean
}

const noop = () => {}

function FallbackChip({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 text-center bg-[color:var(--color-surface)]">
      <p className="font-mono text-[11px] leading-snug text-[color:var(--color-muted)]">
        {message}
      </p>
    </div>
  )
}

function LoadingChip() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--color-surface)]">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-muted)]">
        Loading…
      </p>
    </div>
  )
}

export default function VizModulePreview(props: Props) {
  return (
    <Suspense fallback={<LoadingChip />}>
      <ReadyPreview {...props} />
    </Suspense>
  )
}

function ReadyPreview({ type, sample, previewNotice, cardNotice, compact }: Props) {
  use(verticalsReady)
  const vizModule = useMemo(() => getVizModule(type), [type])

  type Parsed = { kind: 'ok'; config: unknown } | { kind: 'error'; error: Error }
  const parsed: Parsed = useMemo(() => {
    if (!vizModule) return { kind: 'error', error: new Error(`Module '${type}' is not registered`) }
    try {
      return {
        kind: 'ok',
        config: vizModule.parseConfig(sample, { slug: 'catalog-preview', label: type }),
      }
    } catch (e) {
      return { kind: 'error', error: e instanceof Error ? e : new Error(String(e)) }
    }
  }, [vizModule, sample, type])

  const Lazy = useMemo(() => {
    if (!vizModule) return null
    if (vizModule.mountingMode === 'persistent-aggregated') {
      if (!vizModule.loadPersistent) return null
      return lazy(vizModule.loadPersistent) as ComponentType<VizPersistentRenderProps<unknown>>
    }
    return lazy(vizModule.load) as ComponentType<VizRenderProps<unknown>>
  }, [vizModule])

  // `previewNotice` suppresses the live render everywhere (the module can't render
  // in the catalog at all). `cardNotice` only suppresses it on the compact grid
  // card — the detail page (compact falsy) mounts the real component.
  const notice = previewNotice ?? (compact ? cardNotice : undefined)
  if (notice) {
    return <FallbackChip message={notice} />
  }

  if (parsed.kind === 'error') {
    return <FallbackChip message={`parseConfig: ${parsed.error.message}`} />
  }

  if (!vizModule || !Lazy) {
    return <FallbackChip message={`No renderer available for '${type}'`} />
  }

  return (
    <ErrorBoundary
      resetKey={type}
      fallback={(error) => <FallbackChip message={`Render error: ${error.message}`} />}
    >
      <Suspense fallback={<LoadingChip />}>
        {vizModule.mountingMode === 'persistent-aggregated' ? (
          <PersistentRender Component={Lazy as ComponentType<VizPersistentRenderProps<unknown>>} config={parsed.config} />
        ) : (
          <PerUnitRender Component={Lazy as ComponentType<VizRenderProps<unknown>>} type={type} config={parsed.config} />
        )}
      </Suspense>
    </ErrorBoundary>
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
      slug="catalog-preview"
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
    <Component
      slug="catalog-preview"
      configs={[config]}
      activeUnit={0}
      mode="autoplay"
      noteReady={noop}
    />
  )
}
