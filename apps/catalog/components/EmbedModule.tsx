'use client'

import { lazy, Suspense, use, useMemo, type ComponentType } from 'react'
import {
  getVizModule,
  loadVertical,
  registerVerticalLoader,
  useStoryReadiness,
  type VizRenderProps,
  type VizPersistentRenderProps,
} from '@vismay/viz-engine'
import ErrorBoundary from './ErrorBoundary'

// Client-side vertical boot (same idempotent pattern as VizModulePreview). The
// server layout also boots these, but the registry is per-bundle so the client
// needs its own registration. Includes all four verticals.
registerVerticalLoader('f1', () => import('@vismay/f1-viz').then((m) => m.register()))
registerVerticalLoader('footshorts', () =>
  import('@vismay/footshorts-viz').then((m) => m.register()),
)
registerVerticalLoader('starship', () =>
  import('@vismay/starship-viz').then((m) => m.register()),
)
registerVerticalLoader('kidzovo', () => import('@vismay/kidzovo-viz').then((m) => m.register()))
const verticalsReady = Promise.all([
  loadVertical('f1'),
  loadVertical('footshorts'),
  loadVertical('starship'),
  loadVertical('kidzovo'),
])

interface Props {
  type: string
  /** Arbitrary, already-JSON-decoded module config (validated via parseConfig). */
  config: unknown
}

function Message({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-3 text-center"
      {...(error ? { 'data-embed-error': text } : {})}
    >
      <p className="font-mono text-[11px] leading-snug text-[color:var(--color-muted)]">{text}</p>
    </div>
  )
}

export default function EmbedModule(props: Props) {
  return (
    <Suspense fallback={<Message text="Loading…" />}>
      <ReadyEmbed {...props} />
    </Suspense>
  )
}

function ReadyEmbed({ type, config }: Props) {
  use(verticalsReady)
  const vizModule = useMemo(() => getVizModule(type), [type])

  type Parsed = { kind: 'ok'; config: unknown } | { kind: 'error'; error: Error }
  const parsed: Parsed = useMemo(() => {
    if (!vizModule) return { kind: 'error', error: new Error(`Module '${type}' is not registered`) }
    try {
      return { kind: 'ok', config: vizModule.parseConfig(config, { slug: 'mcp-embed', label: type }) }
    } catch (e) {
      return { kind: 'error', error: e instanceof Error ? e : new Error(String(e)) }
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

  // Expect one readiness signal when we'll actually render a module; otherwise 0
  // so window.__pdfReady__ flips after the short settle instead of the long
  // fallback (keeps render_module_image from hanging on a bad config/type).
  const willRender = parsed.kind === 'ok' && !!vizModule && !!Lazy
  const { noteReady } = useStoryReadiness(willRender ? 1 : 0)

  if (parsed.kind === 'error')
    return <Message text={`parseConfig: ${parsed.error.message}`} error />
  if (!vizModule || !Lazy) return <Message text={`No renderer for '${type}'`} error />

  return (
    <ErrorBoundary resetKey={type} fallback={(error) => <Message text={`Render error: ${error.message}`} />}>
      <Suspense fallback={<Message text="Loading…" />}>
        {vizModule.mountingMode === 'persistent-aggregated' ? (
          <Component
            Component={Lazy as ComponentType<VizPersistentRenderProps<unknown>>}
            persistent
            type={type}
            config={parsed.config}
            noteReady={noteReady}
          />
        ) : (
          <Component
            Component={Lazy as ComponentType<VizRenderProps<unknown>>}
            type={type}
            config={parsed.config}
            noteReady={noteReady}
          />
        )}
      </Suspense>
    </ErrorBoundary>
  )
}

function Component({
  Component,
  persistent,
  type,
  config,
  noteReady,
}: {
  Component: ComponentType<VizRenderProps<unknown>> | ComponentType<VizPersistentRenderProps<unknown>>
  persistent?: boolean
  type: string
  config: unknown
  noteReady: () => void
}) {
  if (persistent) {
    const C = Component as ComponentType<VizPersistentRenderProps<unknown>>
    return (
      <C slug="mcp-embed" configs={[config]} activeUnit={0} mode="capture" noteReady={noteReady} />
    )
  }
  const C = Component as ComponentType<VizRenderProps<unknown>>
  return (
    <C
      slug="mcp-embed"
      unitKey={type}
      config={config}
      activeStep={0}
      mode="capture"
      noteReady={noteReady}
      isActive
    />
  )
}
