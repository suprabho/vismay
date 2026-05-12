'use client'

import type { IeaTheme } from './theme'

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

export function IeaThemePreview({ theme }: { theme: Record<string, string> }) {
  const t = theme as Record<keyof IeaTheme, string>
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
          background: alpha(t.surface, 95),
          border: `1px solid ${t.line}`,
        }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: t.muted }}>
          Country profile
        </div>
        <h2 className="text-base font-semibold leading-tight" style={{ color: t.bone }}>
          Germany
        </h2>
        <p className="text-[11px] mt-1.5 font-mono uppercase tracking-[0.18em]" style={{ color: t.muted }}>
          <span style={{ color: t.accent }}>12</span> articles · last 7 days
        </p>
      </div>
      <div
        className="rounded-md p-2.5 mb-3"
        style={{ background: alpha(t.elevated, 60), border: `1px solid ${t.line}` }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: alpha(t.muted, 80) }}>
          May 8
        </div>
        <div className="text-xs leading-snug" style={{ color: t.accentHi }}>
          Renewables hit record share of EU grid
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: t.accent, border: `1px solid ${t.accentEdge}` }}
        />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Active
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accentMid }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Hovered
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accentHi }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accentLo }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Inactive
        </span>
      </div>
    </aside>
  )
}
