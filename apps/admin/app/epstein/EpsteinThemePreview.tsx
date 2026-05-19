'use client'

import type { EpsteinTheme } from './theme'

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

export function EpsteinThemePreview({ theme }: { theme: Record<string, string> }) {
  const t = theme as Record<keyof EpsteinTheme, string>
  return (
    <aside
      className="border-t md:border-t-0 md:border-l border-white/5 p-5 md:sticky md:top-[60px] md:self-start"
      style={{ background: t.ink, color: t.bone }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: t.muted }}>
        Preview
      </p>
      <div
        className="rounded-lg p-4 mb-3"
        style={{
          background: alpha(t.surface, 85),
          border: `1px solid ${alpha(t.bone, 10)}`,
        }}
      >
        <h2
          className="text-base leading-tight"
          style={{ fontFamily: 'var(--font-fraunces), serif', color: t.bone }}
        >
          The Epstein Flight Network
        </h2>
        <p
          className="text-[11px] mt-1 font-mono uppercase tracking-[0.18em]"
          style={{ color: t.muted }}
        >
          <span style={{ color: t.ember }}>320</span> legs
          <span className="mx-1.5 opacity-50">·</span>
          <span style={{ color: t.ember }}>52</span> airports
        </p>
      </div>
      <div className="flex gap-2 mb-3">
        <span
          className="px-3 py-1 rounded-full text-[10px] font-mono uppercase"
          style={{ background: t.ember, color: t.ink }}
        >
          flights
        </span>
        <span
          className="px-3 py-1 rounded-full text-[10px] font-mono uppercase"
          style={{ color: alpha(t.bone, 55), border: `1px solid ${alpha(t.bone, 10)}` }}
        >
          airports
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.ember }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 50) }}>
          Airport
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.steel }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 50) }}>
          Flight dest.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.rose }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 50) }}>
          Black Book
        </span>
      </div>
    </aside>
  )
}
