'use client'

import { useEffect } from 'react'
import { resolveAssetUrl } from '@vismay/viz-engine'
import type { StopMedia } from '@/lib/trips'

/** Full-bleed photo/video viewer. Backdrop click or Escape closes. */
export default function MediaLightbox({
  media,
  onClose,
}: {
  media: StopMedia
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const url = resolveAssetUrl(media.ref)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg"
      >
        ✕
      </button>
      <div className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
        {media.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={media.caption ?? ''}
            className="max-w-full max-h-[85svh] object-contain rounded"
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85svh] rounded"
          />
        )}
        {media.caption && (
          <p className="mt-3 text-center text-sm text-white/80">{media.caption}</p>
        )}
      </div>
    </div>
  )
}
