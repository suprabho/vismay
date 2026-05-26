'use client'

import type { CokeStudioTheme } from './theme'

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

// Mini-preview of the /coke-studio epic palette. Renders inside the admin
// theme editor so the user can see how their overrides land on a place card,
// pin states, and the three pin categories without leaving the editor.
export function CokeStudioThemePreview({ theme }: { theme: Record<string, string> }) {
  const t = theme as Record<keyof CokeStudioTheme, string>

  return (
    <aside
      className="border-t md:border-t-0 md:border-l border-white/5 p-5 md:sticky md:top-[60px] md:self-start"
      style={{ background: t.ink, color: t.bone }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: t.muted }}>
        Preview
      </p>

      {/* Place card */}
      <div
        className="rounded-lg p-4 mb-3"
        style={{
          background: alpha(t.surface, 95),
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          className="text-[10px] uppercase tracking-widest mb-1 flex items-center gap-1.5"
          style={{ color: t.accent }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: t.pinSacred }}
          />
          Coke Studio Pakistan
        </div>
        <h2 className="text-base font-semibold leading-tight" style={{ color: t.bone }}>
          Lahore
        </h2>
        <p className="text-[11px] mt-1.5 font-mono" style={{ color: alpha(t.bone, 55) }}>
          Pakistan · Mughal Lahore
        </p>
        <p className="text-[11px] mt-1 font-mono uppercase tracking-[0.18em]" style={{ color: t.muted }}>
          Top context · <span style={{ color: t.accentHi }}>Beloved</span>
        </p>
      </div>

      {/* Pin categories */}
      <div
        className="rounded-md p-2.5 mb-3"
        style={{ background: alpha(t.elevated, 60), border: `1px solid ${t.line}` }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: alpha(t.muted, 90) }}>
          Pin categories
        </div>
        <div className="flex items-center gap-2.5">
          {[
            { label: 'Settlement', color: t.pinSettlement },
            { label: 'Sacred', color: t.pinSacred },
            { label: 'Nature', color: t.pinNature },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 9,
                  height: 9,
                  background: b.color,
                  border: `1px solid ${alpha(t.accentEdge, 60)}`,
                }}
              />
              <span className="text-[10px]" style={{ color: alpha(t.bone, 80) }}>
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pin states */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: t.accent, border: `1px solid ${t.accentEdge}` }}
        />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Active pin
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
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accentLo }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(t.bone, 60) }}>
          Low-mention
        </span>
      </div>

      {/* Map slot swatches */}
      <div
        className="rounded-md p-2.5"
        style={{ background: alpha(t.elevated, 60), border: `1px solid ${t.line}` }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: alpha(t.muted, 90) }}>
          Base map
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['mapLand', 'Land'],
              ['mapWater', 'Water'],
              ['mapBorder', 'Border'],
              ['mapLabelText', 'Label'],
              ['mapLabelHalo', 'Halo'],
              ['mapBuilding', 'Building'],
            ] as [keyof CokeStudioTheme, string][]
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col items-start gap-1">
              <span
                className="w-full h-4 rounded-sm border"
                style={{ background: t[key], borderColor: alpha(t.bone, 12) }}
              />
              <span className="text-[9px] font-mono" style={{ color: alpha(t.bone, 55) }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
