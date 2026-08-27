'use client'

import { resolveAssetUrl } from '@vismay/viz-engine'
import type { StopMedia, TripDay, TripStop } from '@/lib/trips'

/**
 * Stop detail panel: bottom sheet on small screens, right-side panel on
 * desktop. Shows the stop's time/emoji/name/tag/desc/tip/suggestedBy plus a
 * horizontally scrollable media strip; tapping a thumbnail opens the
 * lightbox via `onOpenMedia`.
 */
export default function StopSheet({
  day,
  stop,
  onClose,
  onOpenMedia,
}: {
  day: TripDay
  stop: TripStop
  onClose: () => void
  onOpenMedia: (media: StopMedia) => void
}) {
  return (
    <aside
      className="absolute z-20 bg-[#fffdf8] shadow-2xl border border-black/10 overflow-y-auto
                 inset-x-0 bottom-0 max-h-[60%] rounded-t-2xl
                 md:inset-x-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-[360px] md:rounded-2xl"
      aria-label={stop.name}
    >
      <div className="sticky top-0 flex items-start gap-3 px-4 pt-4 pb-2 bg-[#fffdf8]">
        <div
          className="mt-0.5 w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg"
          style={{ background: `${day.color}22`, border: `2px solid ${day.color}` }}
          aria-hidden
        >
          {stop.emoji || '📍'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium opacity-60">
            {[day.label ?? (day.n != null ? `Day ${day.n}` : day.title), stop.time]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h2 className="text-lg font-semibold leading-tight">{stop.name}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-sm"
        >
          ✕
        </button>
      </div>

      <div className="px-4 pb-5 space-y-3">
        {stop.tag && (
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: `${day.color}1a`, color: day.color }}
          >
            {stop.tag}
          </span>
        )}

        {stop.media.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 py-1">
            {stop.media.map((m) => (
              <button
                key={m.file}
                onClick={() => onOpenMedia(m)}
                className="relative shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-black/5 border border-black/10"
                aria-label={m.caption ?? m.file}
              >
                {m.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(m.ref)}
                    alt={m.caption ?? ''}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      src={resolveAssetUrl(m.ref)}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow"
                    >
                      ▶
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {stop.desc && <p className="text-sm leading-relaxed">{stop.desc}</p>}
        {stop.tip && <p className="text-sm leading-relaxed opacity-70">💡 {stop.tip}</p>}
        {stop.suggestedBy && stop.suggestedBy.length > 0 && (
          <p className="text-xs opacity-50">
            Suggested by {stop.suggestedBy.join(', ')}
          </p>
        )}
      </div>
    </aside>
  )
}
