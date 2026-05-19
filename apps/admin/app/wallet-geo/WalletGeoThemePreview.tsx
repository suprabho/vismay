'use client'

import type { WalletGeoTheme } from './theme'

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

// Mini-preview of the /wallet-geo epic palette. Renders inside the admin theme
// editor so the user can see how their overrides land on a country card, the
// choropleth ramp, and the pin states without leaving the editor.
export function WalletGeoThemePreview({ theme }: { theme: Record<string, string> }) {
  const t = theme as Record<keyof WalletGeoTheme, string>

  // Mirror walletGeoChoroplethStops() in app/wallet-geo/theme.ts. Kept inline
  // here so the preview stays a pure client component without pulling in the
  // theme module's full type surface.
  const stops = [t.accentLo, '#0e88a3', t.accent, t.accentMid, t.accentHi]
  const buckets = ['< 5k', '5k–20k', '20k–50k', '50k–100k', '> 100k']

  return (
    <aside
      className="border-t md:border-t-0 md:border-l border-white/5 p-5 md:sticky md:top-[60px] md:self-start"
      style={{ background: t.ink, color: t.bone }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: t.muted }}>
        Preview
      </p>

      {/* Country card */}
      <div
        className="rounded-lg p-4 mb-3"
        style={{
          background: alpha(t.surface, 95),
          border: `1px solid ${t.line}`,
        }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: t.accent }}>
          Wallet geography
        </div>
        <h2 className="text-base font-semibold leading-tight" style={{ color: t.bone }}>
          India
        </h2>
        <p className="text-[11px] mt-1.5 font-mono" style={{ color: alpha(t.bone, 55) }}>
          184,320 addresses observed
        </p>
        <p className="text-[11px] mt-1 font-mono uppercase tracking-[0.18em]" style={{ color: t.muted }}>
          Top IP type · <span style={{ color: t.accentHi }}>Residential 41%</span>
        </p>
      </div>

      {/* Choropleth ramp */}
      <div
        className="rounded-md p-2.5 mb-3"
        style={{ background: alpha(t.elevated, 60), border: `1px solid ${t.line}` }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: alpha(t.muted, 90) }}>
          Address volume buckets
        </div>
        <div className="flex items-center gap-1.5">
          {stops.map((s, i) => (
            <div key={i} className="flex-1 min-w-0">
              <div className="h-3 rounded-sm" style={{ background: s }} />
              <div className="text-[8px] font-mono mt-1 truncate" style={{ color: alpha(t.bone, 55) }}>
                {buckets[i]}
              </div>
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
          Low-volume
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
            ] as [keyof WalletGeoTheme, string][]
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
