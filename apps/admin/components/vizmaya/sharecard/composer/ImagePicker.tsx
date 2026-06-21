'use client'

import { useState } from 'react'
import type { Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import type { ImageSource } from '../layers/types'
import { labelCls } from './controls'
import { LogoPicker } from './LogoPicker'

export interface AssetEntry {
  url: string
  filename: string
  contentType: string | null
}

/** Preset style prefaces for AI generation (prepended to the subject prompt). */
export const STYLE_TEMPLATES: Array<{ label: string; stylePrefix: string }> = [
  { label: 'None', stylePrefix: '' },
  { label: 'Editorial photo', stylePrefix: 'Editorial documentary photograph, natural light, shallow depth of field' },
  { label: 'Oil painting', stylePrefix: 'Expressive oil painting, visible brushstrokes, painterly' },
  { label: 'Flat vector', stylePrefix: 'Clean flat vector illustration, bold shapes, minimal' },
  { label: 'Risograph', stylePrefix: 'Risograph print, grainy texture, limited ink colors, offset registration' },
  { label: '3D render', stylePrefix: 'Soft 3D render, studio lighting, matte materials' },
  { label: 'Watercolor', stylePrefix: 'Loose watercolor, soft washes, paper texture' },
]

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** Asset grid + upload + AI generation (style templates + reference image).
 *  Calls `onPick(src, source)` with a usable image src (data URL or remote URL). */
export function ImagePicker({
  assets,
  theme,
  ratio,
  onPick,
}: {
  assets: AssetEntry[]
  theme: Theme
  ratio: AspectRatio
  onPick: (src: string, source: ImageSource) => void
}) {
  const [subject, setSubject] = useState('')
  const [styleIdx, setStyleIdx] = useState(0)
  const [refSrc, setRefSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onUpload = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    onPick(await fileToDataUrl(file), 'upload')
  }

  const onRefUpload = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    setRefSrc(await fileToDataUrl(file))
  }

  const generate = async () => {
    if (!subject.trim()) {
      setError('Describe what to generate.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let referenceImage: string | undefined
      if (refSrc) referenceImage = refSrc.startsWith('data:') ? refSrc : await urlToDataUrl(refSrc)
      const paletteHexes = [theme.colors.accent, theme.colors.accent2].filter(Boolean)
      const res = await fetch('/api/vizmaya/share-cards/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          ratio,
          paletteHexes,
          stylePrefix: STYLE_TEMPLATES[styleIdx].stylePrefix || undefined,
          referenceImage,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      onPick(body.dataUrl, 'generated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2.5">
      {assets.length > 0 && (
        <div>
          <span className={labelCls}>Story assets</span>
          <div className="mt-1 grid max-h-32 grid-cols-4 gap-1.5 overflow-y-auto">
            {assets.map((a) => (
              <button
                key={a.url}
                type="button"
                title={a.filename}
                onClick={() => onPick(a.url, 'asset')}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-white/10 bg-neutral-900 hover:border-white/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" className="max-h-full max-w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className={labelCls}>Upload</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-neutral-100 hover:file:bg-white/20"
        />
      </div>

      <LogoPicker onPick={(dataUrl) => onPick(dataUrl, 'logo')} />

      <div className="space-y-1.5 rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
        <span className={labelCls}>Generate</span>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          rows={2}
          placeholder="Describe the image…"
          className="w-full resize-vertical rounded border border-white/10 bg-neutral-950 p-2 text-[12px] text-neutral-100 outline-none focus:border-white/30"
        />
        <select
          value={styleIdx}
          onChange={(e) => setStyleIdx(Number(e.target.value))}
          className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
        >
          {STYLE_TEMPLATES.map((s, i) => (
            <option key={s.label} value={i}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {refSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refSrc} alt="" className="h-8 w-8 rounded border border-white/10 object-cover" />
              <button onClick={() => setRefSrc(null)} className="text-[11px] text-neutral-400 hover:text-white">
                clear ref
              </button>
            </>
          ) : (
            <label className="cursor-pointer text-[11px] text-neutral-400 hover:text-white">
              + reference image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void onRefUpload(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
        {assets.length > 0 && !refSrc && (
          <div className="grid max-h-20 grid-cols-6 gap-1 overflow-y-auto">
            {assets.map((a) => (
              <button
                key={a.url}
                type="button"
                title={`use ${a.filename} as reference`}
                onClick={() => setRefSrc(a.url)}
                className="flex aspect-square items-center justify-center overflow-hidden rounded border border-white/10 bg-neutral-900 hover:border-white/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" className="max-h-full max-w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => void generate()}
          disabled={busy || !subject.trim()}
          className="w-full rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
        >
          {busy ? 'Generating…' : 'Generate & use'}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    </div>
  )
}
