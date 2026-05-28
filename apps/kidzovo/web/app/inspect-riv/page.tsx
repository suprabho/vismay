'use client'

import { useEffect, useState } from 'react'
import { useRive } from '@rive-app/react-canvas'

/**
 * Dev-only .riv inspector. Loads a .riv via the standard Rive runtime,
 * waits for `onLoad`, and dumps everything you can introspect from
 * outside Rive Studio:
 *
 *   - Artboard names
 *   - State machine names
 *   - For each state machine: input names + types (number/boolean/trigger)
 *
 * Use it to discover the contract your kz:character palette needs to
 * match — `poseInputName` and the integer enum values that drive each
 * pose. Defaults to /kidzovo-demo/owl.riv; override with `?src=/foo.riv`.
 *
 * Not linked from the landing page — this is a debugging route. Visit
 * `/inspect-riv` directly while the dev server is up.
 */

interface InputInfo {
  name: string
  type: string
  value: unknown
}

interface StateMachineInfo {
  name: string
  inputs: InputInfo[]
}

interface RivInfo {
  src: string
  artboardNames: string[]
  stateMachineNames: string[]
  stateMachines: StateMachineInfo[]
  extras?: Record<string, unknown>
  error?: string
}

function inputType(input: { type?: unknown; fire?: unknown }): string {
  // The Rive runtime exposes input.type as a string ('number' | 'boolean' |
  // 'trigger') in some versions and a numeric enum in others. Be generous.
  if (typeof input.type === 'string') return input.type
  if (typeof input.fire === 'function' && typeof input.type !== 'number') return 'trigger'
  return String(input.type ?? 'unknown')
}

export default function InspectRiv() {
  const [src, setSrc] = useState<string>('/kidzovo-demo/owl.riv')
  const [info, setInfo] = useState<RivInfo | null>(null)

  // Pick up `?src=...` on the client (avoiding useSearchParams to skip the
  // Suspense boundary requirement for this tiny dev tool).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('src')
    if (next) setSrc(next)
  }, [])

  const { rive, RiveComponent } = useRive({
    src,
    autoplay: false,
    onLoad: () => {
      // `rive` from useRive is the imperative API instance. Re-resolve via
      // closure refresh — this onLoad fires AFTER the hook's state updates,
      // so the next render has the real instance to introspect.
    },
  })

  useEffect(() => {
    if (!rive) return
    // Expose for ad-hoc inspection via preview_eval / devtools console.
    ;(window as unknown as { __rive: unknown }).__rive = rive
    try {
      // `rive.artboardNames` / `stateMachineNames` are runtime getters added
      // in @rive-app/canvas ~2.x. They throw if called before `onLoad` —
      // useRive's hook only sets `rive` after load, so this is safe.
      const r = rive as unknown as Record<string, unknown> & {
        stateMachineInputs?: (name: string) => Array<{ name: string }> | null
      }

      const probe = <T,>(fn: () => T): T | { __error: string } => {
        try {
          return fn()
        } catch (e) {
          return { __error: e instanceof Error ? e.message : String(e) }
        }
      }

      const artboardNames = probe(() => (r.artboardNames as string[] | undefined) ?? [])
      const activeArtboard = probe(() => r.activeArtboard as string | undefined)
      const animationNames = probe(() => (r.animationNames as string[] | undefined) ?? [])
      const playingAnimationNames = probe(
        () => (r.playingAnimationNames as string[] | undefined) ?? []
      )
      const bounds = probe(() => r.bounds as { minX: number; minY: number; maxX: number; maxY: number } | undefined)
      const contents = probe(() => r.contents as unknown)
      const viewModelCount = probe(() => (r.viewModelCount as (() => number) | undefined)?.())

      const stateMachineNames =
        (r.stateMachineNames as string[] | undefined) ?? []
      const stateMachines: StateMachineInfo[] = stateMachineNames.map((name) => {
        const inputs = r.stateMachineInputs?.(name) ?? []
        return {
          name,
          inputs: inputs.map((i) => ({
            name: i.name,
            type: inputType(i as unknown as { type?: unknown; fire?: unknown }),
            value: 'value' in i ? (i as { value: unknown }).value : null,
          })),
        }
      })

      // Probe the full enumerable + own-property surface so anything new on
      // the runtime version becomes discoverable without code changes.
      const probedKeys = probe(() => {
        const own = Object.getOwnPropertyNames(rive)
        const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(rive))
        return [...new Set([...own, ...proto])].filter((k) => !k.startsWith('_'))
      })

      setInfo({
        src,
        artboardNames: Array.isArray(artboardNames) ? artboardNames : [],
        stateMachineNames,
        stateMachines,
        extras: {
          activeArtboard,
          animationNames,
          playingAnimationNames,
          bounds,
          contents,
          viewModelCount,
          probedKeys,
        },
      })
    } catch (e) {
      setInfo({
        src,
        artboardNames: [],
        stateMachineNames: [],
        stateMachines: [],
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }, [rive, src])

  return (
    <main
      style={{
        padding: '2rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: '#fff7ec',
        color: '#3d2a17',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>.riv inspector</h1>
      <p style={{ opacity: 0.7, marginTop: '0.5rem' }}>
        Loading <code>{src}</code>. Append <code>?src=/path/to.riv</code> to
        inspect a different file.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: '2rem',
          marginTop: '2rem',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            background: '#fff',
            border: '1px solid #f2c8b6',
            borderRadius: 8,
          }}
        >
          <RiveComponent style={{ width: '100%', height: '100%' }} />
        </div>

        <pre
          style={{
            background: '#fff',
            border: '1px solid #f2c8b6',
            borderRadius: 8,
            padding: '1rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          {info ? JSON.stringify(info, null, 2) : 'Loading…'}
        </pre>
      </div>

      <p style={{ marginTop: '2rem', opacity: 0.6, fontSize: '0.85rem' }}>
        Once the dump is populated, the State machine `inputs[].name` and the
        first integer/boolean value tell you what to put in
        <code> verticals/kidzovo-viz/src/data/characters.ts</code> as{' '}
        <code>poseInputName</code> and the <code>poses</code> map.
      </p>
    </main>
  )
}
