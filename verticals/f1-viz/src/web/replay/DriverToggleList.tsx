import type { RaceDriver } from './types'
import { TargetIcon } from './icons'

export type StandingsSortMode = 'championship' | 'live'

interface Props {
  drivers: RaceDriver[]
  /** Drivers that actually have ingested position tracks. Others greyed out. */
  withPositions: Set<number>
  visible: Set<number>
  focusedDriver: number | null
  liveStandings: Map<number, number>
  sortMode: StandingsSortMode
  onSortModeChange: (m: StandingsSortMode) => void
  onToggle: (dn: number) => void
  onToggleAll: (visible: boolean) => void
  onFocus: (dn: number | null) => void
}

export function DriverToggleList({
  drivers,
  withPositions,
  visible,
  focusedDriver,
  liveStandings,
  sortMode,
  onSortModeChange,
  onToggle,
  onToggleAll,
  onFocus,
}: Props) {
  const sortKey = (d: RaceDriver): number => {
    if (sortMode === 'live') {
      const p = liveStandings.get(d.driverNumber)
      return p == null || !Number.isFinite(p) ? Number.POSITIVE_INFINITY : p
    }
    return d.championshipPosition ?? Number.POSITIVE_INFINITY
  }

  const sorted = [...drivers].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (ka !== kb) return ka - kb
    return a.driverNumber - b.driverNumber
  })
  const allOn = sorted.length > 0 && sorted.every((d) => visible.has(d.driverNumber))

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted">
          Drivers ({visible.size}/{sorted.length})
        </span>
        <button
          onClick={() => onToggleAll(!allOn)}
          className="font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-accent"
        >
          {allOn ? 'Hide all' : 'Show all'}
        </button>
      </div>
      <div className="flex border-b border-border">
        {(['championship', 'live'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onSortModeChange(m)}
            className={`flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors ${
              sortMode === m ? 'bg-accent text-accent-text' : 'text-muted hover:text-text'
            }`}
          >
            {m === 'championship' ? 'Champ' : 'Live'}
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {sorted.map((d) => {
          const isOn = visible.has(d.driverNumber)
          const hasTrack = withPositions.has(d.driverNumber)
          const focused = focusedDriver === d.driverNumber
          const colour = d.teamColour || '#888'
          const livePos = liveStandings.get(d.driverNumber)
          const liveLabel = livePos != null && Number.isFinite(livePos) ? `P${livePos}` : '—'
          const champLabel = d.championshipPosition != null ? `P${d.championshipPosition}` : '—'
          const posLabel = sortMode === 'live' ? liveLabel : champLabel
          return (
            <div
              key={d.driverNumber}
              className={`flex items-center gap-2 border-b border-border/60 px-3 py-2 transition-colors last:border-0 ${
                hasTrack ? 'hover:bg-bg' : 'opacity-40'
              } ${focused ? 'border-l-2 border-l-accent bg-accent/10 pl-2.5' : ''}`}
            >
              {/* Visibility toggle */}
              <button
                type="button"
                disabled={!hasTrack}
                onClick={() => onToggle(d.driverNumber)}
                title={hasTrack ? (isOn ? 'Hide on track' : 'Show on track') : 'No positions ingested'}
                className="disabled:cursor-not-allowed"
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full border ${isOn ? '' : 'opacity-25'}`}
                  style={{ backgroundColor: colour, borderColor: colour }}
                />
              </button>

              <span
                className={`w-8 px-1 text-center font-mono text-[10px] font-bold ${
                  sortMode === 'live' ? 'bg-accent text-accent-text' : 'bg-[#262b3b] text-text'
                }`}
                title={sortMode === 'live' ? 'Live race position' : 'Championship position'}
              >
                {posLabel}
              </span>
              <span className="w-6 font-mono text-[11px] text-muted">#{d.driverNumber}</span>
              <span className="w-12 font-mono text-xs font-bold text-text">{d.abbreviation || '—'}</span>
              <span className="flex-1 truncate font-mono text-[10px] text-muted">{d.fullName || ''}</span>

              {/* Focus button */}
              <button
                type="button"
                disabled={!hasTrack}
                onClick={() => onFocus(focused ? null : d.driverNumber)}
                title={focused ? 'Unfocus' : 'Focus this driver'}
                className={`p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  focused ? 'text-accent' : 'text-muted hover:text-text'
                }`}
              >
                <TargetIcon size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
