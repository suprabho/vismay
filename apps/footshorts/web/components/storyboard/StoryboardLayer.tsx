'use client'

import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import { getVizModule, type VizRenderProps } from '@vismay/viz-engine'
import type { StoryboardLayerConfig } from '@/lib/storyboards/types'

// Renders a single footshorts widget from its inline config via the viz-engine
// module renderer — the same path the catalog's VizModulePreview uses. The
// footshorts vertical must already be loaded (NativeStoryboard gates on it).

const noop = () => {}

function Notice({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-surface p-4 text-center">
      <p className="font-mono text-[11px] leading-snug text-muted">{message}</p>
    </div>
  )
}

export function StoryboardLayer({ layer }: { layer: StoryboardLayerConfig }) {
  const { type } = layer
  const vizModule = useMemo(() => getVizModule(type), [type])

  const parsed = useMemo(():
    | { ok: true; config: unknown }
    | { ok: false; error: string } => {
    if (!vizModule) return { ok: false, error: `Module '${type}' is not registered` }
    try {
      return {
        ok: true,
        config: vizModule.parseConfig(layer, { slug: 'storyboard', label: type }),
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [vizModule, layer, type])

  const Lazy = useMemo(
    () =>
      vizModule
        ? (lazy(vizModule.load) as ComponentType<VizRenderProps<unknown>>)
        : null,
    [vizModule],
  )

  if (!vizModule || !Lazy) return <Notice message={`No renderer for '${type}'`} />
  if (!parsed.ok) return <Notice message={`parseConfig: ${parsed.error}`} />

  return (
    <Suspense fallback={<Notice message="Loading…" />}>
      <Lazy
        slug="storyboard"
        unitKey={type}
        config={parsed.config}
        activeStep={0}
        mode="autoplay"
        noteReady={noop}
        isActive
      />
    </Suspense>
  )
}
