'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { vizmayaUrl } from '@/lib/publicSite'

interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

interface Props {
  /** Path on the public site that hosts the embeddable landing (e.g. "/wallet-geo"). */
  path: string
  /** Initial camera shown in the preview iframe + inputs. */
  defaultView: ViewState
}

const fmt = (n: number, digits: number) => {
  // Trim trailing zeros so the URL/snippet doesn't show "30.000000" — but keep
  // a sensible precision floor for lat/lng (6 decimals ≈ 11cm on the equator).
  const fixed = n.toFixed(digits)
  return fixed.replace(/\.?0+$/, '')
}

function buildSrc(path: string, view: ViewState): string {
  const params = new URLSearchParams({
    embed: '1',
    lng: fmt(view.longitude, 6),
    lat: fmt(view.latitude, 6),
    zoom: fmt(view.zoom, 3),
  })
  if (view.pitch !== 0) params.set('pitch', fmt(view.pitch, 2))
  if (view.bearing !== 0) params.set('bearing', fmt(view.bearing, 2))
  return vizmayaUrl(`${path}?${params.toString()}`)
}

export default function EmbedPreview({ path, defaultView }: Props) {
  const [view, setView] = useState<ViewState>(defaultView)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [copied, setCopied] = useState<'url' | 'iframe' | null>(null)

  // The iframe src is set once and never updated — camera changes from inputs
  // are pushed via postMessage so the map repositions without a full reload.
  const initialSrc = useMemo(() => buildSrc(path, defaultView), [path, defaultView])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown> | null
      if (!d || typeof d !== 'object' || d.type !== 'vizmaya:view') return
      if (
        typeof d.longitude !== 'number' ||
        typeof d.latitude !== 'number' ||
        typeof d.zoom !== 'number'
      ) {
        return
      }
      setView({
        longitude: d.longitude,
        latitude: d.latitude,
        zoom: d.zoom,
        pitch: typeof d.pitch === 'number' ? d.pitch : 0,
        bearing: typeof d.bearing === 'number' ? d.bearing : 0,
      })
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  function pushToIframe(next: ViewState) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'vizmaya:setview', ...next },
      '*',
    )
  }

  function updateField<K extends keyof ViewState>(key: K, value: number) {
    if (!Number.isFinite(value)) return
    setView((prev) => {
      const next = { ...prev, [key]: value }
      pushToIframe(next)
      return next
    })
  }

  function reset() {
    setView(defaultView)
    pushToIframe(defaultView)
  }

  const liveSrc = buildSrc(path, view)
  const iframeSnippet = `<iframe src="${liveSrc}" width="100%" height="600" style="border:0;" allow="fullscreen"></iframe>`

  async function copy(kind: 'url' | 'iframe') {
    const text = kind === 'url' ? liveSrc : iframeSnippet
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1200)
    } catch {
      // Clipboard permission denied — fall back to selecting the text by
      // letting the user copy from the input below.
    }
  }

  return (
    <section className="flex-1 min-h-0 flex">
      <div className="flex flex-1 min-h-0 flex-col p-8 space-y-6 w-full">
        <div className="flex flex-col">
          <h2 className="font-medium">Embed</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pan and zoom the preview map to set the starting view. Numeric fields stay in
            sync — type to nudge the camera precisely.
          </p>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10 bg-black/30">
            <iframe
              ref={iframeRef}
              src={initialSrc}
              className="block w-full h-full"
              title="Embed preview"
              // Allow the embedded map to capture mouse/touch.
              allow="fullscreen"
            />
          </div>

          <div className="w-[320px] shrink-0 space-y-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                  View
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="text-[11px] text-neutral-500 hover:text-white px-2 py-0.5 rounded border border-white/10"
                  title="Reset to default view"
                >
                  reset
                </button>
              </div>
              <NumberField
                label="Longitude"
                value={view.longitude}
                step={0.01}
                min={-180}
                max={180}
                onChange={(v) => updateField('longitude', v)}
              />
              <NumberField
                label="Latitude"
                value={view.latitude}
                step={0.01}
                min={-90}
                max={90}
                onChange={(v) => updateField('latitude', v)}
              />
              <NumberField
                label="Zoom"
                value={view.zoom}
                step={0.1}
                min={0}
                max={22}
                onChange={(v) => updateField('zoom', v)}
              />
              <NumberField
                label="Pitch"
                value={view.pitch}
                step={1}
                min={0}
                max={85}
                onChange={(v) => updateField('pitch', v)}
              />
              <NumberField
                label="Bearing"
                value={view.bearing}
                step={1}
                min={-180}
                max={180}
                onChange={(v) => updateField('bearing', v)}
              />
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-3">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                URL
              </div>
              <textarea
                readOnly
                value={liveSrc}
                rows={2}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-black/30 rounded px-2 py-1.5 font-mono text-[11px] border border-white/10 text-neutral-200 resize-none break-all"
              />
              <button
                type="button"
                onClick={() => copy('url')}
                className="w-full text-xs px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200"
              >
                {copied === 'url' ? 'copied' : 'copy URL'}
              </button>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-3">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                iframe snippet
              </div>
              <textarea
                readOnly
                value={iframeSnippet}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-black/30 rounded px-2 py-1.5 font-mono text-[11px] border border-white/10 text-neutral-200 resize-none break-all"
              />
              <button
                type="button"
                onClick={() => copy('iframe')}
                className="w-full text-xs px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200"
              >
                {copied === 'iframe' ? 'copied' : 'copy iframe code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  // We render with a controlled string so the user can type "-0." or partial
  // values mid-edit without React resetting the cursor. The onChange callback
  // only fires for parseable numbers.
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-neutral-400">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-full bg-black/30 rounded px-2 py-1.5 font-mono text-[13px] border border-white/10 focus:outline-none focus:border-white/30"
      />
    </label>
  )
}
