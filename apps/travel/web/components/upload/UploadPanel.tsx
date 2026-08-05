'use client'

import { useState } from 'react'
import { MAX_EDGE, uploadOne } from '@/lib/uploadClient'
import type { UploadedFile } from '@/lib/uploadClient'

/**
 * Phone-friendly bulk media upload: pick a trip, pick photos/videos, each file
 * goes through the shared sign→downscale→PUT flow in lib/uploadClient.ts
 * (browser-direct to Supabase Storage; GPS EXIF stripped by the downscale).
 *
 * For tagging, captions and selection, use /curate — new uploads land there
 * as "new" items until tagged.
 */
export default function UploadPanel({ slugs }: { slugs: string[] }) {
  const [slug, setSlug] = useState(slugs[0] ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<UploadedFile[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !slug) return
    setError(null)
    for (const file of Array.from(fileList)) {
      setBusy(file.name)
      try {
        const uploaded = await uploadOne(slug, file)
        setDone((d) => [...d, uploaded])
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
            Uploaded {done.length} file{done.length === 1 ? '' : 's'} — tag them in{' '}
            <a href={`/curate?trip=${slug}`} className="underline">
              /curate
            </a>
            :
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
