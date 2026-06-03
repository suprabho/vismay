import { History, Target } from 'lucide-react';
import type { ProcessedLap, SectorBests } from '../../config/api';
import type { RaceDriver } from '../../hooks/useRaceData';

interface Props {
  driver:       RaceDriver | null;
  laps:         ProcessedLap[];
  loading:      boolean;
  error:        string | null;
  currentLap:   number;
  sectorBests:  SectorBests | null;
}

const COMPOUND_COLOR: Record<string, string> = {
  SOFT:         'bg-f1-red text-white',
  MEDIUM:       'bg-caution-yellow text-neutral-900',
  HARD:         'bg-neutral-200 text-neutral-900',
  INTERMEDIATE: 'bg-gain-green text-white',
  WET:          'bg-telemetry-blue text-white',
  UNKNOWN:      'bg-neutral-300 text-neutral-700',
};

const APPROX_EQ = (a: number, b: number) => Math.abs(a - b) < 0.001;

function formatLap(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function formatSector(sec: number | null | undefined): string {
  return sec != null && sec > 0 ? sec.toFixed(3) : '—';
}

export function LapHistoryTab({ driver, laps, loading, error, currentLap, sectorBests }: Props) {
  if (!driver) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-2 text-neutral-400">
        <Target size={18} />
        <p className="font-mono text-xs text-center">
          Click <Target size={11} className="inline -mt-0.5" /> next to a driver in the side list to focus and load their lap history.
        </p>
      </div>
    );
  }

  const dBest = sectorBests?.driverBests[driver.driverNumber];
  const purp  = sectorBests?.sessionPurple;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-neutral-100 bg-white flex items-center justify-between">
        <h3 className="font-serif text-lg font-bold tracking-tight italic flex items-center gap-2">
          <History className="text-f1-red" size={18} />
          Laps · {driver.abbreviation}
        </h3>
        <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">
          {laps.length} laps
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
      {loading && <p className="font-mono text-xs text-neutral-400">Loading laps…</p>}
      {error   && <p className="font-mono text-[11px] text-red-500">Lap fetch failed: {error}</p>}

      {!loading && !error && laps.length === 0 && (
        <p className="font-mono text-xs text-neutral-400">
          No processed laps for this driver.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[11px]">
          <thead className="text-[9px] uppercase tracking-widest text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className="text-left py-1.5">L</th>
              <th className="text-left py-1.5">Time</th>
              <th className="text-right py-1.5">S1</th>
              <th className="text-right py-1.5">S2</th>
              <th className="text-right py-1.5">S3</th>
              <th className="text-center py-1.5">Tyre</th>
              <th className="text-center py-1.5">Evt</th>
            </tr>
          </thead>
          <tbody>
            {[...laps].sort((a, b) => a.lap - b.lap).map(lap => {
              const isCurrent = lap.lap === currentLap;
              const incomplete = lap.lapTimeSec == null || lap.events.includes('incomplete');
              const colorSector = (idx: number, t: number | null | undefined) => {
                if (t == null || t <= 0) return 'text-neutral-400';
                const key = (['s1', 's2', 's3'] as const)[idx];
                if (purp && purp[key] && APPROX_EQ(t, purp[key]!.time) && purp[key]!.driverNumber === driver.driverNumber) {
                  return 'text-[#A855F7] font-bold';
                }
                if (dBest && APPROX_EQ(t, dBest[key])) return 'text-gain-green font-bold';
                return 'text-neutral-700';
              };
              const compoundClass = COMPOUND_COLOR[lap.compound] ?? COMPOUND_COLOR.UNKNOWN;
              return (
                <tr
                  key={lap.lap}
                  className={`border-b border-neutral-100 ${isCurrent ? 'bg-f1-red/5' : 'hover:bg-neutral-50'} ${incomplete ? 'opacity-60' : ''}`}
                >
                  <td className="py-1.5 text-neutral-500">{lap.lap}</td>
                  <td className={`py-1.5 font-bold ${incomplete ? 'text-neutral-400 italic' : 'text-neutral-900'}`}>{formatLap(lap.lapTimeSec)}</td>
                  <td className={`py-1.5 text-right ${colorSector(0, lap.sectors[0])}`}>{formatSector(lap.sectors[0])}</td>
                  <td className={`py-1.5 text-right ${colorSector(1, lap.sectors[1])}`}>{formatSector(lap.sectors[1])}</td>
                  <td className={`py-1.5 text-right ${colorSector(2, lap.sectors[2])}`}>{formatSector(lap.sectors[2])}</td>
                  <td className="py-1.5 text-center">
                    <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase ${compoundClass}`}>
                      {lap.compound.charAt(0)}
                      <span className="ml-0.5 opacity-70">{lap.stintLap}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-center text-[9px] text-neutral-500">
                    {lap.events.map(e => (
                      <span
                        key={e}
                        className={`inline-block ml-0.5 px-1 ${
                          e === 'pit_in'        ? 'bg-neutral-900 text-white' :
                          e === 'sc_deployed'   ? 'bg-caution-yellow text-neutral-900' :
                          e === 'personal_best' ? 'bg-gain-green text-white' :
                          e === 'incomplete'    ? 'bg-neutral-300 text-neutral-700 italic' :
                          'bg-neutral-200 text-neutral-700'
                        }`}
                        title={e}
                      >
                        {e === 'pit_in' ? 'P' : e === 'sc_deployed' ? 'SC' : e === 'personal_best' ? 'PB' : e === 'incomplete' ? 'INC' : e[0]}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
