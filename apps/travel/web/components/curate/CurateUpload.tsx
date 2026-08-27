'use client'

import { useRef, useState } from 'react'
import { uploadOne } from '@/lib/uploadClient'

/**
 * "+ Add photos" for /curate: sign→PUT each file (shared uploadClient), then
 * register it in travel_trip_media tagged with the currently active filters.
 */
export default function CurateUpload({
  slug,
  defaultDay,
  defaultStop,
  onUploaded,
}: {
  slug: string
  defaultDay: number | null
  defaultStop: string | null
  onUploaded: () => void | Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !slug) return
    setError(null)
    for (const file of Array.from(fileList)) {
      setBusy(file.name)
      try {
        const done = await uploadOne(slug, file)
        const patch: Record<string, unknown> = defaultStop
          ? { stop: defaultStop }
          : { day: defaultDay }
        patch.kind = done.contentType.startsWith('video/') ? 'video' : 'image'
        const res = await fetch(`/api/media/${slug}/${encodeURIComponent(done.filename)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          throw new Error((await res.json().catch(() => null))?.error ?? 'tagging failed')
        }
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`)
        break
      } finally {
        setBusy(null)
      }
    }
    if (inputRef.current) inputRef.current.value = ''
    await onUploaded()
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy != null}
        className="rounded-full bg-[#2b2419] px-4 py-2 text-sm text-[#fffdf8] disabled:opacity-50"
      >
        + Add photos
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {busy && <span className="animate-pulse text-sm">Uploading {busy}…</span>}
      {!busy && (defaultStop || defaultDay != null) && (
        <span className="text-xs opacity-60">
          new uploads tagged {defaultStop ? `→ ${defaultStop}` : `→ day ${defaultDay}`}
        </span>
      )}
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  )
}
