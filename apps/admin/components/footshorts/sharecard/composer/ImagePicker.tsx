'use client'

import { useState } from 'react'
import { SHARE_IMAGE_STYLES } from '@/lib/footshortsShareStyles'
import type { AspectRatio, NewsItem } from '../types'
import { proxiedImage } from '../modules/shared'
import { inputCls, labelCls, selectCls } from './controls'

export type ImageSource = 'upload' | 'generated' | 'news'

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** Turn any image source into a base64 data URL the generate route accepts as a
 *  `referenceImage`. A remote URL (e.g. a news thumbnail) is routed through the
 *  same-origin proxy first so the cross-origin fetch + canvas read both succeed. */
async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const res = await fetch(proxiedImage(url))
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** Upload + AI-generate + news-thumbnail picker for image overlays. Generation
 *  reuses the footshorts share image route + curated styles, so output stays on
 *  brand. Calls `onPick(src, source)` with a usable image src (data URL for
 *  upload/generated, remote URL for news — the canvas proxies remote sources). */
export function ImagePicker({
  ratio,
  paletteHexes,
  news,
  onPick,
}: {
  ratio: AspectRatio
  paletteHexes: string[]
  news: NewsItem[] | null
  onPick: (src: string, source: ImageSource) => void
}) {
  const [subject, setSubject] = useState('')
  const [styleId, setStyleId] = useState(SHARE_IMAGE_STYLES[0]!.id)
  const [refSrc, setRefSrc] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [refQuery, setRefQuery] = useState('')
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
      // A reference image conditions the generation — the route switches to the
      // multimodal model when one is present. News refs are remote URLs, so
      // resolve them to a data URL (via the proxy) the route can decode.
      const referenceImage = refSrc ? await urlToDataUrl(refSrc) : undefined
      const res = await fetch('/api/footshorts/share/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId,
          subject,
          ratio,
          model: 'image.default',
          paletteHexes: paletteHexes.filter(Boolean),
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

  const newsWithImage = (news ?? []).filter((n) => n.image_url)
  const matchHeadline = (q: string) => {
    const s = q.trim().toLowerCase()
    return s ? newsWithImage.filter((n) => n.headline.toLowerCase().includes(s)) : newsWithImage
  }
  const filteredNews = matchHeadline(query)
  const filteredRefNews = matchHeadline(refQuery)

  return (
    <div className="space-y-2.5">
      <div>
        <span className={labelCls}>Upload</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-neutral-100 hover:file:bg-white/20"
        />
      </div>

      <div className="space-y-1.5 rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
        <span className={labelCls}>Generate</span>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          rows={2}
          placeholder="Describe the image…"
          className="w-full resize-vertical rounded border border-white/10 bg-neutral-950 p-2 text-[12px] text-neutral-100 outline-none focus:border-white/30"
        />
        <select value={styleId} onChange={(e) => setStyleId(e.target.value)} className={selectCls}>
          {SHARE_IMAGE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {refSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refSrc.startsWith('data:') ? refSrc : proxiedImage(refSrc)} alt="" className="h-8 w-8 rounded border border-white/10 object-cover" />
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
        {newsWithImage.length > 0 && !refSrc && (
          <>
            <input
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="Search news for a reference…"
              className={inputCls}
            />
            <div className="grid max-h-20 grid-cols-6 gap-1 overflow-y-auto">
              {filteredRefNews.slice(0, 18).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  title={`use “${n.headline}” as reference`}
                  onClick={() => setRefSrc(n.image_url!)}
                  className="flex aspect-square items-center justify-center overflow-hidden rounded border border-white/10 bg-neutral-900 hover:border-white/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.image_url!} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {filteredRefNews.length === 0 && (
                <p className="col-span-6 py-1.5 text-[11px] text-neutral-600">No news matches “{refQuery.trim()}”.</p>
              )}
            </div>
          </>
        )}
        <button
          onClick={() => void generate()}
          disabled={busy || !subject.trim()}
          className="w-full rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
        >
          {busy ? 'Generating…' : 'Generate & add'}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      {newsWithImage.length > 0 && (
        <div>
          <span className={labelCls}>News thumbnails</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search news…"
            className={inputCls}
          />
          <div className="mt-1.5 grid max-h-32 grid-cols-4 gap-1.5 overflow-y-auto">
            {filteredNews.slice(0, 30).map((n) => (
              <button
                key={n.id}
                type="button"
                title={n.headline}
                onClick={() => onPick(n.image_url!, 'news')}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-white/10 bg-neutral-900 hover:border-white/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={n.image_url!} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {filteredNews.length === 0 && (
              <p className="col-span-4 py-2 text-[11px] text-neutral-600">No news matches “{query.trim()}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
