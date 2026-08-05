'use client'

import { useState } from 'react'

/**
 * Phone-friendly media upload: pick a trip, pick photos/videos, and each
 * file is (1) downscaled in the browser when it's a large image — max edge
 * 2560 px, JPEG q0.82, which also strips GPS EXIF before anything leaves
 * the device — then (2) PUT straight to Supabase Storage via a signed URL
 * from /api/upload/sign (same two-step flow as the admin Assets panel;
 * proxying bodies through Vercel 413s at ~4.5 MB).
 *
 * After uploading, each file's `assets://` ref is listed for pasting into
 * the media manifest / story config (or hand to Claude via a phone prompt).
 */

const MAX_EDGE = 2560
const JPEG_QUALITY = 0.82
const SKIP_RESIZE_UNDER_BYTES = 500 * 1024

interface Done {
  filename: string
  assetRef: string
  url: string
}

async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', JPEG_QUALITY)
  )
}

export default function UploadPanel({ slugs }: { slugs: string[] }) {
  const [slug, setSlug] = useState(slugs[0] ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Done[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !slug) return
    setError(null)
    for (const file of Array.from(fileList)) {
      setBusy(file.name)
      try {
        const isImage = file.type.startsWith('image/')
        const shouldResize =
          isImage && file.type !== 'image/gif' && file.size > SKIP_RESIZE_UNDER_BYTES

        let body: Blob = file
        let filename = file.name
        let contentType = file.type || 'application/octet-stream'
        if (shouldResize) {
          body = await downscaleImage(file)
          filename = filename.replace(/\.[^.]+$/, '') + '.jpg'
          contentType = 'image/jpeg'
        }

        const signRes = await fetch('/api/upload/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, filename, contentType }),
        })
        if (!signRes.ok) {
          const b = await signRes.json().catch(() => null)
          throw new Error(b?.error ?? `sign failed (HTTP ${signRes.status})`)
        }
        const signed = (await signRes.json()) as Done & { signedUrl: string; contentType: string }
        const putRes = await fetch(signed.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': signed.contentType, 'x-upsert': 'true' },
          body,
        })
        if (!putRes.ok) {
          const b = await putRes.json().catch(() => null)
          throw new Error(b?.message ?? b?.error ?? `upload failed (HTTP ${putRes.status})`)
        }
        setDone((d) => [...d, { filename: signed.filename, assetRef: signed.assetRef, url: signed.url }])
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`)
        break
      } finally {
        setBusy(null)
      }
    }
  }

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium">Trip</span>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
        >
          {slugs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Photos / videos (mp4)</span>
        <input
          type="file"
          accept="image/*,video/mp4"
          multiple
          disabled={!slug || busy != null}
          onChange={(e) => void handleFiles(e.target.files)}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0
                     file:bg-[#2b2419] file:text-[#fffdf8] file:px-4 file:py-2 file:text-sm"
        />
        <span className="mt-1 block text-xs opacity-60">
          Large photos are downscaled to {MAX_EDGE}px on-device before upload (this also
          strips location EXIF). Videos upload as-is — mp4 only.
        </span>
      </label>

      {busy && <p className="text-sm animate-pulse">Uploading {busy}…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {done.length > 0 && (
        <div className="rounded-lg border border-black/10 bg-white p-3">
          <p className="text-sm font-medium mb-2">
            Uploaded {done.length} file{done.length === 1 ? '' : 's'} — refs for the manifest:
          </p>
          <ul className="space-y-1 text-xs font-mono break-all">
            {done.map((d) => (
              <li key={d.assetRef}>
                <a href={d.url} target="_blank" rel="noreferrer" className="underline">
                  {d.assetRef}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
