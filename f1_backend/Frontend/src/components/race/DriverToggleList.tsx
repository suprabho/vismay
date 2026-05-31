import { Target } from 'lucide-react';
import type { RaceDriver } from '../../hooks/useRaceData';
import type { StandingsSortMode } from '../../pages/RacePage';

interface Props {
  drivers:           RaceDriver[];
  /** Drivers that actually have ingested position tracks. Others greyed out. */
  withPositions:     Set<number>;
  visible:           Set<number>;
  focusedDriver:     number | null;
  liveStandings:     Map<number, number>;
  sortMode:          StandingsSortMode;
  onSortModeChange:  (m: StandingsSortMode) => void;
  onToggle:          (dn: number) => void;
  onToggleAll:       (visible: boolean) => void;
  onFocus:           (dn: number | null) => void;
}

export function DriverToggleList({
  drivers, withPositions, visible, focusedDriver,
  liveStandings, sortMode, onSortModeChange,
  onToggle, onToggleAll, onFocus,
}: Props) {
  const sortKey = (d: RaceDriver): number => {
    if (sortMode === 'live') {
      const p = liveStandings.get(d.driverNumber);
      return p == null || !Number.isFinite(p) ? Number.POSITIVE_INFINITY : p;
    }
    return d.championshipPosition ?? Number.POSITIVE_INFINITY;
  };

  const sorted = [...drivers].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka !== kb) return ka - kb;
    return a.driverNumber - b.driverNumber;
  });
  const allOn = sorted.every(d => visible.has(d.driverNumber));

  return (
    <div className="border border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 bg-neutral-50">
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-bold">
          Drivers ({visible.size}/{sorted.length})
        </span>
        <button
          onClick={() => onToggleAll(!allOn)}
          className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-f1-red transition-colors"
        >
          {allOn ? 'Hide all' : 'Show all'}
        </button>
      </div>
      <div className="flex border-b border-neutral-200 bg-white">
        {(['championship', 'live'] as const).map(m => (
          <button
            key={m}
            onClick={() => onSortModeChange(m)}
            className={`flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors ${
              sortMode === m
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {m === 'championship' ? 'Champ' : 'Live'}
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {sorted.map(d => {
          const isOn     = visible.has(d.driverNumber);
          const hasTrack = withPositions.has(d.driverNumber);
          const focused  = focusedDriver === d.driverNumber;
          const colour   = d.teamColour || '#888';
          const livePos  = liveStandings.get(d.driverNumber);
          const liveLabel = livePos != null && Number.isFinite(livePos) ? `P${livePos}` : '—';
          const champLabel = d.championshipPosition != null ? `P${d.championshipPosition}` : '—';
          const posLabel = sortMode === 'live' ? liveLabel : champLabel;
          return (
            <div
              key={d.driverNumber}
              className={`flex items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-0 transition-colors ${
                hasTrack ? 'hover:bg-neutral-50' : 'opacity-40'
              } ${focused ? 'bg-f1-red/5 border-l-2 border-l-f1-red pl-2.5' : ''}`}
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
                  className={`inline-block w-3 h-3 rounded-full border ${isOn ? '' : 'opacity-25'}`}
                  style={{ backgroundColor: colour, borderColor: colour }}
                />
              </button>

              <span
                className={`font-mono text-[10px] font-bold w-8 text-center px-1 ${
                  sortMode === 'live'
                    ? 'bg-f1-red text-white'
                    : 'bg-neutral-900 text-white'
                }`}
                title={sortMode === 'live' ? 'Live race position' : 'Championship position'}
              >
                {posLabel}
              </span>
              <span className="font-mono text-[11px] text-neutral-400 w-6">#{d.driverNumber}</span>
              <span className="font-mono text-xs font-bold text-neutral-900 w-12">{d.abbreviation || '—'}</span>
              <span className="font-mono text-[10px] text-neutral-500 flex-1 truncate">{d.fullName || ''}</span>

              {/* Focus button */}
              <button
                type="button"
                disabled={!hasTrack}
                onClick={() => onFocus(focused ? null : d.driverNumber)}
                title={focused ? 'Unfocus' : 'Focus this driver'}
                className={`p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  focused ? 'text-f1-red' : 'text-neutral-300 hover:text-neutral-700'
                }`}
              >
                <Target size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
