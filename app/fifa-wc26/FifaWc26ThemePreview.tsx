'use client'

import type { FifaWc26Theme } from './theme'

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

export function FifaWc26ThemePreview({ theme }: { theme: Record<string, string> }) {
  const t = theme as Record<keyof FifaWc26Theme, string>
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
          Team profile
        </div>
        <h2 className="text-base font-semibold leading-tight" style={{ color: t.bone }}>
          England
        </h2>
        <p className="text-[11px] mt-1.5 font-mono uppercase tracking-[0.18em]" style={{ color: t.muted }}>
          UEFA · <span style={{ color: t.accentHi }}>€1.30 bn</span> squad
        </p>
      </div>
      <div
        className="rounded-md p-2.5 mb-3"
        style={{ background: alpha(t.elevated, 60), border: `1px solid ${t.line}` }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: alpha(t.muted, 80) }}>
          #1 of 48 · squad value
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: alpha(t.bone, 8) }}>
          <div className="h-full" style={{ width: '98%', background: t.accent }} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-sm"
          style={{ background: t.accent, border: `1px solid ${t.accentEdge}` }}
        />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Categorical fill
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.accentMid }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Hovered
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.accentHi }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Selected / outline
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.accentLo }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          No data
        </span>
      </div>
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-1.5" style={{ color: alpha(t.bone, 55) }}>
        Choropleth ramp
      </div>
      <div
        className="h-2.5 rounded-full mb-1"
        style={{
          background: `linear-gradient(to right, ${t.ramp1}, ${t.ramp2}, ${t.ramp3}, ${t.ramp4}, ${t.ramp5})`,
          border: `1px solid ${alpha(t.bone, 10)}`,
        }}
      />
      <div className="flex justify-between text-[10px] font-mono" style={{ color: alpha(t.bone, 55) }}>
        <span>low</span>
        <span>peak</span>
      </div>
    </aside>
  )
}
